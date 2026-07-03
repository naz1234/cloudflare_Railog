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

function normalizeExtraction(raw = {}) {
  return {
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
  if (populated.length === 0) return false;

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
Extract ONLY these four fields and return valid JSON only:
{
  "morningGToC": [],
  "eveningGToC": [],
  "eveningPM": [],
  "morningPM": []
}

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
  "morningGToC": ["36"],
  "eveningGToC": ["04"],
  "eveningPM": ["25", "30", "35", "44", "09"],
  "morningPM": ["27", "08", "07", "38", "47", "21"]
}
`;

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

    const arrayBuffer = await imageFile.arrayBuffer();

    if (!arrayBuffer.byteLength) {
      return json({ success: false, error: 'Uploaded image is empty.' }, 400);
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
