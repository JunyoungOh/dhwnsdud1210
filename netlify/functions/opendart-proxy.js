// netlify/functions/opendart-proxy.js
import fetch from "node-fetch";

const DEFAULT_TIMEOUT_MS = 20000;
const ATTEMPTS_CORPCODE = 3;
const ATTEMPTS_EXEC = 2;
const CACHE_TTL_MS = 1000 * 60 * 60;

const API_KEY = process.env.OPENDART_API_KEY;

const cache = new Map();
const VALID_REPRT = new Set(["11011","11012","11013","11014"]);
const MIN_YEAR = 2015;

const withTimeout = (ms, controller) => setTimeout(() => controller.abort(), ms);

async function withRetry(n, fn) {
  let last;
  for (let i=0;i<n;i++) {
    try { return await fn(i); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, Math.min(1600, 250 * (2**i)))) }
  }
  throw last;
}

function okJSON(body, extraHeaders={}) {
  return { statusCode: 200, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...extraHeaders }, body: JSON.stringify(body) };
}
function errJSON(status, message, extra={}) {
  return { statusCode: status, headers: { "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ ok:false, message, ...extra }) };
}

export const handler = async (event) => {
  const t0 = Date.now();
  try {
    if (event.httpMethod !== "POST") return errJSON(405, "Method Not Allowed");
    const { mode, payload } = JSON.parse(event.body || "{}");

    if (mode === "ping") return okJSON({ ok:true, pong:true }, { "x-elapsed-ms": `${Date.now()-t0}` });

    if (mode === "execStatus") {
      const { corp_code, bsns_year, reprt_code } = payload || {};
      if (!corp_code) return errJSON(400, "Missing corp_code");
      if (!bsns_year || +bsns_year < MIN_YEAR) return errJSON(400, `bsns_year must be >= ${MIN_YEAR}`);
      if (!reprt_code || !VALID_REPRT.has(String(reprt_code))) return errJSON(400, "Invalid reprt_code");

      const key = `exec:${corp_code}:${bsns_year}:${reprt_code}`;
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expires > now) return okJSON({ from_cache:true, ...hit.data }, { "x-elapsed-ms": `${Date.now()-t0}` });

      const url = `https://opendart.fss.or.kr/api/exctvSttus.json?crtfc_key=${API_KEY}&corp_code=${corp_code}&bsns_year=${bsns_year}&reprt_code=${reprt_code}`;
      const controller = new AbortController();
      const timer = withTimeout(DEFAULT_TIMEOUT_MS, controller);
      try {
        const res = await withRetry(ATTEMPTS_EXEC, async () => {
          const r = await fetch(url, { signal: controller.signal });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        });
        const data = await res.json();
        cache.set(key, { expires: now + CACHE_TTL_MS, data });
        return okJSON({ from_cache:false, ...data }, { "x-elapsed-ms": `${Date.now()-t0}` });
      } catch (e) {
        const isAbort = e.name === "AbortError";
        return errJSON(isAbort ? 504 : 502, `execStatus fetch failed: ${e.message}`, { elapsed_ms: Date.now()-t0 });
      } finally {
        clearTimeout(timer);
      }
    }

    if (mode === "corpCode") {
      const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`;
      const controller = new AbortController();
      const timer = withTimeout(DEFAULT_TIMEOUT_MS, controller);
      try {
        const res = await withRetry(ATTEMPTS_CORPCODE, async () => {
          const r = await fetch(url, { signal: controller.signal });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        });
        const buf = await res.buffer();
        return { statusCode: 200, headers: { "content-type":"application/octet-stream", "x-elapsed-ms": `${Date.now()-t0}` }, body: buf.toString("base64"), isBase64Encoded: true };
      } catch (e) {
        const isAbort = e.name === "AbortError";
        return errJSON(isAbort ? 504 : 502, `corpCode fetch failed: ${e.message}`, { elapsed_ms: Date.now()-t0 });
      } finally {
        clearTimeout(timer);
      }
    }

    return errJSON(400, "Unknown mode");
  } catch (e) {
    return errJSON(500, `Internal Error: ${e.message}`);
  }
};
