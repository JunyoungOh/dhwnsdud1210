// src/admin/UserAdmin.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { getFirestore, collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useUserCtx } from '../auth/AuthGate';

export default function UserAdmin() {
  const { isAdmin } = useUserCtx();
  const db = getFirestore();

  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    const colRef = collection(db, 'users');
    const unsub = onSnapshot(colRef, (qs) => {
      setUsers(qs.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [db, isAdmin]);

  const pending = useMemo(() => users.filter(u=>!u.approved), [users]);
  const approved = useMemo(() => users.filter(u=>u.approved), [users]);

  if (!isAdmin) {
    return <div className="text-sm text-gray-500">권한이 없습니다.</div>;
  }

  const toggleApprove = async (u, next) => {
    await updateDoc(doc(db, 'users', u.id), { approved: !!next });
  };
  const toggleAdmin = async (u, next) => {
    await updateDoc(doc(db, 'users', u.id), { role: next ? 'admin' : 'user' });
  };
  const setCodes = async (u, codesCSV) => {
    const arr = codesCSV.split(',').map(s=>s.trim()).filter(Boolean);
    await updateDoc(doc(db, 'users', u.id), { allowedAccessCodes: arr });
  };

  const Row = ({u}) => {
    const [codes, setCodesInput] = useState((u.allowedAccessCodes||[]).join(', '));
    return (
      <tr className="border-t">
        <td className="px-2 py-2 text-sm">{u.email || '-'}</td>
        <td className="px-2 py-2 text-sm">{u.role || 'user'}</td>
        <td className="px-2 py-2 text-sm">{u.approved ? 'O' : 'X'}</td>
        <td className="px-2 py-2 text-sm w-[40%]">
          <input value={codes} onChange={e=>setCodesInput(e.target.value)} className="w-full border rounded p-1 text-sm" />
        </td>
        <td className="px-2 py-2 text-sm space-x-2">
          <button onClick={()=>setCodes(u, codes)} className="px-2 py-1 bg-gray-100 rounded">코드 저장</button>
          <button onClick={()=>toggleApprove(u, !u.approved)} className="px-2 py-1 bg-yellow-100 rounded">{u.approved?'승인해제':'승인'}</button>
          <button onClick={()=>toggleAdmin(u, u.role!=='admin')} className="px-2 py-1 bg-blue-100 rounded">{u.role==='admin'?'관리자 해제':'관리자 부여'}</button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8">
      <section className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-bold mb-2">승인 대기</h2>
        <table className="w-full text-left">
          <thead className="text-sm text-gray-500">
            <tr><th className="px-2 py-2">이메일</th><th className="px-2 py-2">역할</th><th className="px-2 py-2">승인</th><th className="px-2 py-2">허용 Access Code</th><th className="px-2 py-2">액션</th></tr>
          </thead>
          <tbody>
            {pending.length ? pending.map(u => <Row key={u.id} u={u} />) : <tr><td className="px-2 py-4 text-sm text-gray-500" colSpan={5}>대기 중 사용자 없음</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-bold mb-2">승인된 사용자</h2>
        <table className="w-full text-left">
          <thead className="text-sm text-gray-500">
            <tr><th className="px-2 py-2">이메일</th><th className="px-2 py-2">역할</th><th className="px-2 py-2">승인</th><th className="px-2 py-2">허용 Access Code</th><th className="px-2 py-2">액션</th></tr>
          </thead>
          <tbody>
            {approved.length ? approved.map(u => <Row key={u.id} u={u} />) : <tr><td className="px-2 py-4 text-sm text-gray-500" colSpan={5}>표시할 사용자 없음</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
