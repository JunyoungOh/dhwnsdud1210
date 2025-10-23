import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'

const BASE = 'https://opendart.fss.or.kr/api'
const KEY = process.env.OPENDART_API_KEY

const DEFAULT_TIMEOUT_MS = 7000
const ATTEMPTS_CORPCODE = 1
const ATTEMPTS_EXEC = 1

let corpCodeCache = { data: null, ts: 0 }
const CORPCODE_TTL_MS = 24 * 60 * 60 * 1000

export async function handler(event) {
  try {
    if (!KEY) return json(500, { error: 'Missing env OPENDART_API_KEY' })
    if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' }, { Allow: 'POST' })

    const { action, params } = JSON.parse(event.body || '{}')

    if (action === 'corpCode') {
      const now = Date.now()
      if (corpCodeCache.data && now - corpCodeCache.ts < CORPCODE_TTL_MS) {
        return json(200, { data: corpCodeCache.data }, cacheHeader(3600))
      }

      const url = `${BASE}/corpCode.xml?crtfc_key=${encodeURIComponent(KEY)}`
      const arrayBuf = await withRetry(async () => {
        const res = await fetchWithTimeout(url, { timeoutMs: DEFAULT_TIMEOUT_MS })
        if (!res.ok) throw new Error(`corpCode HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        if (!buf || buf.byteLength === 0) throw new Error('corpCode empty body')
        return buf
      }, { attempts: ATTEMPTS_CORPCODE })

      const zip = await JSZip.loadAsync(Buffer.from(arrayBuf))
      const xmlEntry = zip.file(/\.xml$/i)?.[0]
      if (!xmlEntry) throw new Error('corpCode.zip missing XML')
      const xmlText = await xmlEntry.async('text')

      const parser = new XMLParser({ ignoreAttributes: true })
      const parsed = parser.parse(xmlText)
      const list = toArray(parsed?.result?.list?.corp)
      const slim = list.map(it => ({
        corpCode: (it?.corp_code || '').trim(),
        corpName: (it?.corp_name || '').trim(),
        stockCode: (it?.stock_code || '').trim(),
        modifyDate: (it?.modify_date || '').trim()
      })).filter(x => x.corpCode && x.corpName)

      corpCodeCache = { data: slim, ts: Date.now() }
      return json(200, { data: slim }, cacheHeader(86400))
    }

    if (action === 'executives' || action === 'exctvSttus') {
      const { corp_code, bsns_year, reprt_code } = params || {}
      if (!corp_code || !bsns_year || !reprt_code) {
        return json(400, { error: 'corp_code, bsns_year, reprt_code are required' })
      }
      const u = new URL(`${BASE}/exctvSttus.json`)
      u.searchParams.set('crtfc_key', KEY)
      u.searchParams.set('corp_code', String(corp_code))
      u.searchParams.set('bsns_year', String(bsns_year))
      u.searchParams.set('reprt_code', String(reprt_code))

      const payload = await withRetry(async () => {
        const res = await fetchWithTimeout(u, { timeoutMs: DEFAULT_TIMEOUT_MS })
        if (!res.ok) throw new Error(`exctvSttus HTTP ${res.status}`)
        return await res.json()
      }, { attempts: ATTEMPTS_EXEC })

      return json(200, payload, cacheHeader(60))
    }

    return json(400, { error: 'Unknown action' })
  } catch (err) {
    const msg = err?.message || 'proxy error'
    const isTimeout = /timeout|fetch|network|aborted/i.test(msg)
    return json(isTimeout ? 504 : 502, { error: msg })
  }
}

function toArray(x) { return Array.isArray(x) ? x : x ? [x] : [] }
function cacheHeader(s) { return { 'Cache-Control': `public, max-age=${s}` } }
function json(status, body, extra={}) { return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }, body: JSON.stringify(body) } }

async function withRetry(fn, { attempts = 1 } = {}) {
  let last
  for (let i=0;i<attempts;i++) { try { return await fn() } catch (e) { last = e } if (i<attempts-1) await sleep(i?800:250) }
  throw last
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function fetchWithTimeout(resource, { timeoutMs = DEFAULT_TIMEOUT_MS, ...opts } = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(()=>ctrl.abort(new Error('timeout')), timeoutMs)
  try { return await fetch(resource, { ...opts, signal: ctrl.signal }) } finally { clearTimeout(id) }
}
