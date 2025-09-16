// src/utils/meetings.js
import React, { useMemo } from 'react';

/** 첫 줄의 첫 단어 (현경력 칸에 사용) */
function firstWordOfFirstLine(text = '') {
  const firstLine = String(text || '').split('\n')[0] || '';
  const firstWord = firstLine.trim().split(/\s+/)[0] || '';
  return firstWord;
}

/** (YY.MM.DD) / (YY.MM) / (YYYY-MM-DD) 등 다양한 토큰 파싱 */
function parseDateToken(raw = '') {
  const token = String(raw).trim();
  // 2025-08-14
  let m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    return { year: y, month: mo, day: d, partial: false };
  }
  // 2025.08.14 or 25.08.14
  m = token.match(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) {
    let y = parseInt(m[1], 10);
    if (y < 100) y = 2000 + y; // 2자리 연도 → 20xx 가정
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    return { year: y, month: mo, day: d, partial: false };
  }
  // 2025.08 or 25.08 (월만 있는 경우)
  m = token.match(/^(\d{2,4})\.(\d{1,2})$/);
  if (m) {
    let y = parseInt(m[1], 10);
    if (y < 100) y = 2000 + y;
    const mo = parseInt(m[2], 10);
    return { year: y, month: mo, day: 1, partial: true };
  }
  return null;
}

/** Date 및 라벨 생성 (일 미기재 시 1일로 가정해서 정렬에 사용, 라벨은 "YYYY년 M월") */
function toDateAndLabel(parsed) {
  if (!parsed) return null;
  const { year, month, day, partial } = parsed;
  const date = new Date(year, month - 1, day || 1);
  const label = partial
    ? `${year}년 ${month}월`
    : `${year}년 ${month}월 ${day}일`;
  return { date, label, partial };
}

/** 한 줄에서 괄호 안의 모든 날짜 토큰을 추출하고 가장 최신(큰) 날짜 반환 */
function extractLatestDateFromLine(line = '') {
  const tokens = [];
  const regex = /\(([^)]+)\)/g;
  let m;
  while ((m = regex.exec(line)) !== null) {
    const p = parseDateToken(m[1]);
    if (p) {
      const info = toDateAndLabel(p);
      if (info) tokens.push(info);
    }
  }
  if (tokens.length === 0) return null;
  tokens.sort((a, b) => b.date - a.date);
  return tokens[0];
}

/**
 * 미팅 기록에서 팀/케이 관련 최신 날짜와 전체 최신 날짜를 뽑습니다.
 * - team: "팀" 이 포함된 라인들
 * - kay : "케이" 가 포함된 라인들
 */
export function extractMeetingDates(meetingRecord = '') {
  const lines = String(meetingRecord || '').split('\n').map(s => s.trim()).filter(Boolean);

  let latestTeam = null;
  let latestKay = null;
  let overallLatest = null;

  for (const line of lines) {
    const latestInLine = extractLatestDateFromLine(line);
    if (latestInLine) {
      if (!overallLatest || latestInLine.date > overallLatest.date) overallLatest = latestInLine;
    }
    // 팀 계열
    if (line.includes('팀')) {
      const t = extractLatestDateFromLine(line);
      if (t && (!latestTeam || t.date > latestTeam.date)) latestTeam = t;
    }
    // 케이 계열
    if (line.includes('케이')) {
      const k = extractLatestDateFromLine(line);
      if (k && (!latestKay || k.date > latestKay.date)) latestKay = k;
    }
  }

  return { latestTeam, latestKay, overallLatest };
}

/** 테이블용 행 생성 */
function buildRowsFromProfiles(profiles = []) {
  const rows = [];

  for (const p of profiles) {
    if (!p.meetingRecord) continue; // 미팅 기록이 있는 프로필만
    const { latestTeam, latestKay, overallLatest } = extractMeetingDates(p.meetingRecord);
    const newest = latestTeam?.date || latestKay?.date || overallLatest?.date || null;

    rows.push({
      id: p.id,
      name: p.name || '',
      current: firstWordOfFirstLine(p.career || ''),
      latestTeamLabel: latestTeam?.label || '',
      latestKayLabel: latestKay?.label || '',
      priority: p.priority || '',
      history: p.meetingRecord || '',
      sortDate: newest ? newest.getTime() : 0
    });
  }

  // 최근일 순으로 내림차순 정렬
  rows.sort((a, b) => b.sortDate - a.sortDate);
  return rows;
}

/** 미팅 데이터 페이지 */
export function MeetingsPage({ profiles = [], onNameClick }) {
  const rows = useMemo(() => buildRowsFromProfiles(profiles), [profiles]);

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">미팅 데이터</h2>

      <div className="overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700">
              <th className="px-3 py-2 text-left font-semibold">이름</th>
              <th className="px-3 py-2 text-left font-semibold">현경력</th>
              <th className="px-3 py-2 text-left font-semibold">최근 팀황 미팅</th>
              <th className="px-3 py-2 text-left font-semibold">최근 케이 미팅</th>
              <th className="px-3 py-2 text-left font-semibold">우선순</th>
              <th className="px-3 py-2 text-left font-semibold">전체 미팅 히스토리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  미팅 기록이 있는 프로필이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-yellow-50/50">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onNameClick && onNameClick(r.id)}
                      className="text-blue-600 hover:underline"
                    >
                      {r.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">{r.current}</td>
                  <td className="px-3 py-2">{r.latestTeamLabel}</td>
                  <td className="px-3 py-2">{r.latestKayLabel}</td>
                  <td className="px-3 py-2">{r.priority}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-gray-700">{r.history}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
