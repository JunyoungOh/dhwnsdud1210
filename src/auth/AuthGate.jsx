import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const AuthCtx = createContext(null);
export const useUserCtx = () => useContext(AuthCtx);

export default function AuthGate({ children }) {
  const auth = getAuth();
  const db = getFirestore();

  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setUserDoc(null);
      setError('');

      if (!u) {
        setLoading(false);
        return;
      }

      // users/{uid} 로드 및 email 항상 동기화
      try {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);
        let userData = snap.exists() ? snap.data() : {};

        // 이메일 동기화: Firestore에 email 필드가 없거나, 바뀐 경우 항상 업데이트
        const emailToSet = u.email || '';
        if (!userData.email || userData.email !== emailToSet) {
          userData = { ...userData, email: emailToSet };
          await setDoc(userRef, { email: emailToSet }, { merge: true });
        }

        // 최초 생성시 나머지 필드도 보장
        if (!snap.exists()) {
          userData = {
            ...userData,
            approved: false,
            role: 'user',
            allowedAccessCodes: [],
          };
          await setDoc(userRef, userData, { merge: true });
        }

        setUserDoc(userData);
      } catch (e) {
        setError('사용자 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [auth, db]);

  const handleSignIn = async (e) => {
    e?.preventDefault?.();
    try {
      setError('');
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    } catch (e) {
      setError(e.message || '로그인 실패');
    }
  };

  const handleSignUp = async (e) => {
    e?.preventDefault?.();
    try {
      setError('');
      await createUserWithEmailAndPassword(auth, email.trim(), pw);
      // 기본 users 문서는 onAuthStateChanged에서 생성/보정됨
      alert('가입 완료! 운영자의 승인 후 이용 가능합니다.');
    } catch (e) {
      setError(e.message || '가입 실패');
    }
  };

  const ctxValue = useMemo(() => {
    const isAdminFromDoc = !!(userDoc && (
      userDoc.role === 'admin' ||
      userDoc.isAdmin === true ||
      userDoc.isAdmin === 'true'
    ));
    const isApproved = !!(userDoc && (
      userDoc.approved === true ||
      userDoc.approved === 'true'
    ));

    return {
      user,
      userDoc,
      isAdmin: isAdminFromDoc,
      approved: isApproved,
      signOut: () => signOut(auth),
    };
  }, [user, userDoc, auth]);

  // 1) 로딩
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        로딩 중...
      </div>
    );
  }

  // 2) 미로그인 → 로그인/가입 UI
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-xl font-bold">
            {mode === 'signin' ? '로그인' : '가입'}
          </h2>
          <form
            onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
            className="space-y-3"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              className="w-full border rounded p-2"
            />
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              className="w-full border rounded p-2"
            />
            <button className="w-full bg-yellow-400 hover:bg-yellow-500 text-white rounded p-2">
              {mode === 'signin' ? '로그인' : '가입하기'}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
          <div className="text-sm text-gray-600">
            {mode === 'signin' ? (
              <>
                계정이 없으신가요?{' '}
                <button
                  className="text-yellow-600"
                  onClick={() => setMode('signup')}
                >
                  가입하기
                </button>
              </>
            ) : (
              <>
                이미 계정이 있으신가요?{' '}
                <button
                  className="text-yellow-600"
                  onClick={() => setMode('signin')}
                >
                  로그인
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3) 로그인은 됐지만 승인 전
  if (!ctxValue.approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center space-y-4">
          <h2 className="text-xl font-bold">승인 대기 중</h2>
          <p className="text-gray-600 text-sm">
            운영자의 승인 후 이용할 수 있습니다. 문의: 관리자에게 연락 바랍니다.
          </p>
          <button
            className="text-sm text-gray-500 underline"
            onClick={() => ctxValue.signOut()}
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // 4) 승인 완료 → 앱 콘텐츠 렌더
  return (
    <AuthCtx.Provider value={ctxValue}>
      {children}
    </AuthCtx.Provider>
  );
}
