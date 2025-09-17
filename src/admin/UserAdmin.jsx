// ./admin/UserAdmin.jsx
import React from 'react';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import {
  ShieldCheck, ShieldX, Search as SearchIcon, Check, X as XIcon, Loader2, UserCog,
} from 'lucide-react';

const db = getFirestore();
const auth = getAuth();

/**
 * UserAdmin
 * - App.jsx에서 <UserAdmin probe={adminProbe} />로 전달되는 probe를 사용(없어도 동작)
 * - 핵심 기능:
 *   1) 나의 관리자 상태/진단 표시
 *   2) UID로 users/{uid} 문서 조회
 *   3) 관리자 승격/해제, 문서 생성/삭제
 */
export default function UserAdmin({ probe, isAdminOverride }) {
  // 나의 계정 정보
  const me = auth.currentUser;
  const myUid = me?.uid || null;
  const myEmail = me?.email || '(이메일 없음)';

  // 최종 관리자 판정 (App에서 온 값이 최우선)
  const isAdminResolved = !!(isAdminOverride || probe?.isAdmin);
  const loadingAdmin = !!probe?.isLoading;

  // 타겟 사용자 관리 상태
  const [targetUid, setTargetUid] = React.useState('');
  const [targetDoc, setTargetDoc] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [err, setErr] = React.useState('');

  const resetMsg = () => { setMsg(''); setErr(''); };

  const fetchUserDoc = async () => {
    resetMsg();
    if (!targetUid.trim()) { setErr('UID를 입력하세요.'); return; }
    setBusy(true);
    try {
      const ref = doc(db, 'users', targetUid.trim());
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setTargetDoc({ id: snap.id, ...snap.data() });
        setMsg('문서를 불러왔습니다.');
      } else {
        setTargetDoc(null);
        setMsg('문서가 없습니다. (아래 "문서 생성"으로 만들 수 있어요)');
      }
    } catch (e) {
      console.error(e);
      setErr(e?.code ? `${e.code}: ${e.message}` : '문서를 읽는 중 오류가 발생했습니다.');
      setTargetDoc(null);
    } finally {
      setBusy(false);
    }
  };

  const ensureDocExists = async () => {
    resetMsg();
    if (!targetUid.trim()) { setErr('UID를 입력하세요.'); return; }
    setBusy(true);
    try {
      await setDoc(doc(db, 'users', targetUid.trim()), {
        // 초기 필드들 — 필요에 맞게 확장
        isAdmin: false,
        email: null,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      setMsg('문서를 생성/병합했습니다.');
      await fetchUserDoc();
    } catch (e) {
      console.error(e);
      setErr(e?.code ? `${e.code}: ${e.message}` : '문서를 생성하는 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAdmin = async (value) => {
    resetMsg();
    if (!targetUid.trim()) { setErr('UID를 입력하세요.'); return; }
    setBusy(true);
    try {
      await setDoc(doc(db, 'users', targetUid.trim()), {
        isAdmin: !!value,
        // 참고: 이메일을 users/{uid}에 보관해두면 이후 검색/표시에 유용
        // email: targetDoc?.email ?? null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setMsg(value ? '관리자로 승격했습니다.' : '관리자 권한을 해제했습니다.');
      await fetchUserDoc();
    } catch (e) {
      console.error(e);
      setErr(e?.code ? `${e.code}: ${e.message}` : '권한 업데이트 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const deleteUserDoc = async () => {
    resetMsg();
    if (!targetUid.trim()) { setErr('UID를 입력하세요.'); return; }
    if (!window.confirm('해당 users/{uid} 문서를 삭제할까요?')) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'users', targetUid.trim()));
      setTargetDoc(null);
      setMsg('문서를 삭제했습니다.');
    } catch (e) {
      console.error(e);
      setErr(e?.code ? `${e.code}: ${e.message}` : '문서를 삭제하는 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const setMyselfAdmin = async () => {
    resetMsg();
    if (!myUid) { setErr('로그인 사용자를 확인할 수 없습니다.'); return; }
    setBusy(true);
    try {
      await setDoc(doc(db, 'users', myUid), {
        isAdmin: true,
        email: myEmail ?? null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setMsg('나에게 관리자 권한을 다시 설정했습니다. (새로고침 후 반영)');
    } catch (e) {
      console.error(e);
      setErr(e?.code ? `${e.code}: ${e.message}` : '관리자 설정 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* 상단 상태 카드 */}
      <section className="bg-white rounded-xl shadow p-5 border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserCog className="text-yellow-500" />
            <h2 className="text-lg font-bold">관리자 콘솔</h2>
          </div>
          <div className="flex items-center gap-2">
            {loadingAdmin ? (
              <span className="inline-flex items-center text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-1" /> 권한 확인 중…
              </span>
            ) : isAdminResolved ? (
              <span className="inline-flex items-center text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded text-sm">
                <ShieldCheck className="w-4 h-4 mr-1" /> 관리자 권한 확인됨
              </span>
            ) : (
              <span className="inline-flex items-center text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded text-sm">
                <ShieldX className="w-4 h-4 mr-1" /> 관리자 권한 없음
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 border rounded p-3">
            <div className="text-gray-500">내 계정</div>
            <div className="mt-1">
              <div><span className="font-mono text-xs">uid:</span> {myUid || '—'}</div>
              <div><span className="font-mono text-xs">email:</span> {myEmail}</div>
            </div>
          </div>
          <div className="bg-gray-50 border rounded p-3">
            <div className="text-gray-500">진단 정보</div>
            <div className="mt-1">
              <div>App 판정: <b>{String(!!isAdminOverride || !!probe?.isAdmin)}</b></div>
              {probe && (
                <>
                  <div>ctxAdmin: <b>{String(!!probe.ctxAdmin)}</b></div>
                  <div>fireAdmin: <b>{String(probe.fireAdmin)}</b></div>
                  {probe.err && <div className="text-red-600">err: {probe.err}</div>}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={setMyselfAdmin}
            disabled={!myUid || busy}
            className="text-sm bg-gray-100 hover:bg-gray-200 border px-3 py-2 rounded disabled:opacity-50"
            title="나에게 isAdmin: true를 다시 써서 잠금 해제 이슈를 복구할 때 사용"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> : <Check className="w-4 h-4 inline-block mr-1" />}
            나에게 관리자 권한 다시 설정
          </button>
        </div>
      </section>

      {/* UID로 문서 조회/수정 */}
      <section className="bg-white rounded-xl shadow p-5 border">
        <h3 className="text-base font-semibold mb-3">사용자 문서 관리 (users/&#123;uid&#125;)</h3>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="대상 UID 입력 (Firebase Authentication에서 복사)"
            className="flex-1 border rounded px-3 py-2"
            value={targetUid}
            onChange={(e) => setTargetUid(e.target.value)}
          />
          <button
            onClick={fetchUserDoc}
            disabled={!targetUid.trim() || busy}
            className="inline-flex items-center justify-center px-4 py-2 rounded bg-yellow-400 text-white hover:bg-yellow-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <SearchIcon className="w-4 h-4 mr-1" />}
            조회
          </button>
        </div>

        {msg && <div className="mt-3 text-sm text-green-700">{msg}</div>}
        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

        <div className="mt-4">
          {targetDoc ? (
            <div className="border rounded p-4 bg-gray-50">
              <div className="text-sm text-gray-500 mb-2">조회 결과</div>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <div><span className="font-mono text-xs">uid:</span> {targetUid}</div>
                <div><span className="font-mono text-xs">email:</span> {targetDoc.email ?? '—'}</div>
                <div>isAdmin: <b>{String(targetDoc.isAdmin === true || targetDoc.isAdmin === 'true')}</b></div>
                <div>updatedAt: {targetDoc.updatedAt ?? '—'}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => toggleAdmin(true)}
                  disabled={busy}
                  className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  관리자 승격
                </button>
                <button
                  onClick={() => toggleAdmin(false)}
                  disabled={busy}
                  className="px-3 py-2 rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  관리자 해제
                </button>
                <button
                  onClick={deleteUserDoc}
                  disabled={busy}
                  className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  문서 삭제
                </button>
              </div>
            </div>
          ) : (
            <div className="border rounded p-4 bg-gray-50">
              <div className="text-sm text-gray-600">문서가 없거나 아직 조회하지 않았습니다.</div>
              <div className="mt-2">
                <button
                  onClick={ensureDocExists}
                  disabled={!targetUid.trim() || busy}
                  className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  문서 생성 (기본 스키마)
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                * 문서 생성 후 관리자 승격 버튼으로 <code>isAdmin: true</code>를 설정하세요.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 안내 */}
      <section className="text-xs text-gray-500">
        <p className="mb-1">※ Firestore 보안 규칙에 따라, 다른 사용자 문서를 읽거나 쓰려면 관리자에게 허용된 조건이 필요합니다.</p>
        <p>※ 조회/승격이 막히면 rules에서 “관리자만 users/* 접근 허용” 조건을 추가해 주세요. (예: 로그인 사용자의 users/$(uid) 문서에 <code>isAdmin: true</code>면 허용)</p>
      </section>
    </div>
  );
}
