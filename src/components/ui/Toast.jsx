// src/components/ui/Toast.jsx
import React, { useEffect, useRef, useState } from 'react';

let pushToast;
export function toast(message, opts = {}) {
  if (typeof pushToast === 'function') {
    pushToast({
      id: Math.random().toString(36).slice(2),
      message: String(message ?? ''),
      type: opts.type || 'info', // 'success' | 'error' | 'info'
      duration: typeof opts.duration === 'number' ? opts.duration : 2600,
    });
  } else {
    // 호스트가 아직 준비 전이면 콘솔로만
    console.warn('[toast]', message);
  }
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  useEffect(() => {
    pushToast = (item) => {
      setItems((prev) => [...prev, item]);
      const t = setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, item.duration);
      timers.current.set(item.id, t);
    };
    return () => {
      pushToast = undefined;
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const remove = (id) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const typeStyle = (type) => {
    switch (type) {
      case 'success': return 'bg-emerald-600';
      case 'error':   return 'bg-rose-600';
      default:        return 'bg-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            className={`pointer-events-auto min-w-[240px] max-w-[80vw] text-white text-sm shadow-lg rounded-lg px-4 py-3 ${typeStyle(it.type)}`}
            role="status"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">{it.message}</div>
              <button
                onClick={() => remove(it.id)}
                className="opacity-80 hover:opacity-100 transition"
                aria-label="dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
