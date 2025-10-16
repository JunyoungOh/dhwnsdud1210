const { isKakaoWorkAvailable, postToKakaoWork } = require('../lib/kakaowork');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (!isKakaoWorkAvailable()) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'KakaoWork webhook is not configured.' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing request body.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (error) {
    console.error('Invalid JSON payload received.', error);
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON payload.' }),
    };
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Text is required.' }),
    };
  }

  try {
    await postToKakaoWork(text);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error('Error relaying KakaoWork webhook.', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unexpected error relaying KakaoWork webhook.' }),
    };
  }
};
