// src/utils/meetings.js

// 한국 시간대
export const K_TZ = 'Asia/Seoul';

// "YYYY.MM.DD HH:MM" 또는 "YYYY.MM.DD"로 보기 좋게 포맷
export function formatHuman(date, hadTime = true, tz = K_TZ) {
  if (!date) return '';
  const dtfDate = new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const parts = Object.fromEntries(dtfDate.map(p => [p.type, p.value]));
  if (!hadTime) return `${parts.year}.${parts.month}.${parts.day}`;

  const dtfTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const tparts = Object.fromEntries(dtfTime.map(p => [p.type, p.value]));
  return `${parts.year}.${parts.month}.${parts.day} ${tparts.hour}:${tparts.minute}`;
}

// (간이) 미팅 날짜 파서
// - "(25.08.14) 오후 7:00" 같은 패턴
// - "2024-08-14 19:00" 같은 패턴
export function parseDateTimeFromRecordLite(recordText) {
  if (!recordText) return null;
  const text = String(recordText);

  let best = null;
  let m;

  // 1) (YY.MM.DD) [오전|오후|AM|PM] H(:mm)?
  const reA = /\((\d{2})\.(\d{2})\.(\d{2})\)\s*(?:(오전|오후|AM|PM)?\s*(\d{1,2})(?::(\d{2}))?)?/gi;
  while ((m = reA.exec(text)) !== null) {
    const year = 2000 + parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    let hadTime = false;
    let hour = 0, minute = 0;

    if (m[4] || m[5]) {
      hadTime = true;
      hour = m[5] ? parseInt(m[5], 10) : 0;
      minute = m[6] ? parseInt(m[6], 10) : 0;
      const ampm = (m[4] || '').toUpperCase();
      if (ampm === 'PM' || ampm === '오후') { if (hour !== 12) hour += 12; }
      if (ampm === 'AM' || ampm === '오전') { if (hour === 12) hour = 0; }
    }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }

  // 2) YYYY-MM-DD( HH:MM)?
  const reB = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/g;
  while ((m = reB.exec(text)) !== null) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    let hadTime = false;
    let hour = 0, minute = 0;
    if (m[4]) { hadTime = true; hour = parseInt(m[4], 10); minute = parseInt(m[5] || '0', 10); }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }

  return best;
}

// 미팅기록에서 전체 최신/팀황 최신/케이 최신 추출
export function extractMeetingDates(recordText) {
  const text = (recordText || '').toString();
  const lines = text.split(/\r?\n/);

  let lastAny = null;
  let lastTeamHwang = null;
  let lastKay = null;

  for (const line of lines) {
    const parsed = parseDateTimeFromRecordLite(line);
    if (parsed && parsed.date) {
      if (!lastAny || parsed.date > lastAny.date) lastAny = parsed;

      const low = line.toLowerCase();
      const isTeamHwang = low.includes('팀황') && low.includes('미팅');
      const isKay = low.includes('케이') && low.includes('미팅');

      if (isTeamHwang) {
        if (!lastTeamHwang || parsed.date > lastTeamHwang.date) lastTeamHwang = parsed;
      }
      if (isKay) {
        if (!lastKay || parsed.date > lastKay.date) lastKay = parsed;
      }
    }
  }
  return { lastAny, lastTeamHwang, lastKay };
}

// 경력의 첫 줄 첫 단어
export function firstCareerWord(careerText) {
  const firstLine = (careerText || '').split(/\r?\n/)[0] || '';
  const firstWord = firstLine.trim().split(/\s+/)[0] || '';
  return firstWord;
}
