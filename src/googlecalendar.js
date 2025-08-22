// src/googleCalendar.js
// 구글 캘린더 OAuth + 이벤트 생성/업데이트 유틸

// ⬇️ Google Cloud 콘솔에서 발급한 OAuth 클라이언트 ID로 교체하세요
const GOOGLE_OAUTH_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";

const SCOPES = "https://www.googleapis.com/auth/calendar";
let gapiInited = false;
let gisInited = false;
let tokenClient = null;

/** gapi/GIS 로드 대기 */
export const ensureGoogleApisLoaded = () =>
  new Promise((resolve, reject) => {
    const maxWaitMs = 15000;
    const start = Date.now();
    (function check() {
      if (window.gapi && window.google) return resolve();
      if (Date.now() - start > maxWaitMs) return reject(new Error("gapi/GIS 로드 지연"));
      setTimeout(check, 50);
    })();
  });

/** gapi 초기화 */
export const initGapi = () =>
  new Promise((resolve, reject) => {
    if (gapiInited) return resolve();
    try {
      window.gapi.load("client", async () => {
        try {
          await window.gapi.client.init({
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
          });
          gapiInited = true;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });

/** GIS 초기화 */
export const initGis = () => {
  if (gisInited) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},
  });
  gisInited = true;
};

/** 캘린더 권한 요청(팝업) */
export const requestCalendarAccess = () =>
  new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("GIS 미초기화"));
    tokenClient.callback = (resp) => {
      if (resp.error) reject(resp);
      else resolve(resp);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });

/** 종일 이벤트 생성 */
export const createAllDayEvent = async ({ summary, description, dateISO, linkUrl }) => {
  const d = new Date(dateISO); // ISO → 날짜만
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const dateOnly = `${yyyy}-${mm}-${dd}`;

  const event = {
    summary,
    description,
    start: { date: dateOnly },
    end: { date: dateOnly },
    reminders: { useDefault: true },
    source: linkUrl ? { title: "프로필 대시보드", url: linkUrl } : undefined,
  };

  const res = await window.gapi.client.calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });
  return res.result; // { id, htmlLink, ... }
};

/** 종일 이벤트 업데이트 */
export const updateAllDayEvent = async (eventId, { summary, description, dateISO, linkUrl }) => {
  const d = new Date(dateISO);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const dateOnly = `${yyyy}-${mm}-${dd}`;

  const event = {
    summary,
    description,
    start: { date: dateOnly },
    end: { date: dateOnly },
    reminders: { useDefault: true },
    source: linkUrl ? { title: "프로필 대시보드", url: linkUrl } : undefined,
  };

  const res = await window.gapi.client.calendar.events.update({
    calendarId: "primary",
    eventId,
    resource: event,
  });
  return res.result;
};
