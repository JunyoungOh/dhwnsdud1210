// public/firebase-messaging-sw.js

/* Firebase v9 compat for SW */
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY",
  authDomain: "dhwnsdud1210-bf233.firebaseapp.com",
  projectId: "dhwnsdud1210-bf233",
  storageBucket: "dhwnsdud1210-bf233.appspot.com",
  messagingSenderId: "9275853060",
  appId: "1:9275853060:web:e5ccfa323da3493312a851",
  measurementId: "G-XS3VFNW6Y3"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

/** 백그라운드 수신 */
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const title = payload?.notification?.title || "알림";
  const body = payload?.notification?.body || "";
  const data = payload?.data || {};

  const options = {
    body,
    icon: "/logo192.png",
    data, // profileId, url 등
  };

  self.registration.showNotification(title, options);
});

/** 알림 클릭 → 앱으로 딥링크 */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification?.data || {};
  const profileId = data.profileId;
  const deeplink = data.url || (profileId ? `/?profileId=${encodeURIComponent(profileId)}` : "/");

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // 같은 URL 열린 탭 있으면 focus
      for (const client of windowClients) {
        if (client.url && client.url.indexOf(deeplink) !== -1 && "focus" in client) {
          return client.focus();
        }
      }
      // 아니면 새 창
      if (clients.openWindow) return clients.openWindow(deeplink);
    })
  );
});
