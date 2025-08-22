// functions/index.js

/**
 * (YY.MM.DD) 형식의 meetingDateToken 을 기준으로
 *  - 오늘(0일) & D-3(3일 뒤) 대상에게 푸시 발송
 *  - 수동 트리거(sendNotificationsNow)와 스케줄 트리거(checkMeetingNotifications) 제공
 * 알림 클릭 시 Netlify 배포 도메인으로 딥링크
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const REGION = "asia-northeast3"; // 서울 리전
const APP_ID = "profile-db-app-junyoungoh";

// 🔗 알림 클릭 시 열 도메인 (사용자 제공)
const SITE_BASE_URL = "https://harmonious-dango-511e5b.netlify.app";

// Firestore 경로 루트
const TARGET_COLLECTION_ROOT = `artifacts/${APP_ID}/public/data`;

// 토큰 중복 제거
const dedupe = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

// KST 기준 (YY.MM.DD) 토큰 만들기
const kstToken = (offsetDays = 0) => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST now
  now.setDate(now.getDate() + offsetDays);
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
};

// 개별 accessCode 그룹 처리
async function processGroup(accessCode, db, messaging) {
  const todayTok = kstToken(0);
  const d3Tok = kstToken(3);

  // 예: artifacts/<appId>/public/data/<accessCode>
  const groupCol = db.collection(`${TARGET_COLLECTION_ROOT}/${accessCode}`);

  // meetingDateToken 으로 정확 조회
  const [todaySnap, d3Snap] = await Promise.all([
    groupCol.where("meetingDateToken", "==", todayTok).get(),
    groupCol.where("meetingDateToken", "==", d3Tok).get(),
  ]);

  const items = [];
  todaySnap.forEach((doc) => items.push({ id: doc.id, data: doc.data(), type: "오늘의 일정" }));
  d3Snap.forEach((doc) => items.push({ id: doc.id, data: doc.data(), type: "다가오는 일정 (D-3)" }));

  if (items.length === 0) return { count: 0 };

  // 토큰 로드: fcmTokens/<accessCode> { tokens: [...] }
  const tokenDoc = await db.collection("fcmTokens").doc(accessCode).get();
  if (!tokenDoc.exists) return { count: 0 };

  const tokens = dedupe(tokenDoc.data()?.tokens);
  if (tokens.length === 0) return { count: 0 };

  let sent = 0;
  for (const item of items) {
    const deeplink = `${SITE_BASE_URL}/?profileId=${encodeURIComponent(item.id)}`;

    const message = {
      notification: {
        title: item.type,
        body: `${item.data.name ?? "알 수 없음"} 프로필 일정이 있습니다.`,
      },
      data: {
        profileId: item.id,
        url: deeplink, // SW에서 우선 사용
      },
      tokens,
    };

    try {
      await messaging.sendEachForMulticast(message);
      sent++;
      console.log(`[${accessCode}] sent: ${item.data.name} (${item.type})`);
    } catch (e) {
      console.error(`[${accessCode}] send error:`, e);
    }
  }

  return { count: sent };
}

/**
 * 1) 스케줄 트리거 (매일 오전 10시 KST)
 */
exports.checkMeetingNotifications = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Seoul", region: REGION },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    const groups = await db.collection(TARGET_COLLECTION_ROOT).listDocuments();
    let total = 0;
    for (const g of groups) {
      const accessCode = g.id;
      const { count } = await processGroup(accessCode, db, messaging);
      total += count;
    }
    console.log(`Scheduled push done. groups: ${groups.length}, pushed items: ${total}`);
  }
);

/**
 * 2) 수동 트리거 (브라우저/포스트맨): ?accessCode=...
 * 예) https://<trigger-url>/sendNotificationsNow?accessCode=잠재인재풀
 */
exports.sendNotificationsNow = onRequest({ region: REGION }, async (req, res) => {
  try {
    const accessCode = req.query.accessCode;
    if (!accessCode) return res.status(400).send("Query param 'accessCode' is required");

    const db = getFirestore();
    const messaging = getMessaging();

    const { count } = await processGroup(accessCode, db, messaging);
    res.status(200).send(count > 0 ? `OK - 대상 ${count}개 처리` : "대상 없음");
  } catch (e) {
    console.error(e);
    res.status(500).send("서버 오류");
  }
});

/**
 * 3) (선택) 백필: 예전 문서에 meetingDateToken 채우기 (관리자용)
 *    브라우저에서 1회: /backfillMeetingDateToken?accessCode=잠재인재풀
 */
exports.backfillMeetingDateToken = onRequest({ region: REGION }, async (req, res) => {
  try {
    const accessCode = req.query.accessCode;
    if (!accessCode) return res.status(400).send("Query param 'accessCode' is required");

    const db = getFirestore();
    const col = db.collection(`${TARGET_COLLECTION_ROOT}/${accessCode}`);
    const snap = await col.get();

    const re = /\((\d{2})\.(\d{2})\.(\d{2})\)/g;
    let updated = 0;

    for (const docSnap of snap.docs) {
      const p = docSnap.data();
      if (!p.meetingDateToken && p.meetingRecord) {
        const m = [...p.meetingRecord.matchAll(re)];
        if (m.length > 0) {
          const last = m[m.length - 1];
          const token = `${last[1]}.${last[2]}.${last[3]}`; // "YY.MM.DD"
          await docSnap.ref.update({ meetingDateToken: token });
          updated++;
        }
      }
    }
    res.send(`backfill done: updated ${updated}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("서버 오류");
  }
});
