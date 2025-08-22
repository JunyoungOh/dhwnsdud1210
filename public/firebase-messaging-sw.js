/* public/firebase-messaging-sw.js */
// compat 로더 (백그라운드 수신)
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

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

// 백그라운드 수신
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] background message: ', payload);

  const title = payload.notification?.title || '알림';
  const options = {
    body: payload.notification?.body || '',
    icon: '/logo192.png',
    data: {
      // 우리가 data에 넣어둔 profileId/링크를 그대로 싣는다.
      ...payload.data
    }
  };

  self.registration.showNotification(title, options);
});

// 클릭 시 동작 (링크 > profileId 순으로 처리)
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // 1) FCM이 제공하는 클릭 주소/링크가 있으면 우선 사용
  const fcmClick =
    event.notification?.data?.FCM_MSG?.notification?.click_action ||
    event.notification?.data?.link ||
    event.notification?.data?.url;

  // 2) 서버에서 내려준 profileId로 딥링크 구성 (보조)
  const profileId = event.notification?.data?.profileId;
  const fallbackUrl = profileId ? `/?profileId=${profileId}` : '/';

  const urlToOpen = fcmClick || fallbackUrl;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
