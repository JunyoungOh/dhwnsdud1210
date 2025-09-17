/* ===== admin/UserAdmin.jsx (전체본) ===== */
import React from 'react';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useUserCtx } from '../auth/AuthGate';

export default function UserAdmin() {
  const ctx = useUserCtx?.();           // AuthGate가 제공하는 컨텍스트(있으면 최우선)
  const auth = getAuth();
  const db   = getFirestore();

  // 컨텍스트의 관리자 플래그(없으면 false)
  const ctxAdmin = !!(ctx?.isAdmin || ctx?.profile?.isAdmin);

  // Firestore의 users/{uid} 실시간 구독으로 보조 판단
  const [fireAdmin, setFireAdmin]   = React.useState(null); // null=미확인, true/false=판단됨
  const [adminPath, setAdminPath]   = React.useState('users / (로그인 필요)');
  const [loadingDoc, setLoadingDoc] = React.useState(true);

  // 현재 로그인 사용자
  const [uid, setUid] = React.useState(null);
  React.useEffect(() => {
    const u = auth.currentUser;
    setUid(u?.uid || null);
  }, [auth]);

  React.useEffect(() => {
    // 로그인 전이거나 uid가 아직 없으면 대기
    if (!uid) {
      setFireAdmin(null);
      setAdminPath('users / (로그인 필요)');
      setLoadingDoc(false);
      return;
    }

    setLoadingDoc(true);
    const ref = doc(db, 'users', uid);
    setAdminPath(`users / ${uid}`);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const v = data?.isAdmin;
        // boolean true, 혹은 문자열 "true" 모두 허용
        setFireAdmin(v === true || v === 'true');
        setLoadingDoc(false);
      },
      () => {
        // 읽기 권한 없음/문서 없음 → 관리자 아님으로 판단
        setFireAdmin(false);
        setLoadingDoc(false);
      }
    );

    return () => unsub();
  }, [db, uid]);

  // 최종 관리자 판정: 컨텍스트 OR Firestore 구독 결과
  const finalIsAdmin = !!(ctxAdmin || fireAdmin);

  // ───────────────── 상단 디버그 배너 (항상 표시) ─────────────────
  const DebugBanner = () => (
    <div className="mb-4 text-xs">
      <div className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 mr-2">
        관리자 판정: <b>{finalIsAdmin ? 'YES' : 'NO'}</b>
      </div>
      <div className="inline-block bg-gray-50 text-gray-700 border border-gray-200 rounded px-2 py-1 mr-2">
        ctx.isAdmin: <b>{String(ctxAdmin)}</b>
      </div>
      <div className="inline-block bg-gray-50 text-gray-700 border border-gray-200 rounded px-2 py-1 mr-2">
        users/{'{uid'}} isAdmin: <b>{String(fireAdmin)}</b>
      </div>
      <div className="inline-block bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-1">
        판정 경로: <span className="font-mono">{adminPath}</span>
      </div>
    </div>
  );

  // ───────────────── 권한 없음 화면 ─────────────────
  if (!finalIsAdmin) {
    return (
      <div className="p-6">
        <DebugBanner />
        <div className="flex items-start gap-3 p-4 rounded-lg border bg-white">
          <ShieldAlert className="text-red-500 mt-0.5" />
          <div>
            <div className="font-semibold text-gray-900 mb-1">권한이 없습니다.</div>
            {loadingDoc ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> 관리자 여부 확인 중...
              </div>
            ) : (
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                <li>로그인한 계정의 <code>users/{'{uid'}}</code> 문서에 <code>isAdmin: true</code> 가 있는지 확인해 주세요.</li>
                <li>Firestore 규칙에서 <code>match /users/{'{uid'}}</code> 에 대해 <code>allow read</code> 가 허용되어 있는지 확인해 주세요.</li>
                <li>브라우저가 다른 계정으로 로그인되어 있지 않은지 확인해 주세요.</li>
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ───────────────── 관리자 본문 (샘플) ─────────────────
  // 여기서부터는 실제 관리자 UI를 자유롭게 배치하면 됩니다.
  // 최소한의 틀만 넣어 두었습니다.
  return (
    <div className="p-6 space-y-4">
      <DebugBanner />
      <h1 className="text-xl font-bold text-gray-800">사용자 관리</h1>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm text-gray-600">
          관리자 권한이 확인되었습니다. 필요한 관리 도구를 여기에 배치하세요.
        </p>
        {/* 예: 승인 대기 목록, 사용자 권한 토글, 감사 로그 등 */}
      </div>
    </div>
  );
}
