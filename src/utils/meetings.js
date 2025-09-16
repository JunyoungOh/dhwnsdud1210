// src/utils/meetings.js
import React, { useMemo } from 'react';

// (yy.mm.dd), (yy.mm), (yy) 를 파싱해서 비교용 숫자 키와 표시 문자열을 반환
function parseKoreanPartialDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[()\s]/g, '');
  const mFull = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);   // 25.08.14
  const mYM   = s.match(/^(\d{2})\.(\d{1,2})$/);              // 25.12
  const mY    = s.match(/^(\d{2})$/);                         // 25

  let y, mo = 1, d = 1, label = '';
  if (mFull) {
    y = 2000 + Number(mFull[1]); mo = Number(mFull[2]); d = Number(mFull[3]);
    label = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  } else if (mYM) {
    y = 2000 + Number(mYM[1]); mo = Number(mYM[2]);
    label = `${y}-${String(mo).padStart(2,'0')}`;
  } else if (mY) {
    y = 2000 + Number(mY[1]);
    label = `${y}`;
  } else {
    return null;
  }
  // 비교용 키(YYYYMMDD) — 없는 부분은 01로 보정
  const key = y * 10000 + (mo || 1) * 100 + (d || 1);
  return { key, label, year: y, month: mo, day: d };
}

// 한 줄에서 괄호 안 날짜 텍스트 추출
function pickParenDate(line) {
  const m = line.match(/\(([^\)]+)\)/);
  return m ? m[1] : null;
}

// “팀”계열 / “케이”계열 최근 일자와 전체 텍스트를 뽑기
export function extractMeetingDates(text) {
  if (!text) return { latestTeam: null, latestK: null, allText: '' };
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let bestTeam = null;
  let bestK = null;

  for (const line of lines) {
    const dateRaw = pickParenDate(line);
    const parsed = parseKoreanPartialDate(dateRaw);
    if (!parsed) continue;

    const hasTeam = /팀/.test(line);  // '팀', '팀황' 등 포함
    const hasK    = /케이/.test(line); // '케이' 포함

    if (hasTeam) {
      if (!bestTeam || parsed.key > bestTeam.key) bestTeam = parsed;
    }
    if (hasK) {
      if (!bestK || parsed.key > bestK.key) bestK = parsed;
    }
  }

  return {
    latestTeam: bestTeam ? bestTeam.label : '',
    latestK:    bestK ? bestK.label : '',
    allText: text,
  };
}

// 경력 첫 줄의 첫 단어 추출
function firstWordOfFirstCareerLine(career) {
  if (!career) return '';
  const firstLine = String(career).split(/\r?\n/)[0] || '';
  const word = firstLine.trim().split(/\s+/)[0] || '';
  return word;
}

// 목록 표 컴포넌트
export function MeetingsPage({ profiles, onOpenDetail }) {
  // 미팅 기록이 있는 프로필만 대상으로 가공
  const rows = useMemo(() => {
    const list = [];
    for (const p of profiles) {
      if (!p.meetingRecord || !String(p.meetingRecord).trim()) continue;
      const ex = extractMeetingDates(p.meetingRecord);
      // 정렬을 위해 team/k 중 더 최근 키를 구함
      const tKey = ex.latestTeam ? parseKoreanPartialDate(ex.latestTeam.replace(/-/g,'.'))?.key : null;
      const kKey = ex.latestK    ? parseKoreanPartialDate(ex.latestK.replace(/-/g,'.'))?.key : null;
      const sortKey = Math.max(tKey || 0, kKey || 0);

      list.push({
        id: p.id,
        name: p.name || '',
        careerHead: firstWordOfFirstCareerLine(p.career),
        latestTeam: ex.latestTeam || '',
        latestK: ex.latestK || '',
        priority: p.priority || '',
        allText: ex.allText || '',
        sortKey,
      });
    }
    // 최근일수록 위로
    return list.sort((a,b) => (b.sortKey||0) - (a.sortKey||0));
  }, [profiles]);

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">미팅 데이터</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-600">
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
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">표시할 미팅 데이터가 없습니다.</td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenDetail?.(r.id); }}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {r.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-700">{r.careerHead}</td>
                <td className="px-3 py-2">{r.latestTeam || '-'}</td>
                <td className="px-3 py-2">{r.latestK || '-'}</td>
                <td className="px-3 py-2">{r.priority || '-'}</td>
                <td className="px-3 py-2 whitespace-pre-wrap text-gray-600">{r.allText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
