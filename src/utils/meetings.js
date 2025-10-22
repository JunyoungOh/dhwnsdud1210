// src/utils/meetings.js
import React, { useMemo } from 'react';

/** (yy.mm.dd) | (yy.mm) | (yy) 형식의 괄호 날짜 파서 */
function parseParenDate(str) {
  if (!str) return null;
  const m = str.match(/\((\d{2,4})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\)/);
  if (!m) return null;

  const yy = parseInt(m[1], 10);
  const year = m[1].length === 2 ? 2000 + yy : yy; // 2자리면 20xx로 해석
  const mm = m[2] ? parseInt(m[2], 10) : null;
  const dd = m[3] ? parseInt(m[3], 10) : null;

  const key = (year * 10000) + ((mm || 0) * 100) + (dd || 0); // 정렬용 키
  let label = String(year);
  if (mm) label += '-' + String(mm).padStart(2, '0');
  if (dd) label += '-' + String(dd).padStart(2, '0');
  return { key, label };
}

/** 한 줄에서 괄호 날짜 추출 (없으면 null) */
export function pickParenDate(line) {
  return parseParenDate(line);
}

function splitOwners(rawOwner) {
  if (!rawOwner) return ['담당자 미상'];
  let ownerText = rawOwner
    .replace(/[\[\]{}]/g, ' ')
    .replace(/미팅\s*$/iu, '')
    .replace(/meeting\s*$/iu, '')
    .replace(/[-:·•]+$/g, '')
    .replace(/^[·•\-:]+/g, '')
    .trim();

  if (!ownerText) return ['담당자 미상'];

  const candidates = ownerText
    .split(/[,/&]|\s+&\s+|\s*\/\s*/g)
    .map((token) => token.trim())
    .filter(Boolean);

  if (candidates.length) {
    return candidates.map((token) => token.replace(/미팅$/u, '').trim() || '담당자 미상');
  }

  return [ownerText];
}

function extractLatestMeetingsByOwner(meetingRecordText) {
  if (!meetingRecordText) return [];

  const lines = meetingRecordText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const latestMap = new Map();

  for (const line of lines) {
    const d = pickParenDate(line);
    if (!d || !d.key) continue;

    let ownerSource = '';
    const parenIndex = line.indexOf('(');
    if (parenIndex > 0) {
      ownerSource = line.slice(0, parenIndex);
    }
    if (!ownerSource.trim()) {
      ownerSource = line.replace(/\((\d{2,4})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\)/, '').trim();
    }

    const owners = splitOwners(ownerSource);
    owners.forEach((owner) => {
      const existing = latestMap.get(owner);
      if (!existing || d.key > existing.key) {
        latestMap.set(owner, { owner, key: d.key, label: d.label });
      }
    });
  }

  return Array.from(latestMap.values())
    .filter((entry) => entry && entry.key)
    .sort((a, b) => b.key - a.key);
}

/** 표에 필요한 행 데이터 생성 */
export function buildMeetingRows(profiles) {
  const rows = [];
  for (const p of profiles) {
    if (!p.meetingRecord) continue;

    const latestByOwner = extractLatestMeetingsByOwner(p.meetingRecord);
    const latest = latestByOwner[0] || { owner: '', key: 0, label: '' };
    const sortKey = latest.key || 0;

    // ‘현경력’: 경력 첫 줄의 첫 단어
    let currentWord = '';
    if (p.career) {
      const firstLine = p.career.split(/\r?\n/).find(Boolean) || '';
      currentWord = (firstLine.split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}\-_.]/gu, '');
    }

    rows.push({
      id: p.id,
      name: p.name || '',
      current: currentWord,
      priority: p.priority || '',
      latest,
      latestByOwner,
      history: p.meetingRecord || '',
      sortKey,
    });
  }
  // 최근일수록 위쪽
  rows.sort((a, b) => b.sortKey - a.sortKey);
  return rows;
}

/** 미팅 데이터 표 (이름 클릭 시 onOpenDetail(id) 호출 → 상위에서 모달 오픈) */
export function MeetingsPage({ profiles, onOpenDetail }) {
  const rows = useMemo(() => buildMeetingRows(profiles || []), [profiles]);

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">미팅 데이터</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-3 py-2 text-left">이름</th>
              <th className="border px-3 py-2 text-left">현경력</th>
              <th className="border px-3 py-2 text-left">최근 미팅 담당자</th>
              <th className="border px-3 py-2 text-left">최근 미팅 일자</th>
              <th className="border px-3 py-2 text-left">우선순</th>
              <th className="border px-3 py-2 text-left">담당자별 최신 미팅</th>
              <th className="border px-3 py-2 text-left">전체 미팅 히스토리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="border px-3 py-6 text-center text-gray-500">
                  미팅 기록이 있는 프로필이 없습니다.
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="align-top">
                <td className="border px-3 py-2">
                  {typeof onOpenDetail === 'function' ? (
                    <button
                      onClick={() => onOpenDetail(r.id)}
                      className="text-blue-600 hover:underline"
                    >
                      {r.name}
                    </button>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="border px-3 py-2">{r.current}</td>
                <td className="border px-3 py-2">{r.latest?.owner || '-'}</td>
                <td className="border px-3 py-2">{r.latest?.label || '-'}</td>
                <td className="border px-3 py-2">{r.priority || '-'}</td>
                <td className="border px-3 py-2 whitespace-pre-wrap">
                  {r.latestByOwner?.length
                    ? r.latestByOwner.map((entry) => `${entry.owner}: ${entry.label}`).join('\n')
                    : '-'}
                </td>
                <td className="border px-3 py-2 whitespace-pre-wrap">{r.history || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default MeetingsPage;
