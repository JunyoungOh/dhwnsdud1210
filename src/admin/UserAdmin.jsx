/* ===== admin/UserAdmin.jsx (훅 규칙 준수 + 안전한 규칙 예시 렌더) ===== */
import React from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useUserCtx } from '../auth/AuthGate';

export default function UserAdmin() {
  // ✅ 훅은 무조건 같은 순서로 호출되어야 합니다.
  const ctx = useUserCtx();

  const auth = getAuth();
  const db   = getFirestore();

  // 컨텍스트 플래그 (불리언/문자열 모두 허용)
  const ctxAdmin = !!(ctx?.isAdmin || ctx?.profile?.isAdmin);

  // 로그인 사용자 구독
  const [uid, setUid] = React.useState(null);
  const [email, setEmail] = React.useState('');
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
      setEmail(user?.email || '');
    });
    return () => unsub();
  }, [auth]);

  // users/{uid} 구독으로 보조 판단
  const [fireAdmin, setFireAdmin] = React.useState(null); // null=미확인, true/false=판단됨
  const [adminPath, setAdminPath] = React.useState('users / (로그인 필요)');
  const [loadingDoc, setLoadingDoc] = React.useState(false);
  const [fireErr, setFireErr] = React.useState('');

  React.useEffect(() => {
    if (!uid) {
      setFireAdmin(null);
      setAdminPath('users / (로그인 필요)');
      setLoadingDoc(false);
      setFireErr('');
      return;
    }
    setLoadingDoc(true);
    setFireErr('');
    setAdminPath(`users / ${uid}`);

    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const v = snap.data()?.isAdmin;
        setFireAdmin(v === true || v === 'true');
        setLoadingDoc(false);
      },
      (err) => {
        setFireAdmin(false);
        setLoadingDoc(false);
        setFireErr(err?.code ? `${err.code}: ${err.message}` : 'users 문서를 읽을 수 없습니다.');
        console.warn('[UserAdmin] onSnapshot error for users/' + uid, err);
      }
    );
    return () => unsub();
  }, [db, uid]);

  // 최종 관리자 판정
  const finalIsAdmin = Boolean(ctxAdmin || fireAdmin === true);

  // 디버그 배너
  const DebugBanner = () => (
    <div className="mb-4 text-xs space-x-2">
      <span className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1">
        관리자 판정: <b>{finalIsAdmin ? 'YES' : 'NO'}</b>
      </span>
      <span className="inline-block bg-gray-50 text-gray-700 border border-gray-200 rounded px-2 py-1">
        ctx.isAdmin: <b>{String(ctxAdmin)}</b>
      </span>
      <span className="inline-block bg-gray-50 text-gray-700 border border-gray-200 rounded px-2 py-1">
        users/{'{uid'} isAdmin: <b>{String(fireAdmin)}</b>
      </span>
      <span className="inline-block bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-1">
        판정 경로: <span className="font-mono">{adminPath}</span>
      </span>
      {uid && (
        <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-1">
          UID: <span className="font-mono">{uid}</span>{email ? ` (${email})` : ''}
        </span>
      )}
      {fireErr && (
        <span className="inline-block bg-red-50 text-red-700 border border-red-200 rounded px-2 py-1">
          Firestore: {fireErr}
        </span>
      )}
    </div>
  );

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
              <div className="text-sm text-gray-600 space-y-2">
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    로그인 계정의 <code>users/&#123;uid&#125;</code> 문서에 <code>isAdmin: true</code> 가 저장되어 있어야 합니다.
                  </li>
                  <li>Firestore 규칙 예시:</li>
                </ul>
                <pre className="bg-gray-50 rounded border p-2 overflow-x-auto">
                  <code>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid;
    }
  }
}`}</code>
                </pre>
                <ul className="list-disc pl-5 space-y-1">
                  <li>브라우저가 다른 구글 계정으로 로그인되어 있지 않은지 확인해 주세요.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 관리자 본문
  return (
    <div className="p-6 space-y-4">
      <DebugBanner />
      <h1 className="text-xl font-bold text-gray-800">사용자 관리</h1>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm text-gray-600">
          관리자 권한 확인됨. 필요한 관리 기능을 여기 배치하세요.
        </p>
        {/* 승인 대기 목록, 권한 토글 등 실제 기능 컴포넌트 배치 */}
      </div>
    </div>
  );
}
