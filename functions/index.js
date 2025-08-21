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
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // 1. "오늘의 일정" 알림 대상 찾기
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // 2. "다가오는 일정" 알림 대상 찾기 (정확히 3일 뒤)
  const threeDaysFromNowStart = new Date(todayStart);
  threeDaysFromNowStart.setDate(threeDaysFromNowStart.getDate() + 3);
  const threeDaysFromNowEnd = new Date(threeDaysFromNowStart);
  threeDaysFromNowEnd.setDate(threeDaysFromNowEnd.getDate() + 1);

  // 모든 액세스 코드 그룹(컬렉션)을 가져옵니다.
  const groupsSnapshot = await db.collection("artifacts/profile-db-app-junyoungoh/public/data").listDocuments();

  for (const groupDoc of groupsSnapshot) {
    const accessCode = groupDoc.id;
    const tokensSnapshot = await db.collection("fcmTokens").doc(accessCode).get();
    if (!tokensSnapshot.exists) continue;
    
    const tokens = tokensSnapshot.data().tokens || [];
    if (tokens.length === 0) continue;

    // "오늘의 일정" 알림 보내기
    const todayProfilesSnapshot = await db.collection(groupDoc.path)
      .where('eventDate', '>=', todayStart.toISOString())
      .where('eventDate', '<', todayEnd.toISOString())
      .get();

    for (const profileDoc of todayProfilesSnapshot.docs) {
      const profile = profileDoc.data();
      const message = {
        notification: {
          title: "오늘의 일정 알림",
          body: `${profile.name}님과의 미팅이 오늘 예정되어 있습니다.`
        },
        tokens: tokens,
      };
      await messaging.sendEachForMulticast(message);
      console.log(`[${accessCode}] 오늘의 일정 알림 성공:`, profile.name);
    }

    // "다가오는 일정" 알림 보내기
    const upcomingProfilesSnapshot = await db.collection(groupDoc.path)
      .where('eventDate', '>=', threeDaysFromNowStart.toISOString())
      .where('eventDate', '<', threeDaysFromNowEnd.toISOString())
      .get();

    for (const profileDoc of upcomingProfilesSnapshot.docs) {
        const profile = profileDoc.data();
        const message = {
            notification: {
                title: "다가오는 일정 알림 (D-3)",
                body: `${profile.name}님과의 미팅이 3일 후에 예정되어 있습니다.`
            },
            tokens: tokens,
        };
        await messaging.sendEachForMulticast(message);
        console.log(`[${accessCode}] 다가오는 일정 알림 성공:`, profile.name);
    }
  }
});
