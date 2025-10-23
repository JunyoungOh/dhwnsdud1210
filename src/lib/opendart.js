const PROXY_URL = '/.netlify/functions/opendart-proxy'
const CORP_CACHE_KEY = 'opendart:corp-code:json:v2'
const CORP_CACHE_TTL = 24 * 60 * 60 * 1000

export async function callOpenDartProxy({ action, params } = {}) {
  const res = await fetch(PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params }) })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { error: text } }
  if (!res.ok) {
    const serverMsg = json?.error || ''
    const isTimeout = res.status === 504 || /timeout|지연/i.test(serverMsg)
    const hint = isTimeout ? 'DART 응답이 지연되고 있습니다. 보고서 유형/연도를 바꿔 보거나 잠시 후 재시도해 주세요.' : ''
    throw new Error(serverMsg ? `${serverMsg}${hint?` — ${hint}`:''}` : `Open DART 프록시 요청 실패 (HTTP ${res.status}) ${hint}`)
  }
  return json
}

export async function fetchCorpCodeMap({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const raw = localStorage.getItem(CORP_CACHE_KEY)
    if (raw) {
      const { ts, data } = JSON.parse(raw)
      if (Date.now() - ts < CORP_CACHE_TTL) return data
    }
  }
  const { data } = await callOpenDartProxy({ action: 'corpCode' })
  localStorage.setItem(CORP_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  return data
}

export function findBestCorpMatch(list, companyName) {
  const norm = s => (s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
  const target = norm(companyName)
  let hit = list.find(x => norm(x.corpName) === target)
  if (hit) return hit.corpCode
  hit = list.find(x => norm(x.corpName).includes(target) || target.includes(norm(x.corpName)))
  return hit?.corpCode || null
}

export async function fetchExecutiveStatus({ corpCode, bsnsYear, reprtCode }) {
  const payload = await callOpenDartProxy({ action: 'executives', params: { corp_code: corpCode, bsns_year: bsnsYear, reprt_code: reprtCode } })
  if (payload?.status !== '000') throw new Error(payload?.message || 'Open DART API 오류')
  const list = Array.isArray(payload.list) ? payload.list : []
  const normalized = list.map(normalizeExecutiveRow)
  return {
    meta: { corpName: payload.corp_name, rceptNo: payload.rcept_no },
    rows: normalized,
    registered: normalized.filter(x => x.registered === 'registered'),
    unregistered: normalized.filter(x => x.registered !== 'registered')
  }
}

function normalizeExecutiveRow(row) {
  const clean = v => (v ?? '').toString().trim()
  const toDate = s => { const t = clean(s); const m = t.match(/\d{4}[.-]\d{2}[.-]\d{2}/); return m ? m[0].replace(/\./g,'-') : null }
  const reg = s => { const v = clean(s); if (/등기/.test(v)) return 'registered'; if (/미등기/.test(v)) return 'non_registered'; return null }
  const ft  = s => (/상근/.test(clean(s)) ? 'fulltime' : /비상근/.test(clean(s)) ? 'parttime' : null)
  return {
    corpCode: clean(row.corp_code),
    corpName: clean(row.corp_name),
    name: clean(row.nm),
    position: clean(row.ofcps),
    registered: reg(row.rgist_exctv_at),
    fulltime: ft(row.fte_at),
    role: clean(row.chrg_job),
    mainCareer: clean(row.main_career),
    relation: clean(row.mxmm_shrholdr_relate),
    birthYm: clean(row.birth_ym),
    tenurePeriod: clean(row.hffc_pd),
    tenureEndOn: toDate(row.tenure_end_on),
    stlmDt: toDate(row.stlm_dt)
  }
}

// Helpers for filename → params
export function pickReprtCodeFromFilename(fileName='') {
  const s = fileName.toLowerCase()
  if (s.includes('반기') || s.includes('half')) return '11012'
  if (s.includes('3분기') || s.includes('3q'))   return '11014'
  if (s.includes('1분기') || s.includes('1q'))   return '11013'
  return '11011'
}
export function pickBsnsYearFromFilename(fileName='', fallbackYear=new Date().getFullYear()) {
  const m = fileName.match(/(20\d{2})/); return m ? m[1] : String(fallbackYear)
}