// src/utils/opendart.js
// Thin compatibility layer that re-exports helpers from src/lib/opendart.

import {
  REPORT_CODE_OPTIONS,
  fetchCorpCodeMap,
  findBestCorpMatch,
  fetchExecutiveStatus,
  searchCorpCandidates,
  getReportLabel,
  pickReprtCodeFromFilename,
  pickBsnsYearFromFilename,
} from '../lib/opendart';

const REPRT_CODE_ALIAS = {
  business: '11011',
  half: '11012',
  q1: '11013',
  q3: '11014',
};

function normalizeReprtCode(code) {
  if (!code) return '11011';
  const key = String(code).toLowerCase();
  return REPRT_CODE_ALIAS[key] || String(code);
}

export {
  REPORT_CODE_OPTIONS,
  fetchCorpCodeMap,
  findBestCorpMatch,
  fetchExecutiveStatus,
  searchCorpCandidates,
  getReportLabel,
  pickReprtCodeFromFilename,
  pickBsnsYearFromFilename,
};

export async function fetchExecutiveStatusByName(companyName, bsnsYear, reprtCode) {
  const list = await fetchCorpCodeMap();
  const match = findBestCorpMatch(companyName, list);
  if (!match?.corpCode) {
    throw new Error(`회사명을 corp_code로 매핑하지 못했습니다: ${companyName}`);
  }

  const normalizedReport = normalizeReprtCode(reprtCode);
  return fetchExecutiveStatus({ corpCode: match.corpCode, bsnsYear, reprtCode: normalizedReport });
}

export async function loadCorpCodeJson() {
  return fetchCorpCodeMap();
}

export function findBestCorpMatchCode(companyName, corpList) {
  const match = findBestCorpMatch(companyName, corpList);
  return match?.corpCode || null;
}
