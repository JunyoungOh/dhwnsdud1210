const PROXY_URL = '/.netlify/functions/opendart-proxy'
const CORP_CACHE_KEY = 'opendart:corp-code:json:v3'
const CORP_CACHE_TTL = 24 * 60 * 60 * 1000

const REPORT_CODE_ALIASES = {
  business: '11011',
  half: '11012',
  q1: '11013',
  q3: '11014',
}

export const REPORT_CODE_OPTIONS = [
  { code: '11011', label: '사업보고서 (정기)' },
  { code: '11012', label: '반기보고서' },
  { code: '11013', label: '1분기보고서' },
  { code: '11014', label: '3분기보고서' },
]

export function getReportLabel(code) {
  const target = normalizeReprtCode(code)
  const hit = REPORT_CODE_OPTIONS.find((option) => option.code === target)
  return hit ? hit.label : '사업보고서 (정기)'
}

function normalizeReprtCode(code) {
  const raw = (code ?? '').toString().trim()
  if (!raw) return '11011'
  const alias = REPORT_CODE_ALIASES[raw.toLowerCase()]
  return alias || raw
}

async function callOpenDartProxy({ action, params } = {}) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  })

  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { error: text }
  }

  if (!res.ok || json?.ok === false) {
    const serverMsg = json?.error || json?.message || ''
    const isTimeout = res.status === 504 || /timeout|지연/i.test(serverMsg)
    const hint = isTimeout
      ? 'DART 응답이 지연되고 있습니다. 보고서 유형/연도를 바꿔 보거나 잠시 후 재시도해 주세요.'
      : ''
    throw new Error(
      serverMsg
        ? `${serverMsg}${hint ? ` — ${hint}` : ''}`
        : `Open DART 프록시 요청 실패 (HTTP ${res.status}) ${hint}`,
    )
  }
  
  return json
}

export async function fetchCorpCodeMap({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CORP_CACHE_KEY) : null
    if (raw) {
      try {
        const { ts, data } = JSON.parse(raw)
        if (Date.now() - ts < CORP_CACHE_TTL && Array.isArray(data)) return data
      } catch {
        // ignore cache parse errors
      }
    }
  }

  const response = await callOpenDartProxy({ action: 'corpCode' })
  const rows = Array.isArray(response?.data) ? response.data : []
  const mapped = rows.map((item) => ({
    corpCode: item.corpCode || item.corp_code,
    corpName: item.corpName || item.corp_name,
    stockCode: item.stockCode || item.stock_code || '',
    modifyDate: item.modifyDate || item.modify_date || '',
  }))

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CORP_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: mapped }))
  }

  return mapped
}

export function findBestCorpMatch(companyName, list = []) {
  const norm = (value) => (value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const target = norm(companyName)
  if (!target) return null

  const exact = list.find((item) => norm(item.corpName) === target)
  if (exact) return exact

  const prefix = list.find((item) => {
    const name = norm(item.corpName)
    return name.startsWith(target) || target.startsWith(name)
  })
  if (prefix) return prefix

  return list.find((item) => {
    const name = norm(item.corpName)
    return name.includes(target) || target.includes(name)
  }) || null
}

export async function fetchExecutiveStatus({ corpCode, bsnsYear, reprtCode }) {
  if (!corpCode) throw new Error('corpCode가 필요합니다.')
  const normalizedReprtCode = normalizeReprtCode(reprtCode)
  if (!['11011', '11012', '11013', '11014'].includes(normalizedReprtCode)) {
    throw new Error('유효하지 않은 reprtCode입니다. (11011, 11012, 11013, 11014 중 선택)')
  }

  const payload = await callOpenDartProxy({
    action: 'executives',
    params: {
      corp_code: corpCode,
      bsns_year: String(bsnsYear),
      reprt_code: normalizedReprtCode,
    },
  })

  const list = Array.isArray(payload?.list) ? payload.list : []
  const normalizedRows = list.map((row, index) => normalizeExecutiveRow(row, index))
  const registered = normalizedRows.filter((item) => item.registered === 'registered')
  const unregistered = normalizedRows.filter((item) => item.registered !== 'registered')

  return {
    meta: {
      corpCode: payload?.corp_code || corpCode,
      corpName: payload?.corp_name || '',
      corpCls: payload?.corp_cls || '',
      rceptNo: payload?.rcept_no || '',
      status: payload?.status || '',
      statusMessage: payload?.message || '',
      bsnsYear: String(bsnsYear),
      reprtCode: normalizedReprtCode,
      fromCache: Boolean(payload?.from_cache),
    },
    raw: payload,
    rows: normalizedRows,
    registered,
    unregistered,
  }
}

function normalizeExecutiveRow(row = {}, index = 0) {
  const clean = (value) => (value ?? '').toString().trim()
  const toDate = (value) => {
    const text = clean(value)
    const match = text.match(/\d{4}[.-]\d{2}[.-]\d{2}/)
    return match ? match[0].replace(/\./g, '-') : ''
  }

  const registeredRaw = clean(row.rgist_exctv_at)
  let registered = null
  if (/등기/.test(registeredRaw)) registered = 'registered'
  else if (/미등기/.test(registeredRaw)) registered = 'non_registered'

  const fullTimeRaw = clean(row.fte_at)
  let fullTimeCode = null
  if (/상근/.test(fullTimeRaw)) fullTimeCode = 'fulltime'
  else if (/비상근/.test(fullTimeRaw)) fullTimeCode = 'parttime'

  return {
    id: clean(row.nm) ? `${clean(row.corp_code)}-${clean(row.nm)}-${index}` : `${clean(row.corp_code)}-${index}`,
    corpCode: clean(row.corp_code),
    corpName: clean(row.corp_name),
    name: clean(row.nm),
    title: clean(row.ofcps),
    duty: clean(row.chrg_job),
    registered,
    registeredStatus: registeredRaw || (registered === 'registered' ? '등기' : registered === 'non_registered' ? '미등기' : ''),
    fullTime: fullTimeRaw,
    fullTimeCode,
    relation: clean(row.mxmm_shrholdr_relate),
    mainCareer: clean(row.main_career),
    birthYm: clean(row.birth_ym),
    tenurePeriod: clean(row.hffc_pd),
    tenureEndOn: toDate(row.tenure_end_on),
    settlementDate: toDate(row.stlm_dt),
    raw: row,
  }
}

// Helpers for filename → params
export function pickReprtCodeFromFilename(fileName = '') {
  const lower = fileName.toLowerCase()
  if (lower.includes('반기') || lower.includes('half')) return '11012'
  if (lower.includes('3분기') || lower.includes('3q')) return '11014'
  if (lower.includes('1분기') || lower.includes('1q')) return '11013'
  return '11011'
}

export function pickBsnsYearFromFilename(fileName = '', fallbackYear = new Date().getFullYear()) {
  const match = fileName.match(/(20\d{2})/)
  return match ? match[1] : String(fallbackYear)
}

export { callOpenDartProxy }
