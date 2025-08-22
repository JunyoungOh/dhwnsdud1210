// functions/index.js
// 지역: asia-northeast3 (두 함수 동일 지역)
// 조회 기준: meetingDateToken === "(YY.MM.DD)" (예: 2025-08-22 -> "(25.08.22)")

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

setGlobalOptions({ region: "asia-northeast3", memory: "256MiB", maxInstances: 1 });
initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// 배포한 웹앱 URL
const APP_BASE_URL = "https://harmonious-dango-511e5b.netlify.app";

// KST 기준 오늘/특정 날짜를 "(YY.MM.DD)" 문자열로
function kstNow() {
  const now = new Date();
  const KST = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(KST);
}
function toTokenFromDate(d) {
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `(${yy}.${mm}.${dd})`;
}
function addDaysKST(d, days) {
  const nd = new Date(d.getTime());
  nd.setDate(nd.getDate() + days);
  return nd;
}

// Firestore 구조
// artifacts/{appId}/public/data/{accessCode}/{profileId}
// fcmTokens/{accessCode} {tokens: ["..."]}

const APP_ID = "profile-db-app-junyoungoh";
const DATA_ROOT = `artifacts/${APP_ID}/public/data`;

async function getAccessCodeDocs() {
  // data/{accessCode} “문서 목록” (colGroup 아님, 하위 경로로 listDocuments)
  return await db.collection(DATA_ROOT).listDocuments();
}

async function pickProfilesByToken(groupPath, token) {
  // 해당 accessCode 그룹에서 meetingDateToken = token 인 문서들
  const snap = await db.collection(groupPath).where("meetingDateToken", "==", token).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function buildWebPushPayload({ accessCode, profile, type }) {
  const profileId = profile.id;
  const deepLink = `${APP_BASE_URL}/?profileId=${encodeURIComponent(profileId)}&accessCode=${encodeURIComponent(accessCode)}`;
  const title = type;
  const body = `${profile.name} 님 일정 확인`;

  // tag/renotify 설정으로 중복 진동/소리 방지
  return {
    notification: { title, body },
    data: {
      profileId: String(profileId),
      accessCode: String(accessCode),
      deepLink,
      // 추가 데이터가 있어도 무방
    },
    webpush: {
      headers: { Urgency: "normal" },
      notification: {
        icon: "/logo192.png",
        tag: `profile-${profileId}-${type}`, // 동일 건 중복발송 방지
        renotify: false,
        requireInteraction: false,
      },
      fcmOptions: {
        link: deepLink, // SW 없이도 브라우저에서 해당 링크로 열림(백업용)
      },
    },
    android: {
      notification: {
        // Android WebView/PWA에서도 안전하게 동작하도록 백업 클릭 액션
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
  };
}

async function sendToAccessCode(accessCode, profilesToday, profilesD3) {
  // 토큰 불러오기 + 중복 제거
  const tokenDoc = await db.collection("fcmTokens").doc(accessCode).get();
  const tokensRaw = tokenDoc.exists ? tokenDoc.data().tokens || [] : [];
  const tokens = Array.from(new Set(tokensRaw)).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, cleaned: 0 };

  let sentCount = 0;
  let cleaned = 0;

  const allJobs = [];

  // 오늘
  for (const p of profilesToday) {
    const message = buildWebPushPayload({ accessCode, profile: p, type: "오늘의 일정" });
    allJobs.push({ profile: p, message });
  }
  // D-3
  for (const p of profilesD3) {
    const message = buildWebPushPayload({ accessCode, profile: p, type: "다가오는 일정 (D-3)" });
    allJobs.push({ profile: p, message });
  }
  if (allJobs.length === 0) return { sent: 0, cleaned: 0 };

  // 멀티캐스트 전송 + 실패 토큰 정리
  // (중복 알림 최소화 위해 같은 메시지를 한 번만 만들고 tokens만 붙여서 발송)
  for (const job of allJobs) {
    try {
      const resp = await messaging.sendEachForMulticast({ ...job.message, tokens });

      sentCount += resp.successCount;

      // 실패 토큰 제거
      const invalidTokens = [];
      resp.responses.forEach((r, idx) => {
        if (!r.success) {
          const err = String(r.error?.code || "");
          if (
            err.includes("registration-token-not-registered") ||
            err.includes("invalid-argument") ||
            err.includes("messaging/invalid-registration-token")
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await db
          .collection("fcmTokens")
          .doc(accessCode)
          .update({
            tokens: tokens.filter((t) => !invalidTokens.includes(t)),
          });
        cleaned += invalidTokens.length;
      }
    } catch (e) {
      console.error(`[${accessCode}] send error:`, e);
    }
  }

  return { sent: sentCount, cleaned };
}

// 매일 10:00 KST
exports.checkMeetingNotifications = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const nowKST = kstNow();
    const tokenToday = toTokenFromDate(nowKST);
    const tokenD3 = toTokenFromDate(addDaysKST(nowKST, 3));

    const groups = await getAccessCodeDocs();
    for (const groupDoc of groups) {
      const accessCode = groupDoc.id;
      const groupPath = groupDoc.path;

      const todayProfiles = await pickProfilesByToken(groupPath, tokenToday);
      const d3Profiles = await pickProfilesByToken(groupPath, tokenD3);

      if (todayProfiles.length === 0 && d3Profiles.length === 0) {
        console.log(`[${accessCode}] 대상 없음`);
        continue;
      }
      const res = await sendToAccessCode(accessCode, todayProfiles, d3Profiles);
      console.log(
        `[${accessCode}] today:${todayProfiles.length} d3:${d3Profiles.length} sent:${res.sent} cleaned:${res.cleaned}`
      );
    }
  }
);

// 수동 테스트 트리거 (브라우저에서 GET 가능)
// ?accessCode=코드  (필수)
// ?date=YYYY-MM-DD  (선택, 없으면 오늘 KST)
// 예: https://...cloudrun.app/?accessCode=잠재인재풀
exports.sendNotificationsNow = onRequest(async (req, res) => {
  try {
    const accessCode = req.query.accessCode;
    if (!accessCode) return res.status(400).send("accessCode 쿼리를 넣어주세요.");

    const dateParam = req.query.date; // YYYY-MM-DD
    let base = kstNow();
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split("-").map(Number);
      base = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); // KST 변환은 아래 token 생성에서 동일
      base = new Date(base.getTime() + 9 * 60 * 60 * 1000);
    }

    const tokenToday = toTokenFromDate(base);
    const tokenD3 = toTokenFromDate(addDaysKST(base, 3));

    const groupPath = `${DATA_ROOT}/${accessCode}`;
    const todayProfiles = await pickProfilesByToken(groupPath, tokenToday);
    const d3Profiles = await pickProfilesByToken(groupPath, tokenD3);

    if (todayProfiles.length === 0 && d3Profiles.length === 0) {
      return res.status(200).send("대상 없음");
    }

    const result = await sendToAccessCode(accessCode, todayProfiles, d3Profiles);
    return res
      .status(200)
      .send(
        `OK - today:${todayProfiles.length} d3:${d3Profiles.length} sent:${result.sent} cleaned:${result.cleaned}`
      );
  } catch (e) {
    console.error(e);
    return res.status(500).send("서버 오류");
  }
});
