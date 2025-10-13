// netlify/functions/kakaowork-send.mjs
export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const WEBHOOK_URL = process.env.KAKAOWORK_WEBHOOK_URL || '';
    if (!WEBHOOK_URL) {
      return { statusCode: 500, body: 'Missing KAKAOWORK_WEBHOOK_URL' };
    }

    const MAX_TEXT_LENGTH = 500;

    const { text, blocks } = JSON.parse(event.body || '{}') || {};
    if (!text || typeof text !== 'string') {
      return { statusCode: 400, body: 'text is required' };
    }

    const payload = {
      text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text,
    };
    if (Array.isArray(blocks) && blocks.length > 0) {
      payload.blocks = blocks;
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        statusCode: 502,
        body: `KakaoWork webhook failed: ${res.status} ${detail || res.statusText}`,
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: `Server error: ${err?.message || err}` };
  }
}
