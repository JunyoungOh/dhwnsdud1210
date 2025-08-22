/**
 * Cloud Functions (Node.js 18)
 * - 예약 알림: 매일 10:00 KST에 D-Day / D-3 푸시 발송
 * - 수동 트리거: /sendNotificationsNow?accessCode=... (테스트용)
 *
 * Firestore 구조 (클라이언트와 동일):
 * artifacts/{appId}/public/data (document)
 *   └─ {accessCode} (collection)  <-- 프로필들이 모여있는 컬렉션
 *
 * 토큰 저장 위치:
 * fcmTokens/{accessCode}  { tokens: string[] }
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

// ------------------------- 초기화 -------------------------
initializeApp();

const APP_ID = "profile-db-app-junyoungoh";
const KST_TZ = "Asia/Seoul";
const FRONT_ORIGIN = "https://main--profile-db-app-junyoungoh.netlify.app"; // 배포 URL로 교체 가능

// ------------------------- 유틸 -------------------------
/** KST(Asia/Seoul) 기준 '오늘 00:00' Date 객체를 만든다. */
function getKstDayStart(date = new Date()) {
  const kstString = date.toLocaleString("en-US", { timeZone: KST_TZ });
  const kst = new Date(kstString);
  return new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());
}

/** KST 기준 특정 일수 추가(음수도 가능) */
function addDaysKst(baseDate, days) {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** ISO 문자열(UTC)로 저장된 eventDate 를 KST 일수 차이로 평가 */
function diffDaysKst(targetIso, baseKstStart /* 00:00 KST */) {
  if (!targetIso) return null;
  const targetUtc = new Date(targetIso); // ISO → UTC Date
  // 대상 시간을 KST로 바꿔 '해당 날짜의 00:00'과 비교
  const targetKstStart = getKstDayStart(targetUtc);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((targetKstStart - baseKstStart) / msPerDay);
}

/**
 * Firestore 경로를 올바르게 순회:
 * artifacts/{APP_ID}/public/data  (document)
 *   └─ {accessCode} (collection)  ← profiles
 */
async function listAccessCodeCollections(db) {
  const dataDoc = db.doc(`artifacts/${APP_ID}/public/data`);
  const subcols = await dataDoc.listCollections(); // 각 subcollection = accessCode
  return subcols; // CollectionReference 배열
}

/** accessCode → fcmTokens/{accessCode} 에서 토큰 목록 얻기 */
async function getTokensForAccessCode(db, accessCode) {
  const snap = await db.collection("fcmTokens").doc(accessCode).get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  return Array.isArray(data.tokens) ? data.tokens : [];
}

/** 무효 토큰을 fcmTokens/{accessCode}에서 제거 */
async function pruneInvalidTokens(db, accessCode, tokensToRemove) {
  if (!tokensToRemove || tokensToRemove.length === 0) return;
  const ref = db.collection("fcmTokens").doc(accessCode);
  await ref.update({
    tokens: FieldValue.arrayRemove(...tokensToRemove),
  });
  logger.info(`[${accessCode}] 무효 토큰 정리: ${tokensToRemove.length}개`);
}

/** 멀티캐스트 발송 + 실패 토큰 정리 + 로그 */
async function sendMulticastWithCleanup(messaging, db, accessCode, tokens, payload) {
  if (!tokens.length) return;

  // FCM 웹푸시에선 webpush.fcmOptions.link 를 넣어주면
  // 일부 환경에서 서비스워커 알림 클릭 없이도 링크 동작 보장(브라우저 정책 따라 처리).
  // payload 예시:
  // {
  //   notification: { title, body },
  //   data: { profileId: '...' },
  //   webpush: { fcmOptions: { link: 'https://.../?profileId=...' } }
  // }

  const res = await messaging.sendEachForMulticast({ ...payload, tokens });

  const invalid = [];
  res.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || r.error?.message || "unknown";
      logger.warn(`[${accessCode}] 전송 실패(${code}) → 토큰 인덱스 ${idx}`);
      // 등록 토큰 무효 관련 에러 코드: 
      // messaging/invalid-registration-token, messaging/registration-token-not-registered
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        invalid.push(tokens[idx]);
      }
    }
  });

  if (invalid.length) {
    await pruneInvalidTokens(db, accessCode, invalid);
  }
}

// ------------------------- 코어 로직: 알림 대상 수집 -------------------------
/**
 * accessCode 프로필 컬렉션에서 오늘(0일)과 D-3 대상 수집
 * - 저장된 eventDate는 ISO(UTC) 문자열이라고 가정(클라이언트가 toISOString 사용)
 * - 쿼리는 넓게 잡고(KST 오늘~오늘+4일) 코드에서 다시 KST 일차 필터링
 */
async function collectNotificationsForAccessCode(db, accessCodeColRef, baseKstStart) {
  // 쿼리 범위: KST 오늘 ~ 오늘+4일 (UTC ISO 문자열 비교에서도 안전한 범위)
  const startIso = addDaysKst(baseKstStart, 0).toISOString();  // 오늘 00:00 KST의 UTC ISO
  const endIso   = addDaysKst(baseKstStart, 4).toISOString();  // 4일 뒤 00:00 KST의 UTC ISO

  // eventDate는 문자열(ISO)로 저장되어 있으므로 문자열 범위 쿼리 가능
  const snap = await accessCodeColRef
    .where("eventDate", ">=", startIso)
    .where("eventDate", "<", endIso)
    .get();

  const today = [];   // D-0
  const d3 = [];      // D-3

  snap.forEach(doc => {
    const p = doc.data();
    const delta = diffDaysKst(p.eventDate, baseKstStart);
    if (delta === 0) today.push({ id: doc.id, ...p });
    if (delta === 3) d3.push({ id: doc.id, ...p });
  });

  return { today, d3 };
}

