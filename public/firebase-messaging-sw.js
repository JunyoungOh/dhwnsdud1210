// public/firebase-messaging-sw.js
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY",
  authDomain: "dhwnsdud1210-bf233.firebaseapp.com",
  projectId: "dhwnsdud1210-bf233",
  storageBucket: "dhwnsdud1210-bf233.appspot.com",
  messagingSenderId: "9275853060",
  appId: "1:9275853060:web:e5ccfa323da3493312a851",
  measurementId: "G-XS3VFNW6Y3"
});

const messaging = firebase.messaging();

// 배포한 웹앱 URL (딥링크 백업용)
const APP_BASE_URL = "https://harmonious-dango-511e5b.netlify.app";

// 백그라운드 수신 → 우리가 직접 노티 보여줌
messaging.onBackgroundMessage((payload) => {
  // payload.notification + payload.data
  const title = payload?.notification?.title || "알림";
  const body = payload?.notification?.body || "";
  const data = payload?.data || {};

  // tag/renotify는 서버에서도 넣지만, 여기서도 한 번 더 안전빵
  const notificationOptions = {
    body,
    icon: "/logo192.png",
    tag: data.profileId ? `profile-${data.profileId}-${title}` : undefined,
    renotify: false,
    data, // profileId / accessCode / deepLink 등이 들어있음
  };

  self.registration.showNotification(title, notificationOptions);
});

// 알림 클릭 → 열린 탭 포커스 or 새 탭으로
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const deepLink =
    data.deepLink ||
    `${APP_BASE_URL}/?profileId=${encodeURIComponent(data.profileId || "")}&accessCode=${encodeURIComponent(
      data.accessCode || ""
    )}`;

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        // 같은 오리진이면 포커스+이동
        try {
          const url = new URL(client.url);
          const appUrl = new URL(APP_BASE_URL);
          if (url.origin === appUrl.origin) {
            client.postMessage({ type: "OPEN_PROFILE", profileId: data.profileId });
            return client.focus();
          }
        } catch (_) {}
      }
      // 열려 있는 탭이 없으면 새 창
      if (clients.openWindow) {
        return clients.openWindow(deepLink);
      }
    })()
  );
});
