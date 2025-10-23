const PROXY_ENDPOINT = '/.netlify/functions/opendart-proxy';
const CORP_CODE_CACHE_KEY = 'opendart:corp-code-cache:v2';
const CORP_CODE_CACHE_TTL = 1000 * 60 * 60 * 24; // 24시간

export const REPORT_CODES = {
  '11011': '사업보고서',
  '11012': '반기보고서',
  '11013': '1분기보고서',
  '11014': '3분기보고서',
};

export const REPORT_CODE_OPTIONS = Object.entries(REPORT_CODES).map(([code, label]) => ({
  code,
  label,
}));

const callOpenDartProxy = async ({ action, payload = {}, signal } = {}) => {
  if (!action) {
    throw new Error('Open DART 프록시 요청에 action이 지정되지 않았습니다.');
  }

  const response = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal,
  });

  const rawText = await response.text();
  let result = null;
  let parseError = null;

  if (rawText) {
    try {
      result = JSON.parse(rawText);
    } catch (error) {
      parseError = error;
    }
  }

  if (!response.ok) {
    if (result?.error) {
      throw new Error(result.error);
    }

    const snippet = rawText?.trim().replace(/\s+/g, ' ').slice(0, 200);
    const message =
      snippet || `Open DART 프록시 요청이 실패했습니다. (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (parseError) {
    const snippet = rawText?.trim().replace(/\s+/g, ' ').slice(0, 200);
    const message = snippet
      ? `Open DART 프록시 응답을 해석할 수 없습니다. (${snippet})`
      : 'Open DART 프록시 응답을 해석할 수 없습니다.';
    throw new Error(message);
  }

  if (result?.error) {
    throw new Error(result.error);
  }

  return result ?? {};
};

const normalizeName = (value = '') =>
  value
    .normalize('NFKC')
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

const buildBigrams = (value = '') => {
  const normalized = normalizeName(value);
  if (normalized.length <= 1) {
    return new Set([normalized]);
  }
  const set = new Set();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    set.add(normalized.slice(i, i + 2));
  }
  return set;
};

const similarityScore = (a = '', b = '') => {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);
  if (!normalizedA && !normalizedB) return 1;
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const setA = buildBigrams(normalizedA);
  const setB = buildBigrams(normalizedB);
  const intersection = new Set();
  setA.forEach((value) => {
    if (setB.has(value)) intersection.add(value);
  });
  const unionSize = new Set([...setA, ...setB]).size;
  if (unionSize === 0) return 0;
  return intersection.size / unionSize;
};

export const fetchCorpCodeMap = async ({ forceRefresh = false } = {}) => {
  if (typeof window !== 'undefined' && !forceRefresh) {
    try {
      const cachedText = window.localStorage.getItem(CORP_CODE_CACHE_KEY);
      if (cachedText) {
        const cached = JSON.parse(cachedText);
        if (cached && Array.isArray(cached.items) && cached.storedAt) {
          const age = Date.now() - cached.storedAt;
          if (age < CORP_CODE_CACHE_TTL) {
            return cached.items;
          }
        }
      }
    } catch (error) {
      console.warn('[OpenDART] 캐시를 읽을 수 없습니다.', error);
    }
  }

  const { data } = await callOpenDartProxy({ action: 'corpCode' });
  if (!Array.isArray(data)) {
    throw new Error('Open DART corpCode 데이터를 받아오지 못했습니다.');
  }

  const items = data
    .map((item) => ({
      corpCode: item.corpCode,
      corpName: item.corpName,
      stockCode: item.stockCode,
      modifyDate: item.modifyDate,
    }))
    .filter((item) => item.corpCode && item.corpName);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        CORP_CODE_CACHE_KEY,
        JSON.stringify({ items, storedAt: Date.now() })
      );
    } catch (error) {
      console.warn('[OpenDART] 캐시를 저장할 수 없습니다.', error);
    }
  }

  return items;
};

export const findBestCorpMatch = (companyName, corpList = []) => {
  if (!companyName || !corpList.length) return null;
  const normalizedTarget = normalizeName(companyName);
  if (!normalizedTarget) return null;

  const exact = corpList.find((item) => normalizeName(item.corpName) === normalizedTarget);
  if (exact) {
    return { ...exact, score: 1 };
  }

  const contains = corpList.find((item) => normalizeName(item.corpName).includes(normalizedTarget));
  if (contains) {
    return { ...contains, score: 0.9 };
  }

  let best = null;
  corpList.forEach((item) => {
    const score = similarityScore(companyName, item.corpName);
    if (!best || score > best.score) {
      best = { ...item, score };
    }
  });

  if (!best || best.score < 0.3) {
    return null;
  }
  return best;
};

const mapFullTime = (value) => {
  const normalized = (value || '').toString().trim().toUpperCase();
  if (!normalized) return '';
  if (['Y', 'YES', 'TRUE', '1'].includes(normalized)) return '상근';
  if (['N', 'NO', 'FALSE', '0'].includes(normalized)) return '비상근';
  return value;
};

const mapRegisteredStatus = (value) => {
  const normalized = (value || '').toString().trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'Y') return '등기';
  if (normalized === 'N') return '미등기';
  return value;
};

const coerceDateString = (value) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}[.-]?\d{2}[.-]?\d{2}$/.test(trimmed)) {
    const digits = trimmed.replace(/[^\d]/g, '');
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return trimmed;
};

const normalizeExecutiveEntry = (entry = {}) => {
  const tenureEndDate = coerceDateString(entry.tenure_end_on);
  const notes = [
    entry.adres ? `주소: ${entry.adres}` : '',
    entry.resp_task ? `담당: ${entry.resp_task}` : '',
    tenureEndDate ? `임기만료일: ${tenureEndDate}` : '',
  ]
    .filter(Boolean)
    .join(' / ');

  return {
    name: (entry.nm || '').trim(),
    gender: (entry.sexdstn || '').trim(),
    birth: (entry.brth_yy || '').trim(),
    title: (entry.ofcps || '').trim(),
    duty: (entry.chrg_job || '').trim(),
    registeredStatus: mapRegisteredStatus(entry.rgist_exctv_at),
    fullTime: mapFullTime(entry.fte_at),
    career: (entry.main_career || '').trim(),
    tenure: (entry.hffc_pd || '').trim() || (tenureEndDate ? `임기만료일 ${tenureEndDate}` : ''),
    notes: notes || undefined,
    raw: entry,
  };
};

export const fetchExecutiveStatus = async ({ corpCode, bsnsYear, reprtCode, signal } = {}) => {
  if (!corpCode) throw new Error('corp_code 값이 필요합니다.');
  if (!bsnsYear) throw new Error('bsns_year 값이 필요합니다.');
  if (!reprtCode) throw new Error('reprt_code 값이 필요합니다.');

  const { data } = await callOpenDartProxy({
    action: 'executives',
    payload: {
      corpCode,
      bsnsYear: String(bsnsYear),
      reprtCode: String(reprtCode),
    },
    signal,
  });

  if (!data) {
    throw new Error('Open DART 응답을 해석할 수 없습니다.');
  }

  if (data.status && data.status !== '000') {
    const message = data.message || 'Open DART API 요청이 실패했습니다.';
    throw new Error(`${message} (status=${data.status})`);
  }

  const list = Array.isArray(data.list) ? data.list : [];
  const normalized = list.map((item) => normalizeExecutiveEntry(item));

  const registered = normalized.filter((item) => item.registeredStatus === '등기');
  const unregistered = normalized.filter((item) => item.registeredStatus !== '등기');

  return {
    meta: {
      corpName: data.corp_name,
      corpCode,
      bsnsYear: String(bsnsYear),
      reprtCode: String(reprtCode),
      message: data.message,
    },
    registered,
    unregistered,
    raw: data,
  };
};

export const getReportLabel = (code) => REPORT_CODES[code] || code;
