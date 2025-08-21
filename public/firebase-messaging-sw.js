// public/firebase-messaging-sw.js

// Firebase SDK 스크립트를 가져옵니다.
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js");

// 여기에 회원님의 Firebase 구성 정보를 붙여넣으세요.
// 이 정보는 App.js에 있는 firebaseConfig와 동일해야 합니다.
const firebaseConfig = {
  apiKey: "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY",
  authDomain: "dhwnsdud1210-bf233.firebaseapp.com",
  projectId: "dhwnsdud1210-bf233",
  storageBucket: "dhwnsdud1210-bf233.appspot.com",
  messagingSenderId: "9275853060",
  appId: "1:9275853060:web:e5ccfa323da3493312a851",
  measurementId: "G-XS3VFNW6Y3"
};

// Firebase 앱을 초기화합니다.
firebase.initializeApp(firebaseConfig);

// 메시징 서비스를 가져옵니다.
const messaging = firebase.messaging();

// 백그라운드에서 메시지를 처리하는 핸들러입니다.
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png' // 알림에 표시될 아이콘 (public 폴더에 있는 이미지)
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
