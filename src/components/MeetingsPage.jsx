// src/components/MeetingsPage.jsx
import React, { useMemo } from 'react';
import { extractMeetingDates, firstCareerWord, formatHuman } from '../utils/meetings';

export default function MeetingsPage({ profiles }) {
  // 최신 미팅일 기준 내림차순 정렬된 테이블 데이터
  const rows = useMemo(() => {
    return profiles
      .filter(p => (p.meetingRecord || '').trim().length > 0 || p.eventDate)
      .map(p => {
        const { lastAny, lastTeamHwang, lastKay } = extractMeetingDates(p.meetingRecord || '');
        const careerTopWord = firstCareerWord(p.career);
        const sortDate = lastAny?.date ? new Date(lastAny.date)
                        : (p.eventDate ? new Date(p.eventDate) : null);

        return {
          id: p.id,
          name: p.name || '',
          careerTopWord,
          lastTeamHwangStr: lastTeamHwang ? formatHuman(lastTeamHwang.date, lastTeamHwang.hadTime) : '',
          lastKayStr: lastKay ? formatHuman(lastKay.date, lastKay.hadTime) : '',
          priority: p.priority || '',
          history: p.meetingRecord || '',
          sortKey: sortDate ? sortDate.getTime() : 0,
        };
      })
      .sort((a, b) => b.sortKey - a.sortKey);
  }, [profiles]);

  return (
    <section className="bg-white p-4 sm:p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">미팅 데이터</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-4 py-2 border-b">이름</th>
              <th className="px-4 py-2 border-b">현경력</th>
              <th className="px-4 py-2 border-b">마지막 팀황 미팅</th>
              <th className="px-4 py-2 border-b">마지막 케이 미팅</th>
              <th className="px-4 py-2 border-b">우선순</th>
              <th className="px-4 py-2 border-b">전체 미팅 히스토리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  미팅 기록이 있는 프로필이 없습니다.
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="align-top hover:bg-gray-50">
                <td className="px-4 py-2 border-b font-medium text-gray-800">{r.name}</td>
                <td className="px-4 py-2 border-b text-gray-700">{r.careerTopWord}</td>
                <td className="px-4 py-2 border-b">{r.lastTeamHwangStr || '-'}</td>
                <td className="px-4 py-2 border-b">{r.lastKayStr || '-'}</td>
                <td className="px-4 py-2 border-b">{r.priority || '-'}</td>
                <td className="px-4 py-2 border-b whitespace-pre-wrap text-gray-700">{r.history}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
