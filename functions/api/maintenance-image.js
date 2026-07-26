import { extractMaintenancePlan } from '../lib/maintenance-plan-parser.js';

const AZURE_API_VERSION = '2024-11-30';
const AZURE_MODEL = 'prebuilt-layout';
const MAX_FREE_TIER_IMAGE_BYTES = 4 * 1024 * 1024;
const POLL_INTERVAL_MS = 1100;
const POLL_TIMEOUT_MS = 30000;

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSameOriginBrowserRequest(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;

  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }

  const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').toLowerCase();
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

function listSignature(list = []) {
  return (list || []).join('|');
}

function looksSuspicious(extraction) {
  const safe = extraction || {};
  const lists = [safe.eveningGToC, safe.morningGToC, safe.eveningPM, safe.morningPM].filter(Array.isArray);
  const populated = lists.filter((list) => list.length > 0);
  if (populated.length === 0) return true;

  const hasEveningEntries = (safe.eveningGToC || []).length > 0 || (safe.eveningPM || []).length > 0;
  const hasMorningEntries = (safe.morningGToC || []).length > 0 || (safe.morningPM || []).length > 0;
  if ((hasEveningEntries && !safe.eveningDate) || (hasMorningEntries && !safe.morningDate)) return true;
  if (safe.eveningDate && safe.eveningDate === safe.morningDate) return true;

  const eveningPmSig = listSignature(safe.eveningPM || []);
  const morningPmSig = listSignature(safe.morningPM || []);
  if (eveningPmSig && eveningPmSig === morningPmSig) return true;

  return populated.length >= 3 && populated.every(
    (list) => listSignature(list) === listSignature(populated[0])
  );
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

function azureEndpoint(env) {
  const configuredValue = String(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || '').trim();
  let url;

  try {
    url = new URL(configuredValue);
  } catch {
    throw Object.assign(new Error('The Azure OCR endpoint in Cloudflare is invalid.'), { status: 503 });
  }

  if (url.protocol !== 'https:') {
    throw Object.assign(new Error('The Azure OCR endpoint must use HTTPS.'), { status: 503 });
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

async function readAzureBody(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { rawMessage: text };
  }
}

function azureErrorMessage(body, fallback) {
  return body?.error?.innererror?.message
    || body?.error?.message
    || body?.rawMessage
    || fallback;
}

async function azureFetch(input, init, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw Object.assign(new Error('Azure OCR is taking too long. Please try the image again.'), { status: 504 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remaining);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError' || Date.now() >= deadline) {
      throw Object.assign(new Error('Azure OCR is taking too long. Please try the image again.'), { status: 504 });
    }
    throw Object.assign(new Error('Unable to reach Azure OCR. Please try again.'), { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function runAzureLayout({ env, mediaType, arrayBuffer }) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const endpoint = azureEndpoint(env);
  const apiKey = String(env.AZURE_DOCUMENT_INTELLIGENCE_KEY || '').trim();
  const analyzeUrl = new URL(
    `${endpoint.pathname.replace(/\/+$/, '')}/documentintelligence/documentModels/${AZURE_MODEL}:analyze`,
    endpoint.origin
  );
  analyzeUrl.searchParams.set('api-version', AZURE_API_VERSION);
  const startResponse = await azureFetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': mediaType,
    },
    body: arrayBuffer,
  }, deadline);
  const startBody = await readAzureBody(startResponse);

  if (!startResponse.ok) {
    if (startResponse.status === 401 || startResponse.status === 403) {
      throw Object.assign(new Error('Azure OCR rejected the configured endpoint or key. Check the Cloudflare secrets and redeploy.'), { status: 503 });
    }
    if (startResponse.status === 429) {
      throw Object.assign(new Error('Azure Free F0 is temporarily busy or its quota was reached. Wait and try again.'), { status: 503 });
    }
    throw Object.assign(
      new Error(azureErrorMessage(startBody, `Azure OCR request failed (${startResponse.status}).`)),
      { status: startResponse.status >= 500 ? 502 : 422 }
    );
  }

  const operationLocation = startResponse.headers.get('Operation-Location');
  if (!operationLocation) throw new Error('Azure OCR did not return an operation location.');
  let operationUrl;
  try {
    operationUrl = new URL(operationLocation);
  } catch {
    throw Object.assign(new Error('Azure OCR returned an invalid operation location.'), { status: 502 });
  }
  if (operationUrl.protocol !== 'https:' || operationUrl.origin !== endpoint.origin) {
    throw Object.assign(new Error('Azure OCR returned an unexpected operation location.'), { status: 502 });
  }

  const retryAfterSeconds = Number(startResponse.headers.get('Retry-After'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    await sleep(Math.min(3000, Math.max(POLL_INTERVAL_MS, retryAfterSeconds * 1000)));
  }

  while (Date.now() < deadline) {
    const resultResponse = await azureFetch(operationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    }, deadline);
    const resultBody = await readAzureBody(resultResponse);

    if (resultResponse.status === 429 || resultResponse.status === 503) {
      const retryAfter = Number(resultResponse.headers.get('Retry-After'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(3000, Math.max(POLL_INTERVAL_MS, retryAfter * 1000))
        : POLL_INTERVAL_MS);
      continue;
    }

    if (!resultResponse.ok) {
      if (resultResponse.status === 401 || resultResponse.status === 403) {
        throw Object.assign(new Error('Azure OCR rejected the configured key while retrieving the result.'), { status: 503 });
      }
      throw Object.assign(
        new Error(azureErrorMessage(resultBody, `Unable to retrieve Azure OCR result (${resultResponse.status}).`)),
        { status: resultResponse.status >= 500 ? 502 : 422 }
      );
    }

    const status = String(resultBody?.status || '').toLowerCase();
    if (status === 'succeeded') return resultBody.analyzeResult || {};
    if (status === 'failed' || status === 'canceled') {
      throw Object.assign(new Error(azureErrorMessage(resultBody, 'Azure OCR could not analyse this image.')), { status: 422 });
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw Object.assign(new Error('Azure OCR is taking too long. Please try the image again.'), { status: 504 });
}

function mediaTypeForImage(imageFile) {
  const declaredType = String(imageFile.type || '').toLowerCase();
  const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/bmp', 'image/tiff']);
  if (supportedTypes.has(declaredType)) return declaredType;

  const extension = String(imageFile.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  }[extension] || '';
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOriginBrowserRequest(request)) {
    return json({ success: false, error: 'This OCR endpoint only accepts uploads from the Rail Log application.' }, 403);
  }

  const missingConfiguration = [
    !env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT',
    !env.AZURE_DOCUMENT_INTELLIGENCE_KEY && 'AZURE_DOCUMENT_INTELLIGENCE_KEY',
  ].filter(Boolean);

  if (missingConfiguration.length) {
    return json({
      success: false,
      error: `Azure OCR is not configured. Add ${missingConfiguration.join(' and ')} in Cloudflare Variables and Secrets, then redeploy.`,
    }, 500);
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile || typeof imageFile.arrayBuffer !== 'function') {
      return json({ success: false, error: 'No image uploaded.' }, 400);
    }

    const mediaType = mediaTypeForImage(imageFile);
    if (!mediaType) {
      return json({ success: false, error: 'Please upload a PNG, JPG, BMP, or TIFF image.' }, 415);
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      return json({ success: false, error: 'Uploaded image is empty.' }, 400);
    }

    if (arrayBuffer.byteLength > MAX_FREE_TIER_IMAGE_BYTES) {
      return json({ success: false, error: 'The image is larger than the Azure Free F0 limit of 4 MB.' }, 413);
    }

    const analyzeResult = await runAzureLayout({ env, mediaType, arrayBuffer });
    const parsed = extractMaintenancePlan(analyzeResult);
    if (!parsed.recognized) {
      return json({
        success: false,
        error: 'Azure read the image, but could not identify the train-plan table. Upload a clear image showing the complete table.',
      }, 422);
    }

    const extraction = parsed.extraction;
    const uncertain = parsed.uncertain || looksSuspicious(extraction);

    return json({
      success: true,
      provider: 'azure-document-intelligence',
      model: AZURE_MODEL,
      extraction,
      items: uncertain ? [] : toRequestItems(extraction),
      uncertain,
      warning: uncertain
        ? 'Azure read the table, but some rows could not be confirmed. Check the generated details before copying.'
        : '',
    });
  } catch (error) {
    console.error('Maintenance image Azure OCR error:', error);
    return json({
      success: false,
      error: error?.message || 'Unable to analyse the uploaded image with Azure OCR.',
    }, error?.status || 500);
  }
}
