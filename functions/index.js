const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// 이 함수는 매일 오전 10시(한국 시간 기준)에 자동으로 실행됩니다.
exports.checkMeetingNotifications = onSchedule({
  schedule: "0 10 * * *",
  timeZone: "Asia/Seoul",
}, async (event) => {
  const db = getFirestore();
  const messaging = getMessaging();
  const now = new Date();
  
  const kstOffset = 9 * 60 * 60 * 1000;
  const todayKST = new Date(now.getTime() + kstOffset);
  const todayStart = new Date(todayKST.getFullYear(), todayKST.getMonth(), todayKST.getDate());
  
  const threeDaysFromNow = new Date(todayStart);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const groupsSnapshot = await db.collection("artifacts/profile-db-app-junyoungoh/public/data").listDocuments();

  for (const groupDoc of groupsSnapshot) {
    const accessCode = groupDoc.id;
    
    const notificationsToSend = [];

    // 1. 오늘의 일정 (D-Day)
    const todaySnapshot = await db.collection(groupDoc.path)
      .where('eventDate', '>=', todayStart.toISOString())
      .where('eventDate', '<', new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .get();
      
    todaySnapshot.forEach(doc => {
        notificationsToSend.push({ profile: doc.data(), type: "오늘의 일정", profileId: doc.id });
    });

    // 2. 다가오는 일정 (D-3)
    const upcomingSnapshot = await db.collection(groupDoc.path)
      .where('eventDate', '>=', threeDaysFromNow.toISOString())
      .where('eventDate', '<', new Date(threeDaysFromNow.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .get();

    upcomingSnapshot.forEach(doc => {
        notificationsToSend.push({ profile: doc.data(), type: "다가오는 일정 (D-3)", profileId: doc.id });
    });

    if (notificationsToSend.length === 0) continue;

    const tokensSnapshot = await db.collection("fcmTokens").doc(accessCode).get();
    if (!tokensSnapshot.exists) continue;
    
    const tokensData = tokensSnapshot.data();
    const tokens = tokensData.tokens || [];
    if (tokens.length === 0) continue;

    for (const item of notificationsToSend) {
      const message = {
        notification: {
          title: item.type,
          body: `${item.profile.name}님과의 일정이 있습니다.`
        },
        data: {
          profileId: item.profileId,
        },
        tokens: tokens,
      };

      try {
        await messaging.sendEachForMulticast(message);
        console.log(`[${accessCode}] 알림 성공:`, item.profile.name, `(${item.type})`);
      } catch (error) {
        console.log(`[${accessCode}] 알림 실패:`, error);
      }
    }
  }
});
