import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const args = new Set(process.argv.slice(2));
const skipOnMissingKey = args.has('--skip-on-missing-key');
const quiet = args.has('--quiet');

const API_KEY = process.env.OPENDART_API_KEY || process.env.REACT_APP_OPENDART_API_KEY;

function log(message) {
  if (!quiet) {
    console.log(message);
  }
}

if (!API_KEY) {
  const message = 'OPENDART_API_KEY 환경 변수가 설정되어 있지 않아 corp-code.json을 갱신하지 않았습니다.';
  if (skipOnMissingKey) {
    if (!quiet) {
      console.warn(`[update-corp-codes] ${message}`);
    }
    process.exit(0);
  }
  console.error(`[update-corp-codes] ${message}`);
  process.exit(1);
}

const ENDPOINT = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`;
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'corp-code.json');

function normalizeEntry(item = {}) {
  return {
    corp_code: item.corpCode || item.corp_code || '',
    corp_name: item.corpName || item.corp_name || '',
    stock_code: item.stockCode || item.stock_code || '',
    modify_date: item.modifyDate || item.modify_date || '',
  };
}

(async () => {
  log('[update-corp-codes] Fetching corpCode.xml from Open DART...');
  const response = await fetch(ENDPOINT);
  if (!response.ok) {
    throw new Error(`corpCode.xml 다운로드 실패 (HTTP ${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);
  const xmlEntryName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.xml'));
  if (!xmlEntryName) {
    throw new Error('ZIP 파일에서 XML 항목을 찾지 못했습니다.');
  }

  const xml = await zip.file(xmlEntryName).async('text');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    isArray: (name) => name === 'list',
  });

  const parsed = parser.parse(xml);
  const rawList = parsed?.result?.list || [];
  const list = Array.isArray(rawList) ? rawList : [];
  const entries = list
    .map((item) => normalizeEntry(item))
    .filter((item) => item.corp_code && item.corp_name);

  if (entries.length === 0) {
    throw new Error('Open DART에서 받은 corpCode 목록이 비어 있습니다.');
  }

  const payload = {
    updated_at: new Date().toISOString(),
    count: entries.length,
    list: entries,
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  log(`[update-corp-codes] corp-code.json 업데이트 완료 (총 ${entries.length.toLocaleString()}개 기업)`);
})().catch((error) => {
  console.error(`[update-corp-codes] ${error.message}`);
  process.exit(1);
});