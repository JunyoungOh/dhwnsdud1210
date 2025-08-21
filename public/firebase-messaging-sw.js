// public/firebase-messaging-sw.js

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

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png',
    data: payload.data // 서버에서 보낸 '꼬리표' 데이터를 알림에 포함
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 사용자가 알림을 클릭했을 때의 동작을 정의합니다.
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // 알림창 닫기

  const profileId = event.notification.data.profileId;
  // 알림 클릭 시, 프로필 ID를 주소에 달고 앱을 엽니다.
  const urlToOpen = new URL('/', self.location.origin).href + `?profileId=${profileId}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // 이미 앱이 열려있는 경우, 해당 탭으로 이동하고 새로고침합니다.
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // 앱이 닫혀있는 경우, 새 탭으로 엽니다.
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
