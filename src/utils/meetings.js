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
 * 괄호 안 날짜 파싱
 * 허용 예: (25.08.14), (25.12), (2024.7.3), (2024.12)
 * - YY면 2000 + YY 로 가정
 * - 일이 없으면 1일로 보정
 */
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

/** 한 줄 문자열이 '팀' 키워드 포함 여부 */
function hasTeamKeyword(line) {
  if (!line) return false;
  // '팀', '팀황', '팀 미팅', '팀 디너' 등 모두 포함
  return /팀/.test(line);
}

/** 한 줄 문자열이 '케이' 키워드 포함 여부 */
function hasKKeyword(line) {
  if (!line) return false;
  // '케이', '케이 미팅', '케이 콜' 등 모두 포함
  return /케이/.test(line);
}

/**
 * 미팅 기록 텍스트에서 특정 키워드를 포함하는 라인의 가장 최신(우측 괄호 기준) 날짜를 찾음
 * @param {string} recordText 전체 미팅 기록 (멀티라인)
 * @param {'team'|'k'|'any'} mode
 * @returns {Date|null}
 */
export function findLatestByKeyword(recordText, mode = 'any') {
  if (!recordText) return null;
  const lines = recordText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  let latest = null;
  for (const line of lines) {
    const include =
      mode === 'team' ? hasTeamKeyword(line) :
      mode === 'k'    ? hasKKeyword(line)    :
      true;

    if (!include) continue;

    const d = parseParenthesizedDate(line);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/**
 * (빌드 오류 해결용) 외부에서 import 하는 함수 이름을 맞춰서 export
 * - recordText 안에서 팀/케이 관련 최신 날짜를 뽑아 반환
 * - 사용처가 달라도 안전하게 쓰도록 넓은 형태로 제공
 * @param {string} recordText
 * @returns {{ teamLatest: Date|null, kLatest: Date|null, anyLatest: Date|null }}
 */
export function extractMeetingDates(recordText) {
  const teamLatest = findLatestByKeyword(recordText, 'team');
  const kLatest    = findLatestByKeyword(recordText, 'k');
  const anyLatest  = findLatestByKeyword(recordText, 'any');
  return { teamLatest, kLatest, anyLatest };
}

/** 경력 텍스트에서 첫 줄의 첫 단어 */
export function firstWordOfCareer(career) {
  if (!career) return '';
  const firstLine = career.split(/\r?\n/)[0] || '';
  const firstWord = (firstLine.trim().split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}._-]/gu, '');
  return firstWord;
}

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

  return rows;
}

/**
 * (선택) 표를 바로 렌더링하고 싶을 때 사용할 수 있는 컴포넌트
 * App.js에서 `<MeetingsPage profiles={profiles} />`로 사용 가능
 */
export function MeetingsPage({ profiles }) {
  const rows = makeMeetingRows(profiles || []);

  return (
    <div className="bg-white rounded-xl shadow-md p-4">
      <h2 className="text-xl font-bold mb-4">미팅 데이터</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
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
              <tr><td colSpan={6} className="py-6 text-center text-gray-500">표시할 미팅 기록이 없습니다.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b align-top">
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
    </div>
  );
}
