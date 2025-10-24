// netlify/functions/opendart-proxy.js
import { promises as fs } from "fs";
import path from "path";

const DEFAULT_TIMEOUT_MS = 20000;
const ATTEMPTS_EXEC = 2;
const CACHE_TTL_MS = 1000 * 60 * 60;
const CORP_CODE_TTL_MS = 1000 * 60 * 30;

const API_KEY = process.env.OPENDART_API_KEY;

const cache = new Map();
const VALID_REPRT = new Set(["11011","11012","11013","11014"]);
const MIN_YEAR = 2015;
const CORP_CODE_FILE = path.resolve(process.cwd(), "public", "corp-code.json");

let corpCodeCache = null;

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

async function loadCorpCodeList() {
  if (corpCodeCache && corpCodeCache.expires > Date.now()) {
    return corpCodeCache.data;
  }

  let raw;
  try {
    raw = await fs.readFile(CORP_CODE_FILE, "utf-8");
  } catch (err) {
    throw new Error(`corp-code.json을 읽는 데 실패했습니다. (${err.message})`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`corp-code.json 형식을 해석하지 못했습니다. (${err.message})`);
  }

  const list = Array.isArray(parsed?.list) ? parsed.list : [];
  const mapped = list.map((item) => ({
    corpCode: item.corp_code,
    corpName: item.corp_name,
    stockCode: item.stock_code || "",
    modifyDate: item.modify_date || "",
  }));

  corpCodeCache = {
    expires: Date.now() + CORP_CODE_TTL_MS,
    data: {
      data: mapped,
      meta: {
        updatedAt: parsed?.updated_at || null,
        count: mapped.length,
      },
    },
  };

  return corpCodeCache.data;
}

function normalizeAction(action) {
  const value = (action || "").toString().trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower === "execstatus") return "executives";
  return lower;
}

export const handler = async (event) => {
  const t0 = Date.now();
  try {
    if (event.httpMethod !== "POST") return errJSON(405, "Method Not Allowed");
    const body = JSON.parse(event.body || "{}");
    const action = normalizeAction(body?.action || body?.mode);
    const params = body?.params || body?.payload || {};

    if (action === "ping") return okJSON({ ok:true, pong:true }, { "x-elapsed-ms": `${Date.now()-t0}` });

    if (action === "corpcode") {
      try {
        const data = await loadCorpCodeList();
        return okJSON({ ok:true, ...data }, { "x-elapsed-ms": `${Date.now()-t0}` });
      } catch (err) {
        return errJSON(500, err.message || "corp-code.json 로드 실패");
      }
    }

    if (action === "executives") {
      const { corp_code, bsns_year, reprt_code } = params || {};
      if (!API_KEY) return errJSON(500, "Missing env OPENDART_API_KEY");
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

    return errJSON(400, "Unknown action");
  } catch (e) {
    return errJSON(500, `Internal Error: ${e.message}`);
  }
};
