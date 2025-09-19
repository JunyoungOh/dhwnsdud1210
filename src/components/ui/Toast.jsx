// src/components/ui/Toast.jsx
import React, { useEffect, useState } from 'react';

// 간단한 이벤트 버스
const listeners = new Set();
const emit = (event) => listeners.forEach((fn) => fn(event));

let idSeq = 1;

/**
 * 메시지 토스트 띄우기
 * @param {string|React.ReactNode} message
 * @param {{type?: 'info'|'success'|'error'|'warning', duration?: number}} opts
 * @returns {number} toastId
 */
export function toast(message, opts = {}) {
  const id = idSeq++;
  const payload = {
    id,
    message,
    type: opts.type || 'info',
    // 기본 3초
    duration: typeof opts.duration === 'number' ? opts.duration : 3000,
  };
  emit({ kind: 'add', payload });
  return id;
}

/** 특정 토스트 닫기 */
export function dismiss(id) {
  emit({ kind: 'remove', payload: { id } });
}

/** 루트에 한 번만 렌더하는 호스트 */
export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onEvent = (evt) => {
      if (evt.kind === 'add') {
        setItems((prev) => [...prev, evt.payload]);
        // 자동 닫기 타이머
        if (evt.payload.duration > 0) {
          const toClose = evt.payload.id;
          setTimeout(() => emit({ kind: 'remove', payload: { id: toClose } }), evt.payload.duration);
        }
      } else if (evt.kind === 'remove') {
        setItems((prev) => prev.filter((t) => t.id !== evt.payload.id));
      } else if (evt.kind === 'clear') {
        setItems([]);
      }
    };
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  }, []);

  const badgeByType = {
    info:    'bg-gray-800 text-white',
    success: 'bg-emerald-600 text-white',
    error:   'bg-red-600 text-white',
    warning: 'bg-amber-500 text-gray-900',
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto min-w-[240px] max-w-[360px] rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 ${badgeByType[t.type] || badgeByType.info}`}
          role="status"
        >
          <div className="flex-1 text-sm leading-5">{t.message}</div>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-2 text-white/80 hover:text-white transition"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// 기본 export도 제공(사용처에서 import toast from ... 형태 쓸 수 있게)
export default toast;
