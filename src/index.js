import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // 앱의 전역 스타일을 위한 CSS 파일입니다.
import App from './App'; // 우리가 만든 메인 앱 컴포넌트입니다.

// public/index.html 파일에서 id가 'root'인 엘리먼트를 찾습니다.
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

// 찾은 'root' 엘리먼트 안에 App 컴포넌트를 렌더링합니다.
// React.StrictMode는 개발 중에 잠재적인 문제를 감지하기 위한 래퍼입니다.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