// ------------------------- 예약 작업: 매일 10:00 KST -------------------------
exports.checkMeetingNotifications = onSchedule(
  { schedule: "0 10 * * *", timeZone: KST_TZ },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();

    const baseKstStart = getKstDayStart(); // 오늘 00:00 (KST)
    logger.info(`스케줄 시작 @KST base=${baseKstStart.toISOString()}`);

    const accessCollections = await listAccessCodeCollections(db);
    logger.info(`액세스 코드 컬렉션 수: ${accessCollections.length}`);

    for (const col of accessCollections) {
      const accessCode = col.id; // subcollection id = accessCode
      try {
        const tokens = await getTokensForAccessCode(db, accessCode);
        if (!tokens.length) {
          logger.info(`[${accessCode}] 토큰 없음 → skip`);
          continue;
        }

        const { today, d3 } = await collectNotificationsForAccessCode(db, col, baseKstStart);

        // today
        for (const profile of today) {
          const link = `${FRONT_ORIGIN}/?profileId=${profile.id}`;
          const payload = {
            notification: {
              title: "오늘의 일정",
              body: `${profile.name}님과의 일정이 있습니다.`,
            },
            data: {
              profileId: profile.id,
              accessCode: accessCode,
            },
            webpush: { fcmOptions: { link } },
          };
          await sendMulticastWithCleanup(messaging, db, accessCode, tokens, payload);
          logger.info(`[${accessCode}] D-0 발송: ${profile.name}`);
        }

        // D-3
        for (const profile of d3) {
          const link = `${FRONT_ORIGIN}/?profileId=${profile.id}`;
          const payload = {
            notification: {
              title: "다가오는 일정 (D-3)",
              body: `${profile.name}님과의 일정이 3일 후 예정입니다.`,
            },
            data: {
              profileId: profile.id,
              accessCode: accessCode,
            },
            webpush: { fcmOptions: { link } },
          };
          await sendMulticastWithCleanup(messaging, db, accessCode, tokens, payload);
          logger.info(`[${accessCode}] D-3 발송: ${profile.name}`);
        }

        if (!today.length && !d3.length) {
          logger.info(`[${accessCode}] 오늘/3일후 일정 없음`);
        }
      } catch (err) {
        logger.error(`[${accessCode}] 처리 중 오류`, err);
      }
    }

    logger.info("스케줄 작업 완료");
  }
);

// ------------------------- 수동 트리거(테스트용) -------------------------
exports.sendNotificationsNow = onRequest({ region: "asia-northeast3" }, async (req, res) => {
  try {
    const db = getFirestore();
    const messaging = getMessaging();

    const accessCodeParam = req.query.accessCode?.toString() || null;
    const baseKstStart = getKstDayStart();

    const targets = [];

    if (accessCodeParam) {
      // 특정 accessCode만 테스트
      const col = db.doc(`artifacts/${APP_ID}/public/data`).collection(accessCodeParam);
      const tokens = await getTokensForAccessCode(db, accessCodeParam);
      if (!tokens.length) return res.status(200).send(`[${accessCodeParam}] 토큰 없음`);
      const { today, d3 } = await collectNotificationsForAccessCode(db, col, baseKstStart);
      targets.push({ accessCode: accessCodeParam, col, tokens, today, d3 });
    } else {
      // 전체 순회
      const accessCollections = await listAccessCodeCollections(db);
      for (const col of accessCollections) {
        const accessCode = col.id;
        const tokens = await getTokensForAccessCode(db, accessCode);
        if (!tokens.length) continue;
        const { today, d3 } = await collectNotificationsForAccessCode(db, col, baseKstStart);
        targets.push({ accessCode, col, tokens, today, d3 });
      }
    }

    for (const t of targets) {
      const { accessCode, tokens, today, d3 } = t;

      for (const profile of today) {
        const link = `${FRONT_ORIGIN}/?profileId=${profile.id}`;
        await sendMulticastWithCleanup(messaging, db, accessCode, tokens, {
          notification: { title: "오늘의 일정", body: `${profile.name}님과의 일정이 있습니다.` },
          data: { profileId: profile.id, accessCode },
          webpush: { fcmOptions: { link } },
        });
        logger.info(`[MANUAL][${accessCode}] D-0 발송: ${profile.name}`);
      }

      for (const profile of d3) {
        const link = `${FRONT_ORIGIN}/?profileId=${profile.id}`;
        await sendMulticastWithCleanup(messaging, db, accessCode, tokens, {
          notification: { title: "다가오는 일정 (D-3)", body: `${profile.name}님과의 일정이 3일 후 예정입니다.` },
          data: { profileId: profile.id, accessCode },
          webpush: { fcmOptions: { link } },
        });
        logger.info(`[MANUAL][${accessCode}] D-3 발송: ${profile.name}`);
      }
    }

    return res.status(200).send(`OK - 대상 ${targets.length}개 처리`);
  } catch (err) {
    logger.error("수동 트리거 오류", err);
    return res.status(500).send("Internal Server Error");
  }
});
