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

const extractionPrompt = `
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
- Morning/Evening is decided by the By Time column.
- Do NOT use the top table Notes column for PM.
- Evening PM and Morning PM must ALWAYS come from the BELOW information/summary section only.
- The below section may show values like TS25(Wk), TS44(Bwk), TS09(C)(Bwk). Extract only the train numbers.
- Remove T or TS prefix.
- Keep two digits for single-digit trains, for example TS09 becomes "09" and Train 4 becomes "04".
- If a field is unclear, return an empty array for that field.
- Return JSON only. No explanation.
`;

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

    const result = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: [...new Uint8Array(arrayBuffer)],
      prompt: extractionPrompt,
      max_tokens: 512,
    });

    const modelText = getModelText(result);
    const parsed = extractJsonObject(modelText) || {};
    const extraction = normalizeExtraction(parsed);
    const items = toRequestItems(extraction);

    return json({
      success: true,
      extraction,
      items,
      rawText: modelText,
    });
  } catch (error) {
    console.error('Maintenance image AI error:', error);
    return json({
      success: false,
      error: error?.message || 'Unable to analyse uploaded image.',
    }, 500);
  }
}
