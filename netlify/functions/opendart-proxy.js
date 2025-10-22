const API_BASE_URL = 'https://opendart.fss.or.kr/api';

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

const getApiKey = () => {
  const key = process.env.OPENDART_API_KEY;
  if (!key) {
    throw new Error('OpenDART API key is not configured. Set OPENDART_API_KEY.');
  }
  return key;
};

const fetchCorpCode = async () => {
  const apiKey = getApiKey();
  const url = `${API_BASE_URL}/corpCode.xml?crtfc_key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`corpCode 요청에 실패했습니다. (HTTP ${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
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

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`exctvSttus 요청에 실패했습니다. (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data) {
    throw new Error('OpenDART 응답을 해석할 수 없습니다.');
  }

  return data;
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
      const base64Zip = await fetchCorpCode();
      return jsonResponse(200, { data: base64Zip }, { 'Cache-Control': 'public, max-age=3600' });
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