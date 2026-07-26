const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function stripCodeFence(text = '') {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonObject(text = '') {
  const cleanText = stripCodeFence(text);

  try {
    return JSON.parse(cleanText);
  } catch {
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleanText.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function trainNumberFromText(value) {
  const text = String(value ?? '').toUpperCase().trim();
  if (!text) return '';

  const match = text.match(/(?:TS|T)?\s*0*(\d{1,3})\b/);
  if (!match) return '';

  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) return '';

  return String(number).padStart(2, '0');
}

function normalizeTrainList(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[,\n]/);
  const normalized = [];
  const seen = new Set();

  source.forEach((item) => {
    const train = trainNumberFromText(item);
    if (!train || seen.has(train)) return;
    seen.add(train);
    normalized.push(train);
  });

  return normalized;
}

const PLAN_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPlanDate(dayValue, monthValue) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  if (!Number.isInteger(day) || day < 1 || day > 31) return '';
  if (!Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${String(day).padStart(2, '0')}-${PLAN_MONTH_LABELS[month - 1]}`;
}

function normalizePlanDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  let match = text.match(/\b\d{4}[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/);
  if (match) return formatPlanDate(match[2], match[1]);

  match = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-]\d{2,4})?\b/);
  if (match) return formatPlanDate(match[1], match[2]);

  match = text.match(/\b(\d{1,2})\s*[\-\s]\s*([A-Za-z]{3,9})\b/);
  if (match) {
    const monthIndex = PLAN_MONTH_LABELS.findIndex(
      (label) => label.toLowerCase() === match[2].slice(0, 3).toLowerCase()
    );
    return monthIndex >= 0 ? formatPlanDate(match[1], monthIndex + 1) : '';
  }

  return '';
}

function normalizeExtraction(raw = {}) {
  return {
    eveningDate: normalizePlanDate(raw.eveningDate || raw.evening_date || raw['Evening Date']),
    morningDate: normalizePlanDate(raw.morningDate || raw.morning_date || raw['Morning Date']),
    morningGToC: normalizeTrainList(raw.morningGToC || raw.morning_g_to_c || raw['Morning G to C']),
    eveningGToC: normalizeTrainList(raw.eveningGToC || raw.evening_g_to_c || raw['Evening G to C']),
    eveningPM: normalizeTrainList(raw.eveningPM || raw.evening_pm || raw['Evening PM']),
    morningPM: normalizeTrainList(raw.morningPM || raw.morning_pm || raw['Morning PM']),
  };
}

function listSignature(list = []) {
  return (list || []).join('|');
}

function looksSuspicious(extraction) {
  const safe = extraction || {};
  const populated = Object.values(safe).filter((list) => Array.isArray(list) && list.length > 0);
  if (populated.length === 0) return true;

  const hasEveningEntries = (safe.eveningGToC || []).length > 0 || (safe.eveningPM || []).length > 0;
  const hasMorningEntries = (safe.morningGToC || []).length > 0 || (safe.morningPM || []).length > 0;
  if ((hasEveningEntries && !safe.eveningDate) || (hasMorningEntries && !safe.morningDate)) return true;

  const gToCCount = (safe.morningGToC || []).length + (safe.eveningGToC || []).length;
  const eveningPmSig = listSignature(safe.eveningPM || []);
  const morningPmSig = listSignature(safe.morningPM || []);

  if (gToCCount === 0 && eveningPmSig && eveningPmSig === morningPmSig) return true;

  if (populated.length >= 3) {
    const firstSignature = listSignature(populated[0]);
    if (populated.every((list) => listSignature(list) === firstSignature)) return true;
  }

  return false;
}

function toRequestItems(extraction) {
  const sections = [
    ['morningGToC', 'Morning G to C'],
    ['eveningGToC', 'Evening G to C'],
    ['eveningPM', 'Evening PM'],
    ['morningPM', 'Morning PM'],
  ];

  return sections.flatMap(([key, requestType]) =>
    (extraction[key] || []).map((trainId) => ({
      trainId,
      requestType,
      customType: '',
      remark: '',
    }))
  );
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function collectGeminiOutputText(responseBody) {
  const parts = responseBody?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

const geminiExtractionPrompt = `
You are reading a depot maintenance planning image/table.
Extract ONLY these six fields and return valid JSON only:
{
  "eveningDate": "",
  "morningDate": "",
  "morningGToC": [],
  "eveningGToC": [],
  "eveningPM": [],
  "morningPM": []
}

Date rules:
- Read eveningDate from the date printed beside the lower Evening shift PM/S row.
- Read morningDate from the date printed beside the lower Morning shift PM/S row.
- Return each date as DD-MMM, for example 26-Jul.
- The top Evening shift movement rows belong to eveningDate.
- The top Morning shift movement rows belong to morningDate.
- If a date is missing or unclear, return an empty string. Do not guess.

Rules for TOP movement table:
- Morning G to C and Evening G to C must come from the TOP movement table only.
- Include only rows where From Building is exactly G and To Building is exactly C.
- Use only the Train column as the train number.
- Do NOT use From track, To track, dates, row numbers, building letters, or Notes as train numbers.
- Morning/Evening is decided by the By Time column.
- Example: Train 4, From Building G, To Building C, By Time Evening shift => eveningGToC ["04"].
- Example: Train 36, From Building G, To Building C, By Time Morning shift => morningGToC ["36"].

Rules for BELOW information / S rows:
- Evening PM and Morning PM must ALWAYS come from the BELOW information/summary section only.
- Evening PM comes only from the lower row labelled Evening shift / evening date.
- Morning PM comes only from the lower row labelled Morning shift / morning date.
- Extract train numbers from lower lists like TS25(Wk), TS44(Bwk), TS09(C)(Bwk).
- If the same train appears more than once in one lower row, include it only once and preserve its first position.
- Do NOT use the top table Notes column for PM.

Formatting rules:
- Remove T or TS prefix.
- Keep two digits for single-digit trains, for example Train 4 becomes "04" and TS09 becomes "09".
- Preserve the order from the image.
- If a field is not found or unclear, return an empty array for that field.
- Do not guess.
- Return JSON only. No markdown. No explanation.

Expected example for the provided layout:
{
  "eveningDate": "26-Jul",
  "morningDate": "27-Jul",
  "morningGToC": ["01"],
  "eveningGToC": ["27"],
  "eveningPM": ["32", "33", "11"],
  "morningPM": ["37", "06", "30", "32", "19"]
}
`

async function runGeminiVision({ env, imageFile, arrayBuffer }) {
  const imageBytes = new Uint8Array(arrayBuffer);
  const base64 = uint8ArrayToBase64(imageBytes);
  const mediaType = imageFile.type && imageFile.type.startsWith('image/') ? imageFile.type : 'image/png';
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: geminiExtractionPrompt },
            {
              inline_data: {
                mime_type: mediaType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
    }),
  });

  const responseText = await response.text();
  let responseBody = null;

  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.error?.message || responseText || 'Gemini request failed.';
    throw new Error(message);
  }

  const blockReason = responseBody?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked the request: ${blockReason}`);
  }

  const text = collectGeminiOutputText(responseBody) || responseText;
  const parsed = extractJsonObject(text) || {};

  return {
    model,
    text,
    extraction: normalizeExtraction(parsed),
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({
      success: false,
      error: 'Gemini API key is missing. Add GEMINI_API_KEY in Cloudflare Pages Variables and secrets, then redeploy.',
    }, 500);
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile || typeof imageFile.arrayBuffer !== 'function') {
      return json({ success: false, error: 'No image uploaded.' }, 400);
    }

    const mediaType = String(imageFile.type || '').toLowerCase();
    if (!mediaType.startsWith('image/')) {
      return json({ success: false, error: 'Please upload an image file.' }, 415);
    }

    const arrayBuffer = await imageFile.arrayBuffer();

    if (!arrayBuffer.byteLength) {
      return json({ success: false, error: 'Uploaded image is empty.' }, 400);
    }

    const maxImageBytes = 10 * 1024 * 1024;
    if (arrayBuffer.byteLength > maxImageBytes) {
      return json({ success: false, error: 'The image is larger than 10 MB.' }, 413);
    }

    const result = await runGeminiVision({ env, imageFile, arrayBuffer });
    const extraction = result.extraction;
    const uncertain = looksSuspicious(extraction);
    const items = uncertain ? [] : toRequestItems(extraction);

    return json({
      success: true,
      provider: 'gemini',
      model: result.model,
      extraction,
      items,
      uncertain,
      warning: uncertain
        ? 'Gemini result looks duplicated/uncertain. Edit the preview first, then add.'
        : '',
      rawText: {
        gemini: result.text,
      },
    });
  } catch (error) {
    console.error('Maintenance image Gemini error:', error);
    return json({
      success: false,
      error: error?.message || 'Unable to analyse uploaded image.',
    }, 500);
  }
}
