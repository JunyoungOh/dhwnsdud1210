// functions/index.js

/**
 * Firebase Functions v2
 * - checkMeetingNotifications: 매일 10:00(Asia/Seoul) FCM 발송
 * - kakaoExchangeCode: 카카오 인가코드 → 액세스 토큰 교환
 * - sendKakaoSelfMessage: 카카오 "나에게 보내기" (사용자 액세스 토큰 필요)
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const axios = require("axios");

// ─────────────────────────────────────────────────────────
// 초기화 & 상수
// ─────────────────────────────────────────────────────────
initializeApp();

const APP_ID = "profile-db-app-junyoungoh";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ※ 요청대로 하드코딩 (운영에서는 환경변수 사용 권장)
const KAKAO_REST_API_KEY = "4e78dd31e05db3579bdc4b10936a6855";

// ─────────────────────────────────────────────────────────
// 매일 10:00(Asia/Seoul) 알림 발송
// ─────────────────────────────────────────────────────────
exports.checkMeetingNotifications = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    // KST 자정~자정 구간 만들기
    const now = new Date();
    const nowKST = new Date(now.getTime() + KST_OFFSET_MS);
    const kstMidnight = new Date(
      nowKST.getFullYear(),
      nowKST.getMonth(),
      nowKST.getDate()
    );

    const todayStartISO = kstMidnight.toISOString();
    const todayEndISO = new Date(kstMidnight.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const d3 = new Date(kstMidnight);
    d3.setDate(d3.getDate() + 3);
    const d3StartISO = d3.toISOString();
    const d3EndISO = new Date(d3.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // accessCode별 서브컬렉션 나열 (artifacts/{APP_ID}/public/data/{accessCode}/<docs>)
    const rootDoc = db.doc(`artifacts/${APP_ID}/public/data`);
    const accessCollections = await rootDoc.listCollections(); // => CollectionReference[], id == accessCode

    for (const col of accessCollections) {
      const accessCode = col.id;

      // 오늘(D-Day) 일정
      const todaySnap = await col
        .where("eventDate", ">=", todayStartISO)
        .where("eventDate", "<", todayEndISO)
        .get();

      // D-3 일정
      const d3Snap = await col
        .where("eventDate", ">=", d3StartISO)
        .where("eventDate", "<", d3EndISO)
        .get();

      const notifications = [];
      todaySnap.forEach((d) => notifications.push({ type: "오늘의 일정", id: d.id, data: d.data() }));
      d3Snap.forEach((d) => notifications.push({ type: "다가오는 일정 (D-3)", id: d.id, data: d.data() }));

      if (notifications.length === 0) continue;

      // FCM 토큰 가져오기 (그룹 단위 저장)
      const tokensDoc = await db.collection("fcmTokens").doc(accessCode).get();
      const tokens = tokensDoc.exists ? tokensDoc.data().tokens || [] : [];
      if (tokens.length === 0) continue;

      for (const n of notifications) {
        const multicast = {
          tokens,
          notification: {
            title: n.type,
            body: `${n.data.name}님과의 일정이 있습니다.`,
          },
          data: {
            // SW에서 클릭 시 사용할 딥링크 파라미터
            profileId: n.id,
            accessCode: accessCode,
          },
          // (선택) SW 없이 클릭 링크 지정하려면:
          // webpush: { fcmOptions: { link: `https://<YOUR_DOMAIN>/?profileId=${n.id}` } },
        };

        try {
          const resp = await messaging.sendEachForMulticast(multicast);

          // 무효/만료 토큰 정리
          const invalidTokens = [];
          resp.responses.forEach((r, idx) => {
            if (!r.success) {
              const code =
                r.error?.errorInfo?.code ||
                r.error?.code ||
                "";
              if (
                code.includes("registration-token-not-registered") ||
                code.includes("invalid-argument")
              ) {
                invalidTokens.push(tokens[idx]);
              }
            }
          });

          if (invalidTokens.length) {
            const nextTokens = tokens.filter((t) => !invalidTokens.includes(t));
            await db.collection("fcmTokens").doc(accessCode).set(
              { tokens: nextTokens },
              { merge: true }
            );
          }

          console.log(
            `[${accessCode}] ${n.data.name} (${n.type}) sent=${resp.successCount} fail=${resp.failureCount}`
          );
        } catch (e) {
          console.error(`[${accessCode}] send error for ${n.data.name} (${n.type})`, e);
        }
      }
    }
  }
);

// ─────────────────────────────────────────────────────────
// Kakao: 인가코드 → 액세스 토큰 교환
// ─────────────────────────────────────────────────────────
/**
 * GET /kakaoExchangeCode?code=<AUTH_CODE>&redirectUri=<SAME_REDIRECT_URI>
 * - 카카오 로그인에서 받은 code를 access_token으로 교환
 * - 프론트가 이 access_token을 받아 /sendKakaoSelfMessage 에 전달
 */
