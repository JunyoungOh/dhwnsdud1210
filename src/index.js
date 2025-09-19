// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ToastHost } from './components/ui/Toast';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
    {/* 전역 토스트 호스트: 루트에서 단 한 번만 렌더 */}
    <ToastHost />
  </React.StrictMode>
);
