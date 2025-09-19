// src/components/ui/Toast.jsx
import React, { createContext, useContext, useState, useCallback } from "react";

const ToastCtx = createContext(null);
export function useToast(){ return useContext(ToastCtx); }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone="info")=>{
    const id = Math.random().toString(36).slice(2);
    setItems(x=>[...x, { id, msg, tone }]);
    setTimeout(()=>setItems(x=>x.filter(i=>i.id!==id)), 3500);
  },[]);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 space-y-2 z-[9999]">
        {items.map(i=>(
          <div key={i.id}
            className={`min-w-[240px] max-w-[360px] rounded-xl px-4 py-3 text-sm shadow-lg border
            ${i.tone==="success"?"bg-emerald-50 text-emerald-800 border-emerald-200":
              i.tone==="danger"?"bg-red-50 text-red-700 border-red-200":
              i.tone==="warning"?"bg-amber-50 text-amber-800 border-amber-200":
              "bg-white text-gray-800 border-gray-200"}`}>
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
