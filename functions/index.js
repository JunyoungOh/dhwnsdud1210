const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// 이 함수는 특정 URL로 접속했을 때만 실행되는 테스트용 함수입니다.
exports.sendKakaoTest = functions.region("asia-northeast3").https.onRequest(async (req, res) => {
  // ⚠️ 아래에 1단계에서 발급받은 REST API 키를 입력하세요.
  const KAKAO_REST_API_KEY = "4e78dd31e05db3579bdc4b10936a6855";
  
  // 1. 카카오 서버에 인증을 요청하여 '액세스 토큰'을 받습니다.
  // 이 과정은 서버끼리 통신하는 것이므로, 사용자에게는 보이지 않습니다.
  const authUrl = "https://kauth.kakao.com/oauth/token";
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", KAKAO_REST_API_KEY);

  try {
    const authResponse = await axios.post(authUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const accessToken = authResponse.data.access_token;
    
    // 2. '알림톡'을 보내기 위한 준비를 합니다.
    // (실제 운영 시에는 사용자 ID와 미리 등록한 템플릿 ID가 필요합니다.)
    const messageUrl = "https://kapi.kakao.com/v2/api/talk/memo/default/send";
    const templateObject = {
        "object_type": "text",
        "text": "프로필 DB 대시보드 알림 테스트가 성공적으로 도착했습니다!",
        "link": {
            "web_url": "https://main--profile-db-app-junyoungoh.netlify.app",
            "mobile_web_url": "https://main--profile-db-app-junyoungoh.netlify.app"
        },
        "button_title": "앱으로 이동"
    };

    // 3. 발급받은 액세스 토큰을 사용하여 카카오 서버에 메시지 전송을 요청합니다.
    await axios.post(messageUrl, `template_object=${JSON.stringify(templateObject)}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    res.send("카카오톡 '나에게 보내기'로 테스트 메시지를 성공적으로 보냈습니다!");

  } catch (error) {
    console.error("카카오톡 알림 전송 실패:", error.response?.data || error.message);
    res.status(500).send("카카오톡 알림 전송에 실패했습니다. Functions 로그를 확인해주세요.");
  }
});
