// src/googleCalendar.js
// 요구사항: (YY.MM.DD) 미팅 당일 "한국시간 오전 10:00"에 시작하는 이벤트 생성
// - 푸시는 사용하지 않음
// - 알림은 이벤트 시각(=10:00)에 팝업으로 울리도록 설정(0분 전)

let tokenClient = null;
let accessToken = null;
let inited = false;

const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

function userFacingError(msg) {
  const err = new Error(msg);
  err.userMessage = msg;
  return err;
}

function waitFor(checker, name, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (checker()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`${name} 로딩 타임아웃`));
      }
      requestAnimationFrame(poll);
    })();
  });
}

export async function initGoogle(clientId) {
  if (inited) return;

  if (!clientId || clientId.includes('YOUR_')) {
    throw userFacingError('Google OAuth Client ID가 없습니다. window.GOOGLE_OAUTH_CLIENT_ID 값을 확인하세요.');
  }

  await waitFor(() => window?.google?.accounts?.oauth2, 'GSI');
  await waitFor(() => window?.gapi, 'gapi');

  // gapi client 초기화
  await new Promise((resolve, reject) => {
    window.gapi.load('client', {
      callback: resolve,
      onerror: () => reject(new Error('gapi client 로드 실패')),
      timeout: 10000,
      ontimeout: () => reject(new Error('gapi client 로드 타임아웃')),
    });
  });

  try {
    await window.gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
  } catch (e) {
    console.error('gapi.client.init 실패:', e);
    throw userFacingError('Google Calendar API 초기화 실패. 콘솔에서 API 활성화 여부를 확인하세요.');
  }

  // 토큰 클라이언트 생성
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    prompt: '',
    callback: (resp) => {
      if (resp.error) {
        console.error('토큰 콜백 에러:', resp);
        return;
      }
      accessToken = resp.access_token;
    },
  });

  inited = true;
  console.log('[googleCalendar] 초기화 완료');
}

export async function ensureAuth() {
  if (!inited) throw userFacingError('Google OAuth 초기화가 필요합니다.');

  if (accessToken) return accessToken;

  await new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        let msg = 'Google 인증에 실패했습니다.';
        if (String(resp.error).includes('access_denied')) {
          msg = '권한이 거부되었습니다. 캘린더 접근을 허용해 주세요.';
        }
        return reject(userFacingError(msg));
      }
      accessToken = resp.access_token;
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  return accessToken;
}

/**
 * (YY.MM.DD) 문자열을 받아 "한국시간 10:00" 시작/종료(1시간)를 ISO로 변환
 * - KST는 UTC+9, 서머타임 없음 → 10:00 KST = 01:00 UTC
 */
function buildKSTEventISOFromYYMMDDToken(token) {
  // token 예: "25.08.22"
  const m = token.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  const year = 2000 + yy;

  // 10:00 KST = 01:00 UTC
  const startUtc = new Date(Date.UTC(year, mm - 1, dd, 1, 0, 0));
  const endUtc   = new Date(Date.UTC(year, mm - 1, dd, 2, 0, 0));

  return {
    startISO: startUtc.toISOString(),
    endISO: endUtc.toISOString(),
  };
}

/**
 * 미팅기록 텍스트에서 가장 최근의 (YY.MM.DD) 토큰을 찾아 ISO 반환
 */
export function extractLatestKSTEventISOFromRecord(meetingRecord) {
  if (!meetingRecord) return null;
  const re = /\((\d{2}\.\d{2}\.\d{2})\)/g;
  let latest = null;
  let match;
  while ((match = re.exec(meetingRecord)) !== null) {
    const { startISO } = buildKSTEventISOFromYYMMDDToken(match[1]) || {};
    if (startISO) {
      const d = new Date(startISO);
      if (!latest || d > latest) latest = d;
    }
  }
  if (!latest) return null;

  // latest는 UTC Date. 동일 로직으로 1시간 범위를 다시 만들기 위해 토큰을 재파싱하는 대신
  // 그대로 end=+1h
  const startISO = latest.toISOString();
  const endISO = new Date(latest.getTime() + 60 * 60 * 1000).toISOString();
  return { startISO, endISO };
}

/**
 * 구글 캘린더 이벤트 생성
 * - 알림: 이벤트 시각(0분 전) 팝업
 */
export async function createCalendarEvent({ summary, description, startISO, endISO }) {
  await ensureAuth();

  const event = {
    summary,
    description,
    start: { dateTime: startISO, timeZone: 'Asia/Seoul' },
    end:   { dateTime: endISO,   timeZone: 'Asia/Seoul' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 0 }, // 이벤트 시각 = 10:00에 알림
      ],
    },
  };

  try {
    const resp = await window.gapi.client.request({
      path: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: event,
    });

    return resp?.result;
  } catch (e) {
    console.error('캘린더 이벤트 생성 실패:', e);
    const raw = e?.result?.error || e?.body || e?.message || e;
    const txt = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (/insufficient|forbidden|unauthorized/i.test(txt)) {
      throw userFacingError('권한이 부족합니다. 동의 화면에서 캘린더 접근을 허용해 주세요.');
    }
    if (/origin_mismatch|redirect_uri_mismatch/i.test(txt)) {
      throw userFacingError('OAuth 클라이언트의 “승인된 자바스크립트 원본”에 Netlify 도메인을 정확히 등록했는지 확인하세요.');
    }
    if (/notFound|unknownApi/i.test(txt)) {
      throw userFacingError('Google Calendar API가 프로젝트에서 활성화되어 있는지 확인하세요.');
    }
    throw userFacingError('캘린더 등록 중 알 수 없는 오류. 콘솔 로그를 개발자에게 전달해 주세요.');
  }
}
