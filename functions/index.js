// CommonJS + Firebase Functions v2 (Node 20)

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const axios = require("axios");

// ─────────────────────────────────────────────────────
initializeApp();

const APP_ID = "profile-db-app-junyoungoh";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 요청하신 키 (⚠️ 운영에서는 환경변수/Secret로 관리 권장)
const KAKAO_REST_API_KEY = "4e78dd31e05db3579bdc4b10936a6855";

// ─────────────────────────────────────────────────────
// 매일 10:00 KST: D-Day / D-3 일정 FCM 발송
// ─────────────────────────────────────────────────────
exports.checkMeetingNotifications = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    // KST 자정기준 기간 계산
    const now = new Date();
    const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
    const kstMidnight = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
    const todayStartISO = kstMidnight.toISOString();
    const todayEndISO = new Date(kstMidnight.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const d3 = new Date(kstMidnight);
    d3.setDate(d3.getDate() + 3);
    const d3StartISO = d3.toISOString();
    const d3EndISO = new Date(d3.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // accessCode 목록: fcmTokens 컬렉션의 문서 ID들
    const tokensColSnap = await db.collection("fcmTokens").get();
    if (tokensColSnap.empty) {
      console.log("No access groups found in fcmTokens.");
      return;
    }

    for (const tokenDoc of tokensColSnap.docs) {
      const accessCode = tokenDoc.id;
      const tokens = tokenDoc.data()?.tokens || [];
      if (!tokens.length) {
        console.log(`[${accessCode}] no tokens`);
        continue;
      }

      // 각 그룹의 프로필 "컬렉션" 경로:
      // artifacts/{APP_ID}/public/data/{accessCode}
      const profilesColPath = `artifacts/${APP_ID}/public/data/${accessCode}`;
      const profilesColRef = db.collection(profilesColPath);

      // 오늘(D-Day)
      const todaySnap = await profilesColRef
        .where("eventDate", ">=", todayStartISO)
        .where("eventDate", "<", todayEndISO)
        .get();

      // D-3
      const d3Snap = await profilesColRef
        .where("eventDate", ">=", d3StartISO)
        .where("eventDate", "<", d3EndISO)
        .get();

      const notifications = [];
      todaySnap.forEach((d) => notifications.push({ type: "오늘의 일정", id: d.id, data: d.data() }));
      d3Snap.forEach((d) => notifications.push({ type: "다가오는 일정 (D-3)", id: d.id, data: d.data() }));

      if (!notifications.length) {
        console.log(`[${accessCode}] no schedules for today/D-3`);
        continue;
      }

      for (const n of notifications) {
        const multicast = {
          tokens,
          notification: {
            title: n.type,
            body: `${n.data.name}님과의 일정이 있습니다.`,
          },
          data: {
            profileId: n.id,
            accessCode: accessCode,
          },
          // webpush: { fcmOptions: { link: `https://<YOUR_DOMAIN>/?profileId=${n.id}` } }, // 선택
        };

        try {
          const resp = await messaging.sendEachForMulticast(multicast);

          // 무효 토큰 정리
          const invalid = [];
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
                invalid.push(tokens[idx]);
              }
            }
          });

          if (invalid.length) {
            const dedup = new Set(tokens);
            invalid.forEach((t) => dedup.delete(t));
            await db.collection("fcmTokens").doc(accessCode).set(
              { tokens: Array.from(dedup) },
              { merge: true }
            );
            console.log(`[${accessCode}] cleaned ${invalid.length} invalid tokens`);
          }

          console.log(
            `[${accessCode}] ${n.data.name} (${n.type}) sent=${resp.successCount} fail=${resp.failureCount}`
          );
        } catch (e) {
          console.error(`[${accessCode}] FCM send error for ${n.data?.name} (${n.type})`, e);
        }
      }
    }
  }
);

// ─────────────────────────────────────────────────────
// Kakao: 인가코드 → 액세스 토큰 교환
// ─────────────────────────────────────────────────────
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

    return res.status(200).json(tokenResp.data); // access_token 등
  } catch (err) {
    console.error("kakaoExchangeCode failed:", err.response?.data || err.message);
    return res.status(500).json({ error: "kakao token exchange failed" });
  }
});

// ─────────────────────────────────────────────────────
// Kakao: 나에게 보내기 (사용자 access_token 필수)
// ─────────────────────────────────────────────────────
exports.sendKakaoSelfMessage = onRequest({ region: "asia-northeast3" }, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const qsToken = req.query.access_token;
    const bodyToken = req.body?.access_token;

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
      link: { web_url: webUrl, mobile_web_url: mobileWebUrl },
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
