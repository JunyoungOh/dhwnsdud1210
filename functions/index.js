const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.checkMeetingNotifications = onSchedule("every 1 minutes", async (event) => {
  const db = getFirestore();
  const messaging = getMessaging();
  const now = new Date();
  
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
  const thirtyOneMinutesFromNow = new Date(now.getTime() + 31 * 60 * 1000);

  const groupsSnapshot = await db.collection("artifacts/profile-db-app-junyoungoh/public/data").listDocuments();

  for (const groupDoc of groupsSnapshot) {
    const accessCode = groupDoc.id;
    
    const profilesSnapshot = await db.collection(groupDoc.path)
      .where('eventDate', '>=', thirtyMinutesFromNow.toISOString())
      .where('eventDate', '<', thirtyOneMinutesFromNow.toISOString())
      .get();

    if (profilesSnapshot.empty) continue;

    const tokensSnapshot = await db.collection("fcmTokens").doc(accessCode).get();
    if (!tokensSnapshot.exists) continue;
    
    const tokensData = tokensSnapshot.data();
    const tokens = tokensData.tokens || [];
    if (tokens.length === 0) continue;

    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data();
      const message = {
        notification: {
          title: "미팅 30분 전 알림",
          body: `${profile.name}님과의 미팅이 곧 시작됩니다.`
        },
        // 여기에 '꼬리표'를 추가합니다.
        data: {
          profileId: profileDoc.id,
        },
        tokens: tokens,
      };

      try {
        await messaging.sendEachForMulticast(message);
        console.log(`[${accessCode}] 알림 성공:`, profile.name);
      } catch (error) {
        console.log(`[${accessCode}] 알림 실패:`, error);
      }
    }
  }
});