exports.kakaoExchangeCode = onRequest({ region: "asia-northeast3" }, async (req, res) => {
  try {
    const code = req.query.code;
    const redirectUri = req.query.redirectUri;

    if (!code || !redirectUri) {
      return res.status(400).json({ error: "Missing code or redirectUri" });
    }

    const tokenUrl = "https://kauth.kakao.com/oauth/token";
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("client_id", KAKAO_REST_API_KEY);
    params.append("redirect_uri", redirectUri);
    params.append("code", code);

    const tokenResp = await axios.post(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    // access_token, refresh_token 등 반환
    return res.status(200).json(tokenResp.data);
  } catch (err) {
    console.error("kakaoExchangeCode failed:", err.response?.data || err.message);
    return res.status(500).json({ error: "kakao token exchange failed" });
  }
});

// ─────────────────────────────────────────────────────────
// Kakao: 나에게 보내기 (사용자 액세스 토큰 필요)
// ─────────────────────────────────────────────────────────
/**
 * POST /sendKakaoSelfMessage
 * Headers: Authorization: Bearer <USER_ACCESS_TOKEN>
 * Body (JSON): { text?: string, webUrl?: string, mobileWebUrl?: string, buttonTitle?: string }
 */
exports.sendKakaoSelfMessage = onRequest({ region: "asia-northeast3" }, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const qsToken = req.query.access_token; // 대안 입력
    const bodyToken = req.body?.access_token; // 대안 입력

    let userAccessToken = "";
    if (authHeader.startsWith("Bearer ")) userAccessToken = authHeader.substring("Bearer ".length);
    else if (qsToken) userAccessToken = String(qsToken);
    else if (bodyToken) userAccessToken = String(bodyToken);

    if (!userAccessToken) {
      return res.status(400).json({
        error: "Missing user access token. Provide via Authorization: Bearer <token> or access_token param.",
      });
    }

    const {
      text = "프로필 DB 대시보드 알림 테스트가 성공적으로 도착했습니다!",
      webUrl = "https://main--profile-db-app-junyoungoh.netlify.app",
      mobileWebUrl = "https://main--profile-db-app-junyoungoh.netlify.app",
      buttonTitle = "앱으로 이동",
    } = req.body || {};

    const templateObject = {
      object_type: "text",
      text,
      link: {
        web_url: webUrl,
        mobile_web_url: mobileWebUrl,
      },
      button_title: buttonTitle,
    };

    const url = "https://kapi.kakao.com/v2/api/talk/memo/default/send";
    const payload = new URLSearchParams();
    payload.append("template_object", JSON.stringify(templateObject));

    const kakaoResp = await axios.post(url, payload.toString(), {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    return res.status(200).json({ ok: true, result: kakaoResp.data });
  } catch (err) {
    console.error("sendKakaoSelfMessage failed:", err.response?.data || err.message);
    return res.status(500).json({ error: "kakao send failed", detail: err.response?.data || err.message });
  }
});
