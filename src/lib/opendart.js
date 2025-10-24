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

const ASCII_SEGMENT_ENTRIES = [
  ['hyundai motor', '현대자동차'],
  ['hyundai heavy', '현대중공업'],
  ['amorepacific', '아모레퍼시픽'],
  ['skhynix', '에스케이하이닉스'],
  ['coupang', '쿠팡'],
  ['electronics', '전자'],
  ['electronic', '전자'],
  ['solutions', '솔루션'],
  ['solution', '솔루션'],
  ['chemical', '케미칼'],
  ['chemicals', '케미칼'],
  ['chem', '케미칼'],
  ['hynix', '하이닉스'],
  ['samsung', '삼성'],
  ['hyundai', '현대'],
  ['kia motors', '기아자동차'],
  ['kia', '기아'],
  ['posco', '포스코'],
  ['lotte', '롯데'],
  ['hanwha', '한화'],
  ['hanjin', '한진'],
  ['naver', '네이버'],
  ['kakao', '카카오'],
  ['amore', '아모레'],
  ['emart', '이마트'],
  ['shinsegae', '신세계'],
  ['bibigo', '비비고'],
  ['kolon', '코오롱'],
  ['hanmi', '한미'],
  ['woori', '우리'],
  ['shinhan', '신한'],
  ['cgv', '씨지브이'],
  ['mobis', '모비스'],
  ['motor', '모터'],
  ['motors', '모터스'],
  ['steel', '스틸'],
  ['energy', '에너지'],
  ['display', '디스플레이'],
  ['telecom', '텔레콤'],
  ['ktng', '케이티엔지'],
  ['ktg', '케이티지'],
  ['kt', '케이티'],
  ['nhn', '엔에이치엔'],
  ['enm', '이엔엠'],
  ['cns', '씨엔에스'],
  ['sds', '에스디에스'],
  ['ssg', '신세계'],
  ['hmm', '에이치엠엠'],
  ['sk', '에스케이'],
  ['cj', '씨제이'],
  ['gs', '지에스'],
  ['lg', '엘지'],
  ['kb', '케이비'],
  ['nh', '엔에이치'],
  ['bnk', '비엔케이'],
  ['hybe', '하이브'],
  ['sm', '에스엠'],
  ['spc', '에스피씨'],
  ['hana', '하나'],
]

const ASCII_SEGMENT_MAP = ASCII_SEGMENT_ENTRIES.sort((a, b) => b[0].length - a[0].length)

function applyAsciiSegmentReplacements(value = '') {
  let result = value
  for (const [segment, replacement] of ASCII_SEGMENT_MAP) {
    const pattern = new RegExp(segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    result = result.replace(pattern, replacement)
  }
  return result
}

const HANGUL_ASCII_PATTERNS = [
  ['더블유', 'w'],
  ['에이치', 'h'],
  ['에이', 'a'],
  ['비', 'b'],
  ['씨', 'c'],
  ['디', 'd'],
  ['이엔엠', 'ienm'],
  ['이앤씨', 'enc'],
  ['이앤디', 'end'],
  ['앤씨', 'nc'],
  ['앤디', 'nd'],
  ['앤드', 'nd'],
  ['앤엠', 'nm'],
  ['엔씨', 'nc'],
  ['엔디', 'nd'],
  ['엔엠', 'nm'],
  ['에프', 'f'],
  ['지', 'g'],
  ['아이', 'i'],
  ['제이', 'j'],
  ['케이', 'k'],
  ['엘', 'l'],
  ['엠', 'm'],
  ['엔', 'n'],
  ['오', 'o'],
  ['피', 'p'],
  ['큐', 'q'],
  ['알', 'r'],
  ['에스', 's'],
  ['티', 't'],
  ['유', 'u'],
  ['브이', 'v'],
  ['엑스', 'x'],
  ['와이', 'y'],
  ['제트', 'z'],
].sort((a, b) => b[0].length - a[0].length)

const asciiNameCache = new Map()
const expandedNameCache = new Map()

const asciiOnly = (value = '') => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')

function expandKnownKeywords(value = '') {
  if (!value) return ''
  const replacedAmpersand = value.replace(/&/g, ' 앤 ')
  return applyAsciiSegmentReplacements(replacedAmpersand)
}

function getExpandedCorpName(name = '') {
  if (!name) return ''
  if (expandedNameCache.has(name)) return expandedNameCache.get(name)
  const expanded = expandKnownKeywords(name)
  expandedNameCache.set(name, expanded)
  return expanded
}

function getAsciiFingerprint(name = '') {
  if (!name) return ''
  if (asciiNameCache.has(name)) return asciiNameCache.get(name)

  const source = expandKnownKeywords(name).replace(/\s+/g, '')
  let result = ''
  let index = 0

  while (index < source.length) {
    let matched = false
    for (const [hangul, ascii] of HANGUL_ASCII_PATTERNS) {
      if (source.startsWith(hangul, index)) {
        result += ascii
        index += hangul.length
        matched = true
        break
      }
    }

    if (!matched) {
      const char = source[index]
      if (/[a-z0-9]/.test(char)) {
        result += char
      }
      index += 1
    }
  }

  asciiNameCache.set(name, result)
  return result
}

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
  const clean = (value) => (value ?? '').toString().trim()
  const norm = (value) => clean(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const expandedInput = expandKnownKeywords(companyName)
  const target = norm(expandedInput)
  if (!target) return null

  const rawTarget = clean(companyName)
  const numericTarget = rawTarget.replace(/[^0-9]/g, '')
  const asciiTarget = asciiOnly(expandedInput)

  if (rawTarget) {
    const byCorpCode = list.find((item) => {
      const corpCode = clean(item.corpCode)
      if (!corpCode) return false
      if (corpCode === rawTarget) return true
      if (numericTarget && corpCode.replace(/^0+/, '') === numericTarget.replace(/^0+/, '')) return true
      return false
    })
    if (byCorpCode) return byCorpCode

    const byStockCode = list.find((item) => {
      const stockCode = clean(item.stockCode)
      if (!stockCode) return false
      if (stockCode === rawTarget) return true
      if (numericTarget && stockCode.replace(/^0+/, '') === numericTarget.replace(/^0+/, '')) return true
      return norm(stockCode) === target
    })
    if (byStockCode) return byStockCode
  }

  const exact = list.find((item) => norm(getExpandedCorpName(item.corpName)) === target)
  if (exact) return exact

  const prefix = list.find((item) => {
    const name = norm(getExpandedCorpName(item.corpName))
    return name.startsWith(target) || target.startsWith(name)
  })
  if (prefix) return prefix

  const partial = list.find((item) => {
    const name = norm(getExpandedCorpName(item.corpName))
    return name.includes(target) || target.includes(name)
  })
  if (partial) return partial

  if (asciiTarget.length >= 2) {
    const asciiMatch = list.find((item) => {
      const alias = asciiOnly(getAsciiFingerprint(item.corpName))
      if (!alias || alias.length < 2) return false
      if (alias === asciiTarget) return true
      if (alias.startsWith(asciiTarget) || asciiTarget.startsWith(alias)) return true
      return alias.includes(asciiTarget) || asciiTarget.includes(alias)
    })
    if (asciiMatch) return asciiMatch
  }

  return null
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
