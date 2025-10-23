const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');

const API_BASE_URL = 'https://opendart.fss.or.kr/api';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2;
const CORP_CODE_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24시간 동안 재사용
const CORP_CODE_CACHE_CONTROL = 'public, max-age=86400';
const DEFAULT_USER_AGENT =
  'GroupDataHub/1.0 (+https://github.com/dhwnsdud1210/profile-dashboard)';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  body: JSON.stringify(body ?? {}),
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (fn, { attempts = MAX_ATTEMPTS, baseDelayMs = 500 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn({ attempt });
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      const jitter = Math.random() * baseDelayMs;
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await wait(delay);
    }
  }
  throw lastError;
};

const withTimeoutSignal = (signal, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  if (typeof AbortController !== 'function' || timeoutMs <= 0) {
    return { signal, cleanup: () => {} };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const cleanup = () => clearTimeout(timeoutId);

  if (!signal) {
    return { signal: controller.signal, cleanup };
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    const combined = AbortSignal.any([signal, controller.signal]);
    return { signal: combined, cleanup };
  }

  signal.addEventListener('abort', () => controller.abort(), { once: true });
  return { signal: controller.signal, cleanup };
};

let cachedFetchPromise = null;

const getFetch = async () => {
  if (typeof fetch === 'function') {
    return fetch;
  }
  if (!cachedFetchPromise) {
    cachedFetchPromise = import('node-fetch').then(({ default: nodeFetch }) => nodeFetch);
  }
  return cachedFetchPromise;
};

const fetchWithTimeout = async (url, options = {}) => {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...rest } = options;
  const { signal: combinedSignal, cleanup } = withTimeoutSignal(signal, timeoutMs);
  const fetchFn = await getFetch();
  try {
    const response = await fetchFn(url, {
      ...rest,
      signal: combinedSignal,
      headers: { 'User-Agent': DEFAULT_USER_AGENT, ...(headers || {}) },
    });
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('OpenDART 요청이 시간 초과되었습니다. 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    cleanup();
  }
};

const getApiKey = () => {
  const key = process.env.OPENDART_API_KEY;
  if (!key) {
    throw new Error('OpenDART API key is not configured. Set OPENDART_API_KEY.');
  }
  return key;
};

const corpCodeCache = {
  value: null,
  fetchedAt: 0,
};

const xmlParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const parseCorpCodeZip = async (base64Zip) => {
  const buffer = Buffer.from(base64Zip, 'base64');
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file(/\.xml$/i)?.[0];
  if (!xmlFile) {
    throw new Error('corpCode.zip 파일에서 XML을 찾을 수 없습니다.');
  }

  const xmlText = await xmlFile.async('text');
  const parsed = xmlParser.parse(xmlText);
  const rawList = toArray(parsed?.result?.list);

  return rawList
    .map((item) => ({
      corpCode: item?.corp_code?.trim?.() || '',
      corpName: item?.corp_name?.trim?.() || '',
      stockCode: item?.stock_code?.trim?.() || '',
      modifyDate: item?.modify_date?.trim?.() || '',
    }))
    .filter((item) => item.corpCode && item.corpName);
};

const fetchCorpCode = async () => {
  if (corpCodeCache.value && Date.now() - corpCodeCache.fetchedAt < CORP_CODE_CACHE_TTL_MS) {
    return corpCodeCache.value;
  }

  const apiKey = getApiKey();
  const url = `${API_BASE_URL}/corpCode.xml?crtfc_key=${apiKey}`;

  const base64Zip = await withRetry(
    async () => {
      const response = await fetchWithTimeout(url, { timeoutMs: 8000 });
      if (!response.ok) {
        const message = `corpCode 요청에 실패했습니다. (HTTP ${response.status})`;
        throw new Error(message);
      }
      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('corpCode 응답이 비어 있습니다.');
      }
      return Buffer.from(buffer).toString('base64');
    },
    { attempts: 1 }
  );

  const corpCodes = await parseCorpCodeZip(base64Zip);

  corpCodeCache.value = corpCodes;
  corpCodeCache.fetchedAt = Date.now();
  return corpCodes;
};

const fetchExecutives = async ({ corpCode, bsnsYear, reprtCode }) => {
  if (!corpCode) {
    throw new Error('corpCode 값이 필요합니다.');
  }
  if (!bsnsYear) {
    throw new Error('bsnsYear 값이 필요합니다.');
  }
  if (!reprtCode) {
    throw new Error('reprtCode 값이 필요합니다.');
  }

  const apiKey = getApiKey();
  const url = new URL(`${API_BASE_URL}/exctvSttus.json`);
  url.searchParams.set('crtfc_key', apiKey);
  url.searchParams.set('corp_code', String(corpCode));
  url.searchParams.set('bsns_year', String(bsnsYear));
  url.searchParams.set('reprt_code', String(reprtCode));

  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, { timeoutMs: 8000 });
      if (!response.ok) {
        throw new Error(`exctvSttus 요청에 실패했습니다. (HTTP ${response.status})`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error('OpenDART 응답을 해석할 수 없습니다.');
      }

      if (!data) {
        throw new Error('OpenDART 응답을 해석할 수 없습니다.');
      }

      return data;
    },
    { attempts: 2, baseDelayMs: 300 }
  );
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { action, payload: data = {} } = payload || {};
  if (!action) {
    return jsonResponse(400, { error: 'action 값이 필요합니다.' });
  }

  try {
    if (action === 'corpCode') {
      const corpCodes = await fetchCorpCode();
      return jsonResponse(200, { data: corpCodes }, { 'Cache-Control': CORP_CODE_CACHE_CONTROL });
    }

    if (action === 'executives') {
      const dataPayload = {
        corpCode: data.corpCode ?? data.corp_code,
        bsnsYear: data.bsnsYear ?? data.bsns_year,
        reprtCode: data.reprtCode ?? data.reprt_code,
      };
      const executiveData = await fetchExecutives(dataPayload);
      return jsonResponse(200, { data: executiveData });
    }

    return jsonResponse(400, { error: `지원하지 않는 action 입니다: ${action}` });
  } catch (error) {
    console.error('OpenDART proxy error:', error);
    if (error?.message?.includes('API key')) {
      return jsonResponse(500, { error: error.message });
    }
    return jsonResponse(502, { error: error.message || 'OpenDART API 프록시 호출에 실패했습니다.' });
  }
};
