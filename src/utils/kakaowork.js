const PROXY_ENDPOINT = (process.env.REACT_APP_KAKAOWORK_PROXY_ENDPOINT || '/.netlify/functions/send-kakaowork').trim();
const MAX_TEXT_LENGTH = 500;
const REMINDER_TITLE = '오늘 미팅 리마인드 드려요!';
const REMINDER_TIME_ZONE = 'Asia/Seoul';

const isTruthy = (value = '') => {
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized);
};

const KAKAOWORK_AVAILABLE = isTruthy(process.env.REACT_APP_KAKAOWORK_ENABLED);

function truncateForKakao(text) {
  if (!text) return '';
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`;
}

function normaliseMultiline(text) {
  return (text || '').replace(/\r\n/g, '\n');
}

function buildProfileSections(profile, { shareUrl, title } = {}) {
  if (!profile) return [];
  const sections = [];
  const header = title || `[프로필 공유] ${profile.name || '이름 미기재'}`;
  if (header) sections.push(header);
  if (profile.priority) sections.push(`우선순위: ${profile.priority}`);
  if (profile.expertise) sections.push(`전문영역: ${profile.expertise}`);

  if (profile.career) {
    const normalized = normaliseMultiline(profile.career);
    const preview = normalized.split('\n').slice(0, 3).join('\n');
    sections.push(`경력:\n${preview}`);
  }

  if (profile.meetingRecord) {
    const normalized = normaliseMultiline(profile.meetingRecord);
    const preview = normalized.split('\n').slice(0, 3).join('\n');
    sections.push(`미팅기록:\n${preview}`);
  }

  if (shareUrl) sections.push(`공유 링크: ${shareUrl}`);
  return sections.filter(Boolean);
}

function buildProfileMessage(profile, { shareUrl } = {}) {
  const sections = buildProfileSections(profile, { shareUrl });
  return truncateForKakao(sections.join('\n\n'));
}

function toTimeZoneParts(date, timeZone = REMINDER_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
}

function dateTokensForRecord(date, timeZone = REMINDER_TIME_ZONE) {
  const parts = toTimeZoneParts(date, timeZone);
  const yearFull = parts.year;
  const yearShort = yearFull.slice(-2);
  const month = parts.month;
  const day = parts.day;
  const formats = [
    `${yearFull}.${month}.${day}`,
    `${yearShort}.${month}.${day}`,
    `${yearFull}-${month}-${day}`,
    `${yearShort}-${month}-${day}`,
  ];
  return formats.flatMap((fmt) => [fmt, `(${fmt})`]);
}

function findMeetingLinesForDate(meetingRecord, date, timeZone = REMINDER_TIME_ZONE) {
  if (!meetingRecord) return [];
  const tokens = dateTokensForRecord(date, timeZone);
  const normalized = normaliseMultiline(meetingRecord);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.filter((line) => tokens.some((token) => line.includes(token)));
}

function buildMeetingReminderMessage(profile, meetingLines, { shareUrl } = {}) {
  if (!profile || !meetingLines?.length) return '';
  const bulletLines = meetingLines.map((line) => (line.startsWith('-') ? line : `- ${line}`));
  const profileSections = buildProfileSections(profile, {
    shareUrl,
    title: `프로필 요약 - ${profile.name || '이름 미기재'}`,
  });

  const segments = [
    REMINDER_TITLE,
    bulletLines.join('\n'),
    profileSections.join('\n\n'),
  ].filter(Boolean);

  return truncateForKakao(segments.join('\n\n'));
}

async function postToKakaoWork(text) {
  if (!KAKAOWORK_AVAILABLE) {
    throw new Error('카카오워크 Webhook 사용이 비활성화되어 있습니다.');
  }

  if (!PROXY_ENDPOINT) {
    throw new Error('카카오워크 Webhook 프록시 엔드포인트가 설정되지 않았습니다.');
  }

  if (typeof fetch !== 'function') {
    throw new Error('fetch API를 사용할 수 없습니다.');
  }

  if (!text) {
    throw new Error('전송할 메시지가 없습니다.');
  }

  const response = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const reason = detail ? `${response.statusText}: ${detail}` : response.statusText;
    throw new Error(`카카오워크 Webhook 전송 실패 (${response.status} ${reason})`);
  }

  return true;
}

export function hasKakaoWorkWebhook() {
  return KAKAOWORK_AVAILABLE;
}

export async function sendProfileToKakaoWork(profile, { shareUrl } = {}) {
  const text = buildProfileMessage(profile, { shareUrl });
  return postToKakaoWork(text);
}

export async function sendMeetingReminderToKakaoWork(profile, meetingLines, { shareUrl } = {}) {
  const text = buildMeetingReminderMessage(profile, meetingLines, { shareUrl });
  return postToKakaoWork(text);
}

export function buildMeetingReminderMessages(profiles, { date = new Date(), shareUrlBuilder } = {}) {
  if (!Array.isArray(profiles)) return [];
  return profiles.reduce((acc, profile) => {
    const lines = findMeetingLinesForDate(profile?.meetingRecord, date);
    if (!lines.length) return acc;
    const shareUrl = typeof shareUrlBuilder === 'function' ? shareUrlBuilder(profile) : undefined;
    const text = buildMeetingReminderMessage(profile, lines, { shareUrl });
    if (text) acc.push({ profile, text, lines });
    return acc;
  }, []);
}

export {
  buildProfileMessage,
  buildMeetingReminderMessage,
  findMeetingLinesForDate,
};
