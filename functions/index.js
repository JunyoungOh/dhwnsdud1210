// Cloud Functions v2 (Node.js 20)
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const APP_ID = 'profile-db-app-junyoungoh';

// ✅ 사용 중인 배포 URL
const APP_URL = 'https://harmonious-dango-511e5b.netlify.app';

// KST 계산용
const KST_OFFSET = 9 * 60 * 60 * 1000;

function kstRange(daysFromToday = 0) {
  const now = new Date(Date.now() + KST_OFFSET);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(base);
  start.setDate(start.getDate() + daysFromToday);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function getTargets(db, accessCode) {
  const col = db.collection(`artifacts/${APP_ID}/public/data/${accessCode}`);
  const today = kstRange(0);
  const d3 = kstRange(3);

  const [todaySnap, d3Snap] = await Promise.all([
    col.where('eventDate', '>=', today.startISO).where('eventDate', '<', today.endISO).get(),
    col.where('eventDate', '>=', d3.startISO).where('eventDate', '<', d3.endISO).get(),
  ]);

  const items = [];
  todaySnap.forEach((doc) => items.push({ id: doc.id, type: '오늘의 일정', ...doc.data() }));
  d3Snap.forEach((doc) => items.push({ id: doc.id, type: '다가오는 일정 (D-3)', ...doc.data() }));

  return items;
}

async function getTokens(db, accessCode) {
  const snap = await db.collection('fcmTokens').doc(accessCode).get();
  if (!snap.exists) return [];
  const arr = snap.data().tokens || [];
  // ✅ 중복 제거
  return [...new Set(arr)].filter(Boolean);
}

async function sendOne({ accessCode, item, tokens }) {
  const link = `${APP_URL}/?profileId=${item.id}`;
  const message = {
    tokens,
    notification: {
      title: item.type,
      body: `${item.name || '프로필'}님과의 일정이 있습니다.`
    },
    data: {
      profileId: item.id,
      accessCode
    },
    webpush: {
      fcmOptions: { link }, // ✅ 웹 브라우저에서 클릭 시 열 주소
      notification: {
        icon: '/logo192.png'
      }
    },
    android: {
      notification: {
        clickAction: link
      }
    }
  };

  const res = await getMessaging().sendEachForMulticast(message);
  console.log(`[${accessCode}] '${item.name}' -> success ${res.successCount}/${tokens.length}`);
  return res;
}

// ⏰ 매일 오전 10시 KST (리전 통일: asia-northeast3)
exports.checkMeetingNotifications = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'Asia/Seoul', region: 'asia-northeast3' },
  async () => {
    const db = getFirestore();
    const groups = await db.collection(`artifacts/${APP_ID}/public/data`).listDocuments();

    for (const groupDoc of groups) {
      const accessCode = groupDoc.id;
      const [items, tokens] = await Promise.all([
        getTargets(db, accessCode),
        getTokens(db, accessCode),
      ]);
      if (!tokens.length || !items.length) continue;

      // ✅ 대표 1건만 발송 (중복 알림 방지)
      await sendOne({ accessCode, item: items[0], tokens });

      // 여러 건 보내고 싶으면 아래 주석 해제 (예: 최대 2건)
      // for (const item of items.slice(0, 2)) await sendOne({ accessCode, item, tokens });
    }
  }
);

// 🌐 수동 테스트용 HTTP 트리거 (리전 통일: asia-northeast3)
// 예) https://<호스트>/send?accessCode=잠재인재풀
exports.sendNotificationsNow = onRequest({ region: 'asia-northeast3' }, async (req, res) => {
  try {
    const raw = req.query.accessCode || '';
    const accessCode = decodeURIComponent(String(raw)).trim();
    if (!accessCode) return res.status(400).send('accessCode 쿼리가 필요합니다.');

    const db = getFirestore();
    const [items, tokens] = await Promise.all([
      getTargets(db, accessCode),
      getTokens(db, accessCode),
    ]);

    if (!tokens.length) return res.send('토큰이 없습니다. (권한 허용/토큰 저장 필요)');
    if (!items.length) return res.send('대상 없음 (오늘/D-3 조건 불일치)');

    await sendOne({ accessCode, item: items[0], tokens });
    return res.send(`OK - 대상 1개 처리`);
  } catch (e) {
    console.error(e);
    return res.status(500).send('서버 오류');
  }
});
