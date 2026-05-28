const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Email-Import-Token, X-Message-Id',
};

const REQUEST_TYPE_LABELS = [
  'UNFIT',
  'Workshop /Unfit',
  'RST CM',
  'RST PM',
  'WASH',
  'TLC Comms',
  'ML Fault',
  'HVAC TESTING',
  'Deep Cleaning',
  'INBOUND (G to C)',
  'CC Tech/Func. Alarm',
  'Door Issue',
  'Training',
  'APU alarm',
  'Other',
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: jsonHeaders });
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS entity_records (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity ON entity_records(entity)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity_updated ON entity_records(entity, updated_at)`).run();
}

function safeParseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

async function readIncomingPayload(request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await request.text();
    return safeParseJson(body, {}) || {};
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  const text = await request.text();
  return safeParseJson(text, null) || { body: text };
}

function normalizeTrainId(value) {
  const cleaned = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return '';

  const numericMatch = cleaned.match(/^T?(\d{1,2})$/);
  if (numericMatch) {
    return String(Number(numericMatch[1])).padStart(2, '0');
  }

  return cleaned.replace(/^T/, '');
}

function uniqueTrainIds(values = []) {
  const seen = new Set();
  const output = [];

  values.forEach((value) => {
    const id = normalizeTrainId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    output.push(id);
  });

  return output;
}

function extractTrainIds(text = '', explicitTrainIds) {
  if (Array.isArray(explicitTrainIds)) return uniqueTrainIds(explicitTrainIds);
  if (typeof explicitTrainIds === 'string' && explicitTrainIds.trim()) {
    return uniqueTrainIds(explicitTrainIds.split(/[\s,;/]+/));
  }

  const normalizedText = String(text || '').replace(/[，、]/g, ',');
  const firstRequestKeywordIndex = normalizedText.search(/\b(requested|request|req|for|inbound|outbound|wash|pm|cm|unfit)\b/i);
  const trainZone = firstRequestKeywordIndex > 0
    ? normalizedText.slice(0, firstRequestKeywordIndex)
    : normalizedText;

  const ids = [];
  const regex = /\bT?0?([1-9]|[1-4][0-9]|50)\b/gi;
  let match;
  while ((match = regex.exec(trainZone))) {
    ids.push(match[0]);
  }

  // Fallback for cleaner webhook payloads where train numbers appear after labels.
  if (ids.length === 0) {
    const fallbackRegex = /\bT?0?([1-9]|[1-4][0-9]|50)\b/gi;
    while ((match = fallbackRegex.exec(normalizedText))) {
      ids.push(match[0]);
    }
  }

  return uniqueTrainIds(ids);
}

function normalizeCustomType(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function detectRequestType(text = '', payload = {}) {
  const explicitType = String(payload.requestType || payload.type || '').trim();
  const explicitCustom = String(payload.customType || payload.custom_type || '').trim();

  if (explicitType) {
    if (explicitType.toLowerCase() === 'other' || explicitCustom) {
      return {
        requestType: 'Other',
        customType: normalizeCustomType(explicitCustom || explicitType),
      };
    }

    const matchedType = REQUEST_TYPE_LABELS.find((label) => label.toLowerCase() === explicitType.toLowerCase());
    if (matchedType && matchedType !== 'Other') {
      return { requestType: matchedType, customType: '' };
    }
  }

  const raw = String(text || '').toLowerCase().replace(/[()/_-]+/g, ' ').replace(/\s+/g, ' ');

  if (/\b(tmrw|tomorrow|next day)\b/.test(raw) && /\bpm\b/.test(raw)) {
    return { requestType: 'Other', customType: 'TMRW PM' };
  }

  if (/\btoday\b/.test(raw) && /\bpm\b/.test(raw)) {
    return { requestType: 'Other', customType: 'TODAY PM' };
  }

  if (/\binbound\b/.test(raw) || /\bg\s*to\s*c\b/.test(raw)) {
    return { requestType: 'INBOUND (G to C)', customType: '' };
  }

  if (/\bdeep\s*clean/.test(raw)) return { requestType: 'Deep Cleaning', customType: '' };
  if (/\bworkshop\b.*\bunfit\b|\bunfit\b.*\bworkshop\b/.test(raw)) return { requestType: 'Workshop /Unfit', customType: '' };
  if (/\bunfit\b/.test(raw)) return { requestType: 'UNFIT', customType: '' };
  if (/\brst\s*cm\b|\bcm\b.*\brst\b/.test(raw)) return { requestType: 'RST CM', customType: '' };
  if (/\brst\s*pm\b|\bpm\b.*\brst\b/.test(raw)) return { requestType: 'RST PM', customType: '' };
  if (/\bwash\b/.test(raw)) return { requestType: 'WASH', customType: '' };
  if (/\btlc\b|\bcomms?\b/.test(raw)) return { requestType: 'TLC Comms', customType: '' };
  if (/\bml\b.*\bfault\b|\bmainline\b.*\bfault\b/.test(raw)) return { requestType: 'ML Fault', customType: '' };
  if (/\bhvac\b/.test(raw)) return { requestType: 'HVAC TESTING', customType: '' };
  if (/\bcc\b.*\btech\b|\bfunc\b.*\balarm\b/.test(raw)) return { requestType: 'CC Tech/Func. Alarm', customType: '' };
  if (/\bdoor\b/.test(raw)) return { requestType: 'Door Issue', customType: '' };
  if (/\btraining\b/.test(raw)) return { requestType: 'Training', customType: '' };
  if (/\bapu\b/.test(raw)) return { requestType: 'APU alarm', customType: '' };

  return { requestType: 'Other', customType: normalizeCustomType(explicitCustom || 'EMAIL REQUEST') };
}

function detectRemark(text = '', payload = {}, requestType = '') {
  const explicitRemark = String(payload.remark || payload.note || '').trim();
  if (explicitRemark) return explicitRemark;

  const raw = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  const requestedBy = raw.match(/requested\s+by\s+([a-z0-9 /_-]{2,25})(?:\s+for|\.|,|$)/i);
  if (requestedBy?.[1]) {
    return `Requested by ${requestedBy[1].trim().toUpperCase()}`;
  }

  if (requestType === 'INBOUND (G to C)') return 'Inbound movement G to C';
  return '';
}

function displayTypeOf(record) {
  return record.requestType === 'Other'
    ? (record.customType || 'Other')
    : record.requestType;
}

function isSameRequest(left = {}, right = {}) {
  return normalizeTrainId(left.trainId) === normalizeTrainId(right.trainId)
    && displayTypeOf(left).toLowerCase() === displayTypeOf(right).toLowerCase();
}

async function getExistingRequests(db) {
  const result = await db
    .prepare('SELECT id, data, created_at, updated_at FROM entity_records WHERE entity = ?')
    .bind('MaintenanceRequest')
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    ...(safeParseJson(row.data, {}) || {}),
    created_date: row.created_at,
    updated_date: row.updated_at,
  }));
}

async function createMaintenanceRequest(db, payload = {}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanPayload = { ...(payload || {}) };
  delete cleanPayload.id;

  await db
    .prepare('INSERT INTO entity_records (id, entity, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, 'MaintenanceRequest', JSON.stringify(cleanPayload), now, now)
    .run();

  return {
    id,
    ...cleanPayload,
    created_date: now,
    updated_date: now,
    createdAt: cleanPayload.createdAt || now,
    updatedAt: cleanPayload.updatedAt || now,
  };
}

function getAuthorizationToken(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get('x-email-import-token') || new URL(request.url).searchParams.get('token') || '';
}

function getMessageId(request, payload = {}, combinedText = '') {
  return String(
    payload.messageId
    || payload.internetMessageId
    || payload.id
    || request.headers.get('x-message-id')
    || ''
  ).trim() || `text:${combinedText.slice(0, 500).toLowerCase()}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: jsonHeaders });

  if (request.method === 'GET') {
    return json({
      ok: true,
      endpoint: '/api/email-request',
      method: 'POST',
      purpose: 'Send new email text here to auto-create Maintenance Request rows. The request panel refreshes from D1 every 5 seconds.',
      sampleBody: {
        subject: 'Train request',
        body: '36 28 44 15 10 20 requested by RST for today PM',
        messageId: '<email-message-id>',
      },
      security: env.EMAIL_IMPORT_TOKEN ? 'Token enabled' : 'Token not configured. Add EMAIL_IMPORT_TOKEN in Cloudflare Pages environment variables.',
    });
  }

  if (request.method !== 'POST') return json({ error: 'Only POST is supported.' }, 405);

  if (!env.DB) {
    return json({ error: 'D1 binding "DB" is missing. Add a D1 database binding named DB in Cloudflare Pages.' }, 500);
  }

  const expectedToken = String(env.EMAIL_IMPORT_TOKEN || '').trim();
  if (expectedToken) {
    const providedToken = getAuthorizationToken(request);
    if (providedToken !== expectedToken) {
      return json({ error: 'Invalid email import token.' }, 401);
    }
  }

  const payload = await readIncomingPayload(request);
  const combinedText = stripHtml([
    payload.subject,
    payload.body,
    payload.bodyPreview,
    payload.text,
    payload.html,
    payload.content,
  ].filter(Boolean).join('\n'));

  const trainIds = extractTrainIds(combinedText, payload.trainIds || payload.trains || payload.trainId);
  const typeInfo = detectRequestType(combinedText, payload);
  const remark = detectRemark(combinedText, payload, typeInfo.requestType);
  const sourceMessageId = getMessageId(request, payload, combinedText);

  if (trainIds.length === 0) {
    return json({
      success: false,
      error: 'No train IDs detected from email.',
      parsedText: combinedText.slice(0, 1000),
    }, 422);
  }

  await ensureSchema(env.DB);
  const existingRequests = await getExistingRequests(env.DB);
  const created = [];
  const skipped = [];

  for (const trainId of trainIds) {
    const newRequest = {
      trainId,
      requestType: typeInfo.requestType,
      customType: typeInfo.customType || '',
      remark,
      source: 'email',
      sourceMessageId,
      sourceSubject: String(payload.subject || '').trim(),
      sourceFrom: String(payload.from || payload.sender || '').trim(),
      createdFromEmail: true,
    };

    if (existingRequests.some((existing) => isSameRequest(existing, newRequest))) {
      skipped.push(newRequest);
      continue;
    }

    const inserted = await createMaintenanceRequest(env.DB, newRequest);
    existingRequests.push(inserted);
    created.push(inserted);
  }

  return json({
    success: true,
    createdCount: created.length,
    skippedCount: skipped.length,
    parsed: {
      trainIds,
      requestType: typeInfo.requestType,
      customType: typeInfo.customType || '',
      remark,
    },
    created,
    skipped,
  }, created.length ? 201 : 200);
}
