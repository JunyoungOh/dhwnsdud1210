// src/utils/meetings.js
import React, { useMemo } from 'react';

/**
 * 괄호 안의 날짜를 부분적으로도 인식:
 *   (25.12.03) -> 2025-12-03
 *   (2025.12.03) -> 2025-12-03
 *   (25.12) -> 2025-12 (day=1로 내부 정규화, 표시는 YYYY-MM)
 *   (2025.12) -> 2025-12
 *   (25) 단독은 모호해서 무시
 * 구분자: ".", "-", "/", "년", "월", "일" 혼용 일부도 허용
 */
export function parseParenthesizedDate(raw) {
  if (!raw) return null;
  const s = String(raw);

  // 괄호 안 텍스트들 모두 스캔
  const parenMatches = [...s.matchAll(/\(([^)]+)\)/g)];
  if (parenMatches.length === 0) return null;

  const results = [];

  for (const [, inside] of parenMatches) {
    const t = inside.replace(/\s+/g, '');

    // yyyy.mm.dd 또는 yy.mm.dd
    let m = t.match(/^((\d{4})|(\d{2}))[\.\-\/년](\d{1,2})(?:[\.\-\/월](\d{1,2}))?/);
    if (!m) continue;

    const year = m[2] ? parseInt(m[2], 10) : (2000 + parseInt(m[3], 10)); // yy -> 2000+yy
    const month = parseInt(m[4], 10);
    const day = m[5] ? parseInt(m[5], 10) : 1; // 일 없으면 1일로 보정
    if (!month || month < 1 || month > 12) continue;

    // 안전한 Date (로컬 기준)
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) continue;

    const yyyy = String(year).padStart(4, '0');
    const mm = String(month).padStart(2, '0');
    const dd = m[5] ? String(day).padStart(2, '0') : null;

    results.push({
      date: d,
      precision: dd ? 'day' : 'month',
      display: dd ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}`,
    });
  }

  if (results.length === 0) return null;

  // 가장 최신일자
  results.sort((a, b) => b.date - a.date);
  return results[0];
}

/**
 * meetingRecord(여러 줄)에서 keywordRe(/팀/ 등)가 들어간 "한 줄"들만 모아
 * 괄호 안 날짜를 찾아 가장 최신의 하나를 반환
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
}

/** 경력 첫 줄의 첫 단어 */
function firstWordOfFirstLine(text) {
  if (!text) return '';
  const firstLine = String(text).split(/\r?\n/)[0] || '';
  const firstWord = (firstLine.trim().split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}\-_.]/gu, '');
  return firstWord;
}

/** 표 행 데이터 생성 */
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
    });
  }

  // 최근 순 정렬 (최신이 위)
  rows.sort((a, b) => b.sortKey - a.sortKey);
  return rows;
}

/** 테이블 컴포넌트 */
export function MeetingsPage({ profiles }) {
  const rows = useMemo(() => makeMeetingRows(profiles), [profiles]);

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold text-gray-800 mb-4">미팅 데이터</h2>

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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">표시할 미팅 기록이 없습니다.</td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b align-top">
                <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                <td className="px-3 py-2">{r.current}</td>
                <td className="px-3 py-2">{r.teamDisplay}</td>
                <td className="px-3 py-2">{r.kayDisplay}</td>
                <td className="px-3 py-2">{r.priority}</td>
                <td className="px-3 py-2 whitespace-pre-wrap text-gray-600">{r.history}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
