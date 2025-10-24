// scripts/fetch-corp-code.js
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { parseStringPromise } from "xml2js";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.OPENDART_API_KEY;
if (!API_KEY) {
  console.error("[fetch-corp-code] Missing env OPENDART_API_KEY");
  process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, "..", "public");
const OUT_FILE = path.join(OUT_DIR, "corp-code.json");

async function unzipFlexible(buf) {
  try {
    const xml = zlib.unzipSync(buf).toString("utf-8");
    return xml;
  } catch (e) {
    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(buf));
    const firstXml = Object.keys(files).find(n => n.toLowerCase().endsWith(".xml"));
    if (!firstXml) throw new Error("XML entry not found in zip");
    return Buffer.from(files[firstXml]).toString("utf-8");
  }
}

async function main() {
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`;
  console.log(`[fetch-corp-code] Downloading: ${url.replace(API_KEY, "****")}`);

  const res = await fetch(url, { timeout: 25000 });
  if (!res.ok) {
    console.error(`[fetch-corp-code] HTTP ${res.status}`);
    process.exit(2);
  }
  const buf = await res.buffer();
  const xml = await unzipFlexible(buf);
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });

  const list = parsed?.result?.list || parsed?.result?.corp || [];
  const arr = Array.isArray(list) ? list : [list];

  const mapped = arr.map(it => ({
    corp_code: it.corp_code,
    corp_name: it.corp_name,
    stock_code: it.stock_code || "",
    modify_date: it.modify_date || ""
  }));

  const out = { updated_at: new Date().toISOString(), count: mapped.length, list: mapped };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(`[fetch-corp-code] Wrote ${OUT_FILE} (${mapped.length} rows)`);
}

main().catch(e => {
  console.error("[fetch-corp-code] Failed:", e);
  process.exit(4);
});
