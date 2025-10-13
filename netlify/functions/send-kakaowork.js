const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const isTruthy = (value = '') => {
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized);
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

  const webhookUrl = process.env.KAKAOWORK_WEBHOOK_URL || '';
  const enabledVar = process.env.KAKAOWORK_WEBHOOK_ENABLED;
  const webhookEnabled = enabledVar === undefined ? true : isTruthy(enabledVar);

  if (!webhookUrl || !webhookEnabled) {
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
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Failed to relay KakaoWork webhook.', response.status, detail);
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Failed to deliver KakaoWork webhook request.',
          statusText: response.statusText,
        }),
      };
    }

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
