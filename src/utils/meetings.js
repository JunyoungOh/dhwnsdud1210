
// src/utils/meetings.js
import React, { useMemo } from 'react';
// utils/meetings.js
// 회의(미팅) 기록 파싱 & "미팅 데이터" 표 구성 유틸 + (선택) MeetingsPage 컴포넌트

import React from 'react';

/** 날짜 포맷: Date -> 'YYYY-MM-DD' */
export function formatYMD(d) {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 괄호 안의 날짜를 부분적으로도 인식:
 *   (25.12.03) -> 2025-12-03
 *   (2025.12.03) -> 2025-12-03
 *   (25.12) -> 2025-12 (day=1로 내부 정규화, 표시는 YYYY-MM)
 *   (2025.12) -> 2025-12
 *   (25) 단독은 모호해서 무시
 * 구분자: ".", "-", "/", "년", "월", "일" 혼용 일부도 허용
 * 괄호 안 날짜 파싱
 * 허용 예: (25.08.14), (25.12), (2024.7.3), (2024.12)
 * - YY면 2000 + YY 로 가정
 * - 일이 없으면 1일로 보정
 */
export function parseParenthesizedDate(raw) {
  if (!raw) return null;
  const s = String(raw);

  // 괄호 안 텍스트들 모두 스캔
  const parenMatches = [...s.matchAll(/\(([^)]+)\)/g)];
  if (parenMatches.length === 0) return null;

  const results = [];
export function parseParenthesizedDate(str) {
  if (!str) return null;
  // 괄호 안 마지막 패턴만 사용 (우측의 시일)
  const matches = [...str.matchAll(/\(([^)]*)\)/g)];
  if (!matches.length) return null;

  const last = matches[matches.length - 1][1]; // 괄호 안 내용
  const m = last.match(/^\s*(\d{2}|\d{4})\.(\d{1,2})(?:\.(\d{1,2}))?\s*$/);
  if (!m) return null;

  let year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 1;

  if (year < 100) year = 2000 + year; // 2자리 연도 보정
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

  for (const [, inside] of parenMatches) {
    const t = inside.replace(/\s+/g, '');
/** 한 줄 문자열이 '팀' 키워드 포함 여부 */
function hasTeamKeyword(line) {
  if (!line) return false;
  // '팀', '팀황', '팀 미팅', '팀 디너' 등 모두 포함
  return /팀/.test(line);
}

    // yyyy.mm.dd 또는 yy.mm.dd
    let m = t.match(/^((\d{4})|(\d{2}))[\.\-\/년](\d{1,2})(?:[\.\-\/월](\d{1,2}))?/);
    if (!m) continue;
/** 한 줄 문자열이 '케이' 키워드 포함 여부 */
function hasKKeyword(line) {
  if (!line) return false;
  // '케이', '케이 미팅', '케이 콜' 등 모두 포함
  return /케이/.test(line);
}

    const year = m[2] ? parseInt(m[2], 10) : (2000 + parseInt(m[3], 10)); // yy -> 2000+yy
    const month = parseInt(m[4], 10);
    const day = m[5] ? parseInt(m[5], 10) : 1; // 일 없으면 1일로 보정
    if (!month || month < 1 || month > 12) continue;
/**
 * 미팅 기록 텍스트에서 특정 키워드를 포함하는 라인의 가장 최신(우측 괄호 기준) 날짜를 찾음
 * @param {string} recordText 전체 미팅 기록 (멀티라인)
 * @param {'team'|'k'|'any'} mode
 * @returns {Date|null}
 */
export function findLatestByKeyword(recordText, mode = 'any') {
  if (!recordText) return null;
  const lines = recordText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    // 안전한 Date (로컬 기준)
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) continue;
  let latest = null;
  for (const line of lines) {
    const include =
      mode === 'team' ? hasTeamKeyword(line) :
      mode === 'k'    ? hasKKeyword(line)    :
      true;

    const yyyy = String(year).padStart(4, '0');
    const mm = String(month).padStart(2, '0');
    const dd = m[5] ? String(day).padStart(2, '0') : null;
    if (!include) continue;

    results.push({
      date: d,
      precision: dd ? 'day' : 'month',
      display: dd ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}`,
    });
    const d = parseParenthesizedDate(line);
    if (d && (!latest || d > latest)) latest = d;
  }

  if (results.length === 0) return null;

  // 가장 최신일자
  results.sort((a, b) => b.date - a.date);
  return results[0];
  return latest;
}

/**
 * meetingRecord(여러 줄)에서 keywordRe(/팀/ 등)가 들어간 "한 줄"들만 모아
 * 괄호 안 날짜를 찾아 가장 최신의 하나를 반환
 * (빌드 오류 해결용) 외부에서 import 하는 함수 이름을 맞춰서 export
 * - recordText 안에서 팀/케이 관련 최신 날짜를 뽑아 반환
 * - 사용처가 달라도 안전하게 쓰도록 넓은 형태로 제공
 * @param {string} recordText
 * @returns {{ teamLatest: Date|null, kLatest: Date|null, anyLatest: Date|null }}
 */
export function findLatestByKeyword(meetingRecord, keywordRe) {
  if (!meetingRecord) return null;
  const lines = String(meetingRecord).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const targetLines = lines.filter(l => keywordRe.test(l));
  if (targetLines.length === 0) return null;

  const candidates = [];
  for (const line of targetLines) {
    const parsed = parseParenthesizedDate(line);
    if (parsed) candidates.push({ ...parsed, line });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.date - a.date);
  return candidates[0];
export function extractMeetingDates(recordText) {
  const teamLatest = findLatestByKeyword(recordText, 'team');
  const kLatest    = findLatestByKeyword(recordText, 'k');
  const anyLatest  = findLatestByKeyword(recordText, 'any');
  return { teamLatest, kLatest, anyLatest };
}

/** 경력 첫 줄의 첫 단어 */
function firstWordOfFirstLine(text) {
  if (!text) return '';
  const firstLine = String(text).split(/\r?\n/)[0] || '';
  const firstWord = (firstLine.trim().split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}\-_.]/gu, '');
/** 경력 텍스트에서 첫 줄의 첫 단어 */
export function firstWordOfCareer(career) {
  if (!career) return '';
  const firstLine = career.split(/\r?\n/)[0] || '';
  const firstWord = (firstLine.trim().split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}._-]/gu, '');
  return firstWord;
}

/** 표 행 데이터 생성 */
/**
 * 표 데이터를 구성
 * 요구 컬럼:
 * - 이름
 * - 현경력(첫줄 첫단어)
 * - 최근 팀황 미팅 (팀 키워드 포함 라인 중 가장 최신)
 * - 최근 케이 미팅 (케이 키워드 포함 라인 중 가장 최신)
 * - 우선순
 * - 전체 미팅 히스토리 (원본 텍스트)
 *
 * 정렬: 최근 미팅일 내림차순
 */
export function makeMeetingRows(profiles) {
  const rows = [];

  for (const p of profiles || []) {
    const record = p?.meetingRecord;
    if (!record || !String(record).trim()) continue; // 미팅기록 없는 프로필은 제외

    const team = findLatestByKeyword(record, /팀/);   // '팀 미팅', '팀황', '팀황 디너' 등 포함
    const kay  = findLatestByKeyword(record, /케이/); // '케이 미팅', '케이 콜' 등 포함

    // 둘 다 없으면 굳이 표시하지 않겠다면 여기서 continue 해도 되지만
    // 전체 히스토리 표시에 의미가 있어 유지
    const latestDate = [team?.date, kay?.date].filter(Boolean).sort((a,b)=>b-a)[0];

    rows.push({
      id: p.id,
      name: p.name || '',
      current: firstWordOfFirstLine(p.career),
      teamDisplay: team?.display || '',  // '최근 팀황 미팅'
      kayDisplay: kay?.display || '',    // '최근 케이 미팅'
      priority: p.priority || '',
      history: record || '',
      sortKey: latestDate ? latestDate.getTime() : 0,
  const rows = profiles
    .map(p => {
      const teamDate = findLatestByKeyword(p.meetingRecord || '', 'team');
      const  kDate   = findLatestByKeyword(p.meetingRecord || '', 'k');
      // 전체 최신 (팀/케이 중 더 최신) — 없으면 null
      const latest = teamDate && kDate ? (teamDate > kDate ? teamDate : kDate)
                    : teamDate || kDate || null;

      return {
        id: p.id,
        name: p.name || '',
        careerFirstWord: firstWordOfCareer(p.career || ''),
        teamLatestStr: formatYMD(teamDate),
        kLatestStr: formatYMD(kDate),
        priority: p.priority || '',
        history: p.meetingRecord || '',
        latestDate: latest, // 정렬용
      };
    })
    .filter(r => r.history && (r.teamLatestStr || r.kLatestStr || r.history.trim().length > 0))
    .sort((a, b) => {
      const ad = a.latestDate ? a.latestDate.getTime() : 0;
      const bd = b.latestDate ? b.latestDate.getTime() : 0;
      return bd - ad; // 최신이 위로
    });
  }

  // 최근 순 정렬 (최신이 위)
  rows.sort((a, b) => b.sortKey - a.sortKey);
  return rows;
}

/** 테이블 컴포넌트 */
/**
 * (선택) 표를 바로 렌더링하고 싶을 때 사용할 수 있는 컴포넌트
 * App.js에서 `<MeetingsPage profiles={profiles} />`로 사용 가능
 */
export function MeetingsPage({ profiles }) {
  const rows = useMemo(() => makeMeetingRows(profiles), [profiles]);
  const rows = makeMeetingRows(profiles || []);

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold text-gray-800 mb-4">미팅 데이터</h2>

    <div className="bg-white rounded-xl shadow-md p-4">
      <h2 className="text-xl font-bold mb-4">미팅 데이터</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">현경력</th>
              <th className="px-3 py-2">최근 팀황 미팅</th>
              <th className="px-3 py-2">최근 케이 미팅</th>
              <th className="px-3 py-2">우선순</th>
              <th className="px-3 py-2">전체 미팅 히스토리</th>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">이름</th>
              <th className="py-2 pr-4">현경력</th>
              <th className="py-2 pr-4">최근 팀황 미팅</th>
              <th className="py-2 pr-4">최근 케이 미팅</th>
              <th className="py-2 pr-4">우선순</th>
              <th className="py-2">전체 미팅 히스토리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">표시할 미팅 기록이 없습니다.</td>
              </tr>
              <tr><td colSpan={6} className="py-6 text-center text-gray-500">표시할 미팅 기록이 없습니다.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b align-top">
                <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                <td className="px-3 py-2">{r.current}</td>
                <td className="px-3 py-2">{r.teamDisplay}</td>
                <td className="px-3 py-2">{r.kayDisplay}</td>
                <td className="px-3 py-2">{r.priority}</td>
                <td className="px-3 py-2 whitespace-pre-wrap text-gray-600">{r.history}</td>
                <td className="py-2 pr-4 font-medium">{r.name}</td>
                <td className="py-2 pr-4">{r.careerFirstWord}</td>
                <td className="py-2 pr-4">{r.teamLatestStr || '-'}</td>
                <td className="py-2 pr-4">{r.kLatestStr || '-'}</td>
                <td className="py-2 pr-4">{r.priority || '-'}</td>
                <td className="py-2 whitespace-pre-wrap">{r.history}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    </div>
  );
}
