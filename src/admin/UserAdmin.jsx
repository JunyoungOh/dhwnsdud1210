import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Loader2, RefreshCw, Search as SearchIcon, ShieldCheck, ShieldAlert, Check, X } from "lucide-react";

/**
 * 관리자 화면 (권한은 App에서 주입한 isAdminOverride로만 판정)
 * - Firestore rules가 현재 "본인 문서만 읽기/쓰기"라면, 전체 사용자 리스트 조회는 permission-denied가 납니다.
 * - 그런 경우에도 화면이 죽지 않고, 친절한 가이드와 함께 동작합니다.
 *
 * ▷ 전체 사용자 관리(승인/관리자 토글)를 진짜로 쓰려면, rules에 아래 한 줄을 더해주세요:
 *
 * match /databases/{database}/documents {
 *   match /users/{uid} {
 *     allow read, update: if request.auth != null
 *       && (request.auth.uid == uid
 *           || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
 *     allow create: if request.auth != null && request.auth.uid == uid;
 *   }
 * }
 */

export default function UserAdmin({ isAdminOverride, probe }) {
  // ---- 권한 게이트 (App에서 내려준 값만 신뢰) ----
  const ok = isAdminOverride === true;

  // ---- Firebase 핸들 ----
  const db   = getFirestore();
  const auth = getAuth();

  // ---- 상태들 ----
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [rows, setRows] = useState([]);
  const [pageCursor, setPageCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const [qText, setQText] = useState("");        // 검색어 (email / displayName 부분일치)
  const [busyUid, setBusyUid] = useState("");    // 버튼 스피너용

  const myUid = auth?.currentUser?.uid || null;

  // ---- 목록 로더 ----
  const PAGE_SIZE = 50;

  const loadPage = useCallback(async (opts = { reset: false }) => {
    if (!ok) return; // 권한 없는 경우 시도하지 않음
    setLoading(true);
    setListError("");

    try {
      const base = collection(db, "users");

      // 검색 쿼리: email, displayName의 앞부분 일치 where는 정렬 제약이 있어 실전에서는 Algolia or Functions 권장
      // 여기선 permission/rules 영향 최소화를 위해 클라이언트 필터링(부분 일치) + 페이징 1~2번 정도만 권장.
      let q = query(base, orderBy("email"), limit(PAGE_SIZE));
      if (pageCursor && !opts.reset) {
        q = query(base, orderBy("email"), startAfter(pageCursor), limit(PAGE_SIZE));
      }

      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 클라 측 부분일치 필터링 (검색어가 있으면)
      const term = qText.trim().toLowerCase();
      if (term) {
        docs = docs.filter(d => {
          const email = (d.email || "").toLowerCase();
          const name  = (d.displayName || "").toLowerCase();
          return email.includes(term) || name.includes(term);
        });
      }

      if (opts.reset) {
        setRows(docs);
      } else {
        setRows(prev => [...prev, ...docs]);
      }

      const last = snap.docs[snap.docs.length - 1] || null;
      setPageCursor(last);
      setHasMore(!!last && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("load users failed:", e);
      setListError(e?.code ? `${e.code}: ${e.message}` : "사용자 목록을 불러오지 못했습니다.");
      // 권한 부족시에도 UI는 계속 살아있음
    } finally {
      setLoading(false);
    }
  }, [db, ok, pageCursor, qText]);

  // 최초 로드
  useEffect(() => {
    if (!ok) return;
    loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  // 검색 적용 후 재조회
  const applySearch = async () => {
    setPageCursor(null);
    await loadPage({ reset: true });
  };

  // ---- 토글 핸들러 ----
  const mutateUserField = async (uid, partial) => {
    if (!ok) return;
    setBusyUid(uid);
    try {
      await updateDoc(doc(db, "users", uid), partial);
      setRows(prev =>
        prev.map(r => (r.id === uid ? { ...r, ...partial } : r))
      );
    } catch (e) {
      console.error("update user failed:", e);
      alert(e?.message || "업데이트에 실패했습니다.");
    } finally {
      setBusyUid("");
    }
  };

  const toggleAdmin = async (uid, current) => {
    if (uid === myUid && current === true) {
      // 스스로 관리자 해제 보호막
      const yes = window.confirm("본인 관리자 권한을 해제하면 이 화면 접근이 막힐 수 있어요. 계속할까요?");
      if (!yes) return;
    }
    await mutateUserField(uid, { isAdmin: !current });
  };

  const toggleApproved = async (uid, current) => {
    await mutateUserField(uid, { approved: !current });
  };

  // ---- 표시용 도우미 ----
  const probeText = useMemo(() => JSON.stringify({
    isAdminOverride, probe: probe ?? null, me: myUid ?? null
  }, null, 2), [isAdminOverride, probe, myUid]);

  if (!ok) {
    return (
      <div className="p-6">
        <div className="text-red-600 font-semibold">권한이 없습니다. (UserAdmin)</div>
        <div className="text-xs bg-gray-100 border rounded p-2 font-mono whitespace-pre-wrap mt-3">
          DEBUG props → {probeText}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 상단 배너 & 디버그 */}
      <section className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-green-600" size={18} />
            <span className="font-semibold text-green-700">관리자 권한 확인됨</span>
          </div>
          <button
            className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded border bg-gray-50 hover:bg-gray-100"
            onClick={() => loadPage({ reset: true })}
            disabled={loading}
            title="새로고침"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            새로고침
          </button>
        </div>

        <div className="text-xs bg-gray-50 border rounded p-2 font-mono whitespace-pre-wrap mt-3">
          DEBUG props → {probeText}
        </div>

        {listError && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            <div className="font-semibold mb-1">사용자 목록을 가져오지 못했습니다.</div>
            <div className="mb-2">{listError}</div>
            <div className="text-xs text-gray-700">
              <div className="flex items-center gap-1"><ShieldAlert size={14} /> 클라이언트에서 전체 사용자 관리를 하려면 Firestore 규칙에 “관리자 허용”이 필요합니다.</div>
              <pre className="mt-2 bg-white border rounded p-2 overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, update: if request.auth != null &&
        (request.auth.uid == uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
      allow create: if request.auth != null && request.auth.uid == uid;
    }
  }
}`}
              </pre>
              <div className="mt-2">규칙 반영 후 다시 “새로고침”을 눌러보세요.</div>
            </div>
          </div>
        )}
      </section>

      {/* 검색바 */}
      <section className="bg-white border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <SearchIcon size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="email 또는 이름으로 필터"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={applySearch}
            className="px-3 py-2 rounded text-sm border bg-gray-50 hover:bg-gray-100"
          >
            적용
          </button>
        </div>
      </section>

      {/* 사용자 표 */}
      <section className="bg-white border rounded-xl p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">UID</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-center">Approved</th>
                <th className="px-3 py-2 text-center">Admin</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    표시할 사용자가 없습니다.
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{u.id}</td>
                  <td className="px-3 py-2">{u.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2">{u.displayName || <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        u.approved ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.approved ? <Check size={12} /> : <X size={12} />}
                      {u.approved ? "true" : "false"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        u.isAdmin ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.isAdmin ? "admin" : "user"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="px-2 py-1 text-xs rounded border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                        onClick={() => toggleApproved(u.id, !!u.approved)}
                        disabled={busyUid === u.id}
                        title="승인 토글"
                      >
                        {busyUid === u.id ? <Loader2 className="animate-spin" size={14} /> : "승인 토글"}
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                        onClick={() => toggleAdmin(u.id, !!u.isAdmin)}
                        disabled={busyUid === u.id}
                        title="관리자 토글"
                      >
                        {busyUid === u.id ? <Loader2 className="animate-spin" size={14} /> : "관리자 토글"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    <Loader2 className="inline animate-spin mr-1" /> 불러오는 중...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 페이징/더보기 */}
        <div className="p-3 border-t flex items-center justify-between">
          <div className="text-xs text-gray-500">
            총 {rows.length}명{qText ? " (검색 필터 적용)" : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded border bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-sm"
              onClick={() => loadPage({ reset: false })}
              disabled={loading || !hasMore}
            >
              더 불러오기
            </button>
          </div>
        </div>
      </section>

      {/* 도움말 */}
      <section className="text-xs text-gray-600">
        <div className="font-semibold mb-1">사용 팁</div>
        <ul className="list-disc ml-4 space-y-1">
          <li>검색 입력 후 “적용”을 누르면 현재 페이지부터 필터링합니다. (간단 부분일치)</li>
          <li>“승인 토글”은 <code>approved</code> 필드를, “관리자 토글”은 <code>isAdmin</code> 필드를 켜고 끕니다.</li>
          <li>규칙 변경 전에는 본인 문서 외의 업데이트가 실패할 수 있습니다. 실패 시 상단 경고를 참고하세요.</li>
        </ul>
      </section>
    </div>
  );
}
