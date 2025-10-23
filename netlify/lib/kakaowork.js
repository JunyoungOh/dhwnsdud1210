const DEFAULT_MAX_TEXT_LENGTH = 500;
const DEFAULT_REMINDER_TITLE = '오늘 미팅 리마인드 드려요!';
const DEFAULT_TIME_ZONE = 'Asia/Seoul';

const TRUTHY_STRINGS = new Set(['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled']);

function isTruthy(value = '') {
  const normalized = String(value).trim().toLowerCase();
  return TRUTHY_STRINGS.has(normalized);
}

function parseEnableFlag(value) {
  if (value === undefined) return true;
  const normalized = typeof value === 'string' ? value.trim() : String(value).trim();
  if (!normalized) return true;
  return isTruthy(normalized);
}

function truncateForKakao(text, maxLength = DEFAULT_MAX_TEXT_LENGTH) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
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

function buildProfileMessage(profile, { shareUrl, maxLength } = {}) {
  const sections = buildProfileSections(profile, { shareUrl });
  return truncateForKakao(sections.join('\n\n'), maxLength);
}

function toTimeZoneParts(date, timeZone = DEFAULT_TIME_ZONE) {
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

function dateTokensForRecord(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = toTimeZoneParts(date, timeZone);
  const yearFull = parts.year;
  const yearShort = yearFull.slice(-2);
  const month = parts.month;
  const day = parts.day;
  const monthNoPad = String(Number.parseInt(month, 10));
  const dayNoPad = String(Number.parseInt(day, 10));

  const candidates = new Set();
  const addToken = (token) => {
    if (!token) return;
    candidates.add(token);
    candidates.add(`(${token})`);
    candidates.add(`[${token}]`);
  };

  const yearVariants = [yearFull, yearShort];
  const monthVariants = [month, monthNoPad];
  const dayVariants = [day, dayNoPad];

  yearVariants.forEach((year) => {
    monthVariants.forEach((monthPart) => {
      dayVariants.forEach((dayPart) => {
        addToken(`${year}.${monthPart}.${dayPart}`);
        addToken(`${year}-${monthPart}-${dayPart}`);
        addToken(`${year}/${monthPart}/${dayPart}`);
        addToken(`${year}년${monthPart}월${dayPart}일`);
        addToken(`${year}년 ${monthPart}월 ${dayPart}일`);
      });
    });
  });

  monthVariants.forEach((monthPart) => {
    dayVariants.forEach((dayPart) => {
      addToken(`${monthPart}.${dayPart}`);
      addToken(`${monthPart}-${dayPart}`);
      addToken(`${monthPart}/${dayPart}`);
      addToken(`${monthPart}월${dayPart}일`);
      addToken(`${monthPart}월 ${dayPart}일`);
    });
  });

  return Array.from(candidates);
}

function compactString(text) {
  return (text || '').replace(/\s+/g, '');
}

function findMeetingLinesForDate(meetingRecord, date, timeZone = DEFAULT_TIME_ZONE) {
  if (!meetingRecord) return [];
  const tokens = dateTokensForRecord(date, timeZone).map((token) => ({
    raw: token,
    compact: compactString(token),
  }));
  if (!tokens.length) return [];

  const normalized = normaliseMultiline(meetingRecord);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.filter((line) => {
    const compactLine = compactString(line);
    return tokens.some((token) =>
      line.includes(token.raw) || compactLine.includes(token.compact)
    );
  });
}

function isSameDateInTimeZone(a, b, timeZone = DEFAULT_TIME_ZONE) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  const aParts = toTimeZoneParts(a, timeZone);
  const bParts = toTimeZoneParts(b, timeZone);
  return aParts.year === bParts.year && aParts.month === bParts.month && aParts.day === bParts.day;
}

function getLocalTimeParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const hour = Number.parseInt(parts.hour ?? '0', 10);
  const minute = Number.parseInt(parts.minute ?? '0', 10);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function buildFallbackMeetingLines(profile, targetDate, timeZone = DEFAULT_TIME_ZONE) {
  if (!profile?.eventDate) return [];
  const eventDate = new Date(profile.eventDate);
  if (Number.isNaN(eventDate.getTime())) return [];
  if (!isSameDateInTimeZone(eventDate, targetDate, timeZone)) return [];

  const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const { hour, minute } = getLocalTimeParts(eventDate, timeZone);
  let timeLabel = '';
  if (hour !== 0 || minute !== 0) {
    timeLabel = new Intl.DateTimeFormat('ko-KR', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(eventDate);
  }
  const dateLabel = dateFormatter.format(eventDate);
  const scheduleLabel = timeLabel ? `${dateLabel} ${timeLabel}` : dateLabel;
  return [`일정: ${scheduleLabel}`];
}

function buildMeetingReminderMessage(
  profile,
  meetingLines,
  { shareUrl, title = DEFAULT_REMINDER_TITLE, maxLength } = {}
) {
  if (!profile || !meetingLines?.length) return '';
  const bulletLines = meetingLines.map((line) => (line.startsWith('-') ? line : `- ${line}`));
  const profileSections = buildProfileSections(profile, {
    shareUrl,
    title: `프로필 요약 - ${profile.name || '이름 미기재'}`,
  });

  const reminderTitle = title || DEFAULT_REMINDER_TITLE;
  const segments = [reminderTitle, bulletLines.join('\n'), profileSections.join('\n\n')].filter(Boolean);

  return truncateForKakao(segments.join('\n\n'), maxLength);
}

function buildMeetingReminderMessages(
  profiles,
  { date = new Date(), shareUrlBuilder, title, maxLength, timeZone = DEFAULT_TIME_ZONE } = {}
) {
  if (!Array.isArray(profiles)) return [];
  return profiles.reduce((acc, profile) => {
    let lines = findMeetingLinesForDate(profile?.meetingRecord, date, timeZone);
    if (!lines.length) {
      lines = buildFallbackMeetingLines(profile, date, timeZone);
    }
    if (!lines.length) return acc;
    const shareUrl = typeof shareUrlBuilder === 'function' ? shareUrlBuilder(profile) : undefined;
    const text = buildMeetingReminderMessage(profile, lines, { shareUrl, title, maxLength });
    if (text) acc.push({ profile, text, lines, shareUrl });
    return acc;
  }, []);
}

function isKakaoWorkAvailable({ webhookUrl, enabled } = {}) {
  const url = (webhookUrl ?? process.env.KAKAOWORK_WEBHOOK_URL ?? '').trim();
  const enabledVar = enabled ?? process.env.KAKAOWORK_WEBHOOK_ENABLED;
  const webhookEnabled = enabledVar === undefined ? true : parseEnableFlag(enabledVar);
  return !!url && webhookEnabled;
}

async function postToKakaoWork(text, { webhookUrl, enabled } = {}) {
  const url = (webhookUrl ?? process.env.KAKAOWORK_WEBHOOK_URL ?? '').trim();
  const enabledVar = enabled ?? process.env.KAKAOWORK_WEBHOOK_ENABLED;
  const webhookEnabled = enabledVar === undefined ? true : parseEnableFlag(enabledVar);

  if (!url || !webhookEnabled) {
    throw new Error('KakaoWork webhook is not configured.');
  }

  if (!text) {
    throw new Error('Text is required.');
  }

  const fetchFn = typeof fetch === 'function' ? fetch : null;
  if (!fetchFn) {
    throw new Error('fetch API is not available in this environment.');
  }

  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const reason = detail ? `${response.statusText}: ${detail}` : response.statusText;
    throw new Error(`Failed to deliver KakaoWork webhook request (${response.status} ${reason})`);
  }

  return true;
}

module.exports = {
  DEFAULT_MAX_TEXT_LENGTH,
  DEFAULT_REMINDER_TITLE,
  DEFAULT_TIME_ZONE,
  buildMeetingReminderMessage,
  buildMeetingReminderMessages,
  buildProfileMessage,
  buildProfileSections,
  findMeetingLinesForDate,
  isKakaoWorkAvailable,
  normaliseMultiline,
  postToKakaoWork,
  truncateForKakao,
};
