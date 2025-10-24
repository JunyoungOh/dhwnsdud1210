// src/utils/opendart.js
const REPRT_CODE_MAP = { business: "11011", half: "11012", q1: "11013", q3: "11014" };

export async function loadCorpCodeJson() {
  const res = await fetch("/corp-code.json", { cache: "reload" });
  if (!res.ok) {
    throw new Error(`corp-code.json을 불러오지 못했습니다. (HTTP ${res.status}) — public/corp-code.json을 저장해 주세요.`);
  }
  const json = await res.json();
  if (!json || !Array.isArray(json.list)) throw new Error("Invalid corp-code.json format");
  return json.list;
}

export function findBestCorpMatch(companyName, corpList) {
  if (!companyName || !corpList?.length) return null;
  const name = companyName.trim();
  let hit = corpList.find(c => c.corp_name === name);
  if (hit) return hit;
  hit = corpList.find(c => c.corp_name.startsWith(name));
  if (hit) return hit;
  hit = corpList.find(c => c.corp_name.includes(name));
  return hit || null;
}

async function callProxy(mode, payload) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch("/.netlify/functions/opendart-proxy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, payload }),
    });
  } catch (e) {
    throw new Error(`Open DART 프록시 네트워크 오류: ${e.message}`);
  }

  const elapsed = (performance.now() - t0).toFixed(0);
  if (!res.ok) {
    let snippet = "";
    try { const j = await res.json(); snippet = j?.message || ""; } catch {}
    const isTimeout = res.status === 504 || /timeout|지연|abort/i.test(snippet);
    const hint = isTimeout ? " — DART 응답이 지연되었거나 플랫폼 시간 제한에 걸렸습니다. 잠시 후 다시 시도하거나 보고서/연도를 변경해 보세요." : "";
    throw new Error(`Open DART 프록시 요청이 실패했습니다. (HTTP ${res.status}, ${elapsed}ms)${hint}`);
  }
  return await res.json();
}

export async function fetchExecutiveStatusByName(companyName, bsns_year, reprt_code) {
  const code = REPRT_CODE_MAP[reprt_code] || String(reprt_code);
  if (!["11011","11012","11013","11014"].includes(code)) {
    throw new Error("유효하지 않은 reprt_code입니다. (business/half/q1/q3 또는 11011/11012/11013/11014)");
  }
  const corpList = await loadCorpCodeJson();
  const matched = findBestCorpMatch(companyName, corpList);
  if (!matched?.corp_code) throw new Error(`회사명을 corp_code로 매핑하지 못했습니다: ${companyName}`);

  // One retry on 504
  try {
    return await callProxy("execStatus", { corp_code: matched.corp_code, bsns_year, reprt_code: code });
  } catch (e) {
    if (/HTTP 504/.test(e.message)) {
      await new Promise(r => setTimeout(r, 600));
      return await callProxy("execStatus", { corp_code: matched.corp_code, bsns_year, reprt_code: code });
    }
    throw e;
  }
}
