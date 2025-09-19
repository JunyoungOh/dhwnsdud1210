// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // 전역 스타일이 있다면 유지하세요.
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
