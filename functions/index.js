const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// 이 함수는 1분마다 자동으로 실행됩니다.
exports.checkMeetingNotifications = onSchedule("every 1 minutes", async (event) => {
  const db = getFirestore();
  const messaging = getMessaging();
  const now = new Date();
  
  // 30분 후와 31분 후의 시간 계산 (정확히 30분 뒤에 시작하는 미팅을 찾기 위함)
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
  const thirtyOneMinutesFromNow = new Date(now.getTime() + 31 * 60 * 1000);

  // 모든 액세스 코드 그룹(컬렉션)을 가져옵니다.
  const groupsSnapshot = await db.collection("artifacts/profile-db-app-junyoungoh/public/data").listDocuments();

  for (const groupDoc of groupsSnapshot) {
    const accessCode = groupDoc.id;
    
    // 각 그룹의 프로필 중에서 30분 뒤에 시작하는 미팅을 찾습니다.
    const profilesSnapshot = await db.collection(groupDoc.path)
      .where('eventDate', '>=', thirtyMinutesFromNow.toISOString())
      .where('eventDate', '<', thirtyOneMinutesFromNow.toISOString())
      .get();

    if (profilesSnapshot.empty) {
      continue; // 해당 그룹에 알림 보낼 미팅이 없으면 다음 그룹으로 넘어갑니다.
    }

    // 해당 그룹의 모든 알림 수신자(토큰)를 찾습니다.
    const tokensSnapshot = await db.collection("fcmTokens").doc(accessCode).get();
    if (!tokensSnapshot.exists) {
      continue; // 알림 받을 사람이 없으면 넘어갑니다.
    }
    
    const tokensData = tokensSnapshot.data();
    const tokens = tokensData.tokens || [];

    if (tokens.length === 0) {
      continue;
    }

    // 각 프로필에 대해 알림을 보냅니다.
    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data();
      const message = {
        notification: {
          title: "미팅 30분 전 알림",
          body: `${profile.name}님과의 미팅이 곧 시작됩니다.`
        },
        tokens: tokens,
      };

      try {
        const response = await messaging.sendEachForMulticast(message);
        console.log(`[${accessCode}] 알림 성공:`, response.successCount, "건");
      } catch (error) {
        console.log(`[${accessCode}] 알림 실패:`, error);
      }
    }
  }
});