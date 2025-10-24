// tools/one-off-generate-corp-code.js
// Optional local script (NOT part of build).
// Usage:
//   npm i xml2js fflate
//   OPENDART_API_KEY=... node tools/one-off-generate-corp-code.js

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { parseStringPromise } from "xml2js";
import { unzipSync } from "fflate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.OPENDART_API_KEY;
if (!API_KEY) {
  console.error("[one-off] Missing env OPENDART_API_KEY");
  process.exit(1);
}

async function fetchBuffer(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function unzipFlexible(buf) {
  try { return zlib.unzipSync(buf).toString("utf-8"); }
  catch {
    const files = unzipSync(new Uint8Array(buf));
    const firstXml = Object.keys(files).find(n => n.toLowerCase().endsWith(".xml"));
    if (!firstXml) throw new Error("XML entry not found in zip");
    return Buffer.from(files[firstXml]).toString("utf-8");
  }
}

async function main() {
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`;
  console.log("[one-off] Downloading corpCode.xml.zip ...");
  const buf = await fetchBuffer(url);
  const xml = await unzipFlexible(buf);
  const parsed = await parseStringPromise(xml, { explicitArray:false, trim:true });
  const list = parsed?.result?.list || parsed?.result?.corp || [];
  const arr = Array.isArray(list) ? list : [list];
  const mapped = arr.map(it => ({ corp_code: it.corp_code, corp_name: it.corp_name, stock_code: it.stock_code || "", modify_date: it.modify_date || "" }));
  const out = { updated_at: new Date().toISOString(), count: mapped.length, list: mapped };
  const outFile = path.resolve(__dirname, "..", "public", "corp-code.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
  console.log(`[one-off] Wrote ${outFile} (${mapped.length} rows)`);
}

main().catch(e => { console.error("[one-off] Failed:", e); process.exit(2); });
