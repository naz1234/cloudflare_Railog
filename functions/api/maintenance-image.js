const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function getModelText(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  return (
    result.response ||
    result.description ||
    result.text ||
    result.output_text ||
    result.result ||
    JSON.stringify(result)
  ).toString();
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

function normalizeExtraction(raw = {}) {
  return {
    morningGToC: normalizeTrainList(raw.morningGToC || raw.morning_g_to_c || raw['Morning G to C']),
    eveningGToC: normalizeTrainList(raw.eveningGToC || raw.evening_g_to_c || raw['Evening G to C']),
    eveningPM: normalizeTrainList(raw.eveningPM || raw.evening_pm || raw['Evening PM']),
    morningPM: normalizeTrainList(raw.morningPM || raw.morning_pm || raw['Morning PM']),
  };
}

function mergeExtraction(...parts) {
  const merged = {
    morningGToC: [],
    eveningGToC: [],
    eveningPM: [],
    morningPM: [],
  };

  parts.forEach((part) => {
    Object.keys(merged).forEach((key) => {
      const seen = new Set(merged[key]);
      (part?.[key] || []).forEach((train) => {
        if (seen.has(train)) return;
        seen.add(train);
        merged[key].push(train);
      });
    });
  });

  return merged;
}

function listSignature(list = []) {
  return (list || []).join('|');
}

function looksSuspicious(extraction) {
  const populated = Object.values(extraction || {}).filter((list) => Array.isArray(list) && list.length > 0);
  if (populated.length < 3) return false;

  const firstSignature = listSignature(populated[0]);
  return populated.every((list) => listSignature(list) === firstSignature);
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

const topMovementPrompt = `
Read ONLY the TOP movement table in this depot planning image. Ignore the lower S/summary rows completely.

Return valid JSON only:
{
  "morningGToC": [],
  "eveningGToC": []
}

Very important rules:
- Use the Train column for the train number. Do NOT use From track, To track, dates, or row number.
- Include a train only when From Building is exactly G and To Building is exactly C.
- Morning or Evening comes only from the By Time column.
- If By Time says Morning shift, put the Train number into morningGToC.
- If By Time says Evening shift, put the Train number into eveningGToC.
- Do not extract Maintenance PM from the Notes column.
- Remove T or TS prefix. Keep two digits for single-digit trains, for example Train 4 becomes "04" and TS09 becomes "09".
- If unclear, return an empty array.

Return JSON only. No explanation.
`;

const belowPmPrompt = `
Read ONLY the BELOW information/summary rows in this depot planning image. Ignore the top movement table completely.

Return valid JSON only:
{
  "eveningPM": [],
  "morningPM": []
}

Very important rules:
- Evening PM comes only from the lower row labelled Evening shift / evening date.
- Morning PM comes only from the lower row labelled Morning shift / morning date.
- Extract the train numbers from the train list in those lower rows only, for example TS25(Wk), TS44(Bwk), TS09(C)(Bwk).
- Do NOT use the top table Notes column for PM.
- Do NOT use From track, To track, dates, row numbers, or building letters as trains.
- Remove T or TS prefix. Keep two digits for single-digit trains, for example TS09 becomes "09".
- If unclear, return an empty array.

Return JSON only. No explanation.
`;

const fallbackPrompt = `
You are reading a depot maintenance planning image/table.
Extract ONLY these four fields and return valid JSON only:
{
  "morningGToC": [],
  "eveningGToC": [],
  "eveningPM": [],
  "morningPM": []
}

Rules:
- Morning G to C and Evening G to C must come from the TOP movement table only.
- In the top table, include only rows where From Building is G and To Building is C.
- Use the Train column only for train number.
- Morning/Evening is decided by the By Time column.
- Do NOT use track numbers as train numbers.
- Do NOT use the top table Notes column for PM.
- Evening PM and Morning PM must ALWAYS come from the BELOW information/summary section only.
- The below section may show values like TS25(Wk), TS44(Bwk), TS09(C)(Bwk). Extract only the train numbers.
- Remove T or TS prefix.
- Keep two digits for single-digit trains, for example TS09 becomes "09" and Train 4 becomes "04".
- If the same two trains appear in every field, that is probably wrong: return empty arrays instead.
- If a field is unclear, return an empty array for that field.
- Return JSON only. No explanation.
`;

async function runVision(env, imageBytes, prompt, maxTokens = 256) {
  const result = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
    image: imageBytes,
    prompt,
    max_tokens: maxTokens,
  });

  const text = getModelText(result);
  const parsed = extractJsonObject(text) || {};

  return {
    text,
    extraction: normalizeExtraction(parsed),
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return json({
      success: false,
      error: 'Workers AI binding "AI" is missing. Add a Workers AI binding named AI in Cloudflare Pages settings.',
    }, 500);
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile || typeof imageFile.arrayBuffer !== 'function') {
      return json({ success: false, error: 'No image uploaded.' }, 400);
    }

    const arrayBuffer = await imageFile.arrayBuffer();

    if (!arrayBuffer.byteLength) {
      return json({ success: false, error: 'Uploaded image is empty.' }, 400);
    }

    const imageBytes = [...new Uint8Array(arrayBuffer)];

    const [topResult, belowResult] = await Promise.all([
      runVision(env, imageBytes, topMovementPrompt, 256),
      runVision(env, imageBytes, belowPmPrompt, 384),
    ]);

    let extraction = mergeExtraction(topResult.extraction, belowResult.extraction);
    let fallbackResult = null;

    if (toRequestItems(extraction).length === 0 || looksSuspicious(extraction)) {
      fallbackResult = await runVision(env, imageBytes, fallbackPrompt, 512);
      const fallbackExtraction = fallbackResult.extraction;

      if (toRequestItems(fallbackExtraction).length > 0 && !looksSuspicious(fallbackExtraction)) {
        extraction = fallbackExtraction;
      }
    }

    const uncertain = looksSuspicious(extraction);
    const items = uncertain ? [] : toRequestItems(extraction);

    return json({
      success: true,
      extraction,
      items,
      uncertain,
      warning: uncertain
        ? 'AI result looks duplicated/uncertain, so nothing was added. Try crop the image clearer or upload again.'
        : '',
      rawText: {
        top: topResult.text,
        below: belowResult.text,
        fallback: fallbackResult?.text || '',
      },
    });
  } catch (error) {
    console.error('Maintenance image AI error:', error);
    return json({
      success: false,
      error: error?.message || 'Unable to analyse uploaded image.',
    }, 500);
  }
}
