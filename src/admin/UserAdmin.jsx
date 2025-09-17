// ./admin/UserAdmin.jsx
import React from 'react';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useUserCtx } from '../auth/AuthGate';
import {
  Shield, ShieldOff, Check, X, Trash2, Search as SearchIcon, Loader2, AlertCircle
} from 'lucide-react';

const db = getFirestore();
const auth = getAuth();

/**
 * 관리자 화면
 * - props.isAdminOverride: 상위(App)에서 이미 관리자 판단이 끝났다면 true로 전달해 UI 가드 우회
 */
export default function UserAdmin({ isAdminOverride = false }) {
  const ctx = useUserCtx?.();
  const isAdminFromCtx = !!(ctx?.isAdmin || ctx?.profile?.isAdmin);
  const isAdmin = isAdminOverride || isAdminFromCtx;

  // UI 가드 (App에서 이미 한 번 필터링하지만, 단독 진입 시를 대비해 한 번 더)
  if (!isAdmin) {
    return (
      <div className="p-4 bg-white rounded-xl border shadow-sm text-sm text-red-600 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        권한이 없습니다.
      </div>
    );
  }

  return <UserAdminInner />;
}

function UserAdminInner() {
  const me = auth.currentUser;
  const myUid = me?.uid || null;

  const [loading, setLoading] = React.useState(true);
  const [permErr, setPermErr] = React.useState(''); // permission-denied 등 표시
  const [users, setUsers] = React.useState([]);

  const [qText, setQText] = React.useState('');
  const filtered = React.useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) => {
      const bag = [
        u.displayName || '',
        u.email || '',
        u.uid || '',
        String(u.isAdmin || ''),
        String(u.isApproved || ''),
      ].join(' ').toLowerCase();
      return bag.includes(t);
    });
  }, [qText, users]);

  const stats = React.useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => u.isAdmin === true || u.isAdmin === 'true').length;
    const pending = users.filter(u => !u.isApproved).length;
    return { total, admins, pending };
  }, [users]);

  // 컬렉션 구독
  React.useEffect(() => {
    setLoading(true);
    setPermErr('');

    // 최신 가입 순으로 정렬(생성시간 필드가 없을 수 있어 isApproved/updatedAt 혼합 사용)
    const q = query(collection(db, 'users'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          uid: d.id,
          displayName: data.displayName || data.name || '',
          email: data.email || '',
          isAdmin: data.isAdmin === true || data.isAdmin === 'true',
          isApproved: !!data.isApproved,
          createdAt: data.createdAt ? toDateSafe(data.createdAt) : null,
          updatedAt: data.updatedAt ? toDateSafe(data.updatedAt) : null,
          lastLoginAt: data.lastLoginAt ? toDateSafe(data.lastLoginAt) : null,
        };
      });
      setUsers(arr);
      setLoading(false);
    }, (err) => {
      console.error('users onSnapshot error:', err);
      setUsers([]);
      setLoading(false);
      setPermErr(err?.code ? `${err.code}: ${err.message}` : '알 수 없는 오류로 사용자 목록을 불러오지 못했습니다.');
    });

    return () => unsub();
  }, []);

  // 액션들
  const approveUser = async (uid, value = true) => {
    const ref = doc(db, 'users', uid);
    await setDoc(ref, {
      isApproved: !!value,
      approvedAt: serverTimestamp(),
      approvedBy: myUid || null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const toggleAdmin = async (uid, value) => {
    const ref = doc(db, 'users', uid);
    await setDoc(ref, {
      isAdmin: !!value,
      adminChangedAt: serverTimestamp(),
      adminChangedBy: myUid || null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const removeUserDoc = async (uid) => {
    if (!window.confirm('정말 이 사용자 문서를 삭제하시겠습니까? 계정 자체는 삭제되지 않습니다.')) return;
    await deleteDoc(doc(db, 'users', uid));
  };

  return (
    <div className="space-y-6">
      {/* 헤더 / 설명 */}
      <div className="bg-white border rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800">사용자 관리</h2>
            <p className="text-sm text-gray-500 mt-1">
              가입 승인/권한 부여를 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <StatPill label="전체" value={stats.total} />
            <StatPill label="승인대기" value={stats.pending} tone="amber" />
            <StatPill label="관리자" value={stats.admins} tone="indigo" />
          </div>
        </div>

        {/* 권한/규칙 에러 배너 */}
        {permErr && (
          <div className="mt-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2">
            사용자 목록을 불러오는 중 오류가 발생했습니다: {permErr}
            <div className="mt-1 text-[11px] text-red-600">
              전체 사용자 목록을 보려면 보안규칙에서 관리자에게 <code>read</code> 권한을 부여해야 합니다.
            </div>
          </div>
        )}
      </div>

      {/* 검색 */}
      <div className="bg-white border rounded-xl p-3 shadow-sm">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="이름/이메일/UID/권한 검색…"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
          <div className="col-span-3">이름 / 이메일</div>
          <div className="col-span-3">UID</div>
          <div className="col-span-2">상태</div>
          <div className="col-span-2">최근</div>
          <div className="col-span-2 text-right">액션</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="animate-spin mr-2" /> 불러오는 중…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">표시할 사용자가 없습니다.</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((u) => (
              <li key={u.uid} className="px-4 py-3">
                <UserRow
                  meUid={myUid}
                  user={u}
                  onApprove={approveUser}
                  onToggleAdmin={toggleAdmin}
                  onDelete={removeUserDoc}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UserRow({ meUid, user, onApprove, onToggleAdmin, onDelete }) {
  const isMe = user.uid === meUid;

  const statusBadge = user.isApproved
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-green-100 text-green-800">승인</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800">대기</span>;

  const adminBadge = user.isAdmin
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-indigo-100 text-indigo-800">관리자</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">일반</span>;

  return (
    <div className="grid md:grid-cols-12 gap-2 md:gap-3 items-center">
      <div className="md:col-span-3">
        <div className="font-medium text-gray-800">{user.displayName || '—'}</div>
        <div className="text-xs text-gray-500">{user.email || '—'}</div>
      </div>

      <div className="md:col-span-3">
        <code className="text-[11px] bg-gray-50 px-2 py-1 rounded border">{user.uid}</code>
      </div>

      <div className="md:col-span-2 flex items-center gap-2">
        {statusBadge}
        {adminBadge}
      </div>

      <div className="md:col-span-2 text-xs text-gray-500">
        {formatHumanDate(user.updatedAt || user.lastLoginAt || user.createdAt)}
      </div>

      <div className="md:col-span-2">
        <div className="flex justify-end gap-1">
          {/* 승인 / 승인취소 */}
          {user.isApproved ? (
            <IconBtn
              title="승인 취소"
              onClick={() => onApprove(user.uid, false)}
              icon={<X className="w-4 h-4" />}
            />
          ) : (
            <IconBtn
              title="승인"
              onClick={() => onApprove(user.uid, true)}
              icon={<Check className="w-4 h-4" />}
              primary
            />
          )}

          {/* 관리자 토글 (본인 자기 권한은 내리기만 가능하게 막지 않음: 운영 정책에 따라 수정) */}
          {user.isAdmin ? (
            <IconBtn
              title={isMe ? '내 관리자 해제' : '관리자 해제'}
              onClick={() => onToggleAdmin(user.uid, false)}
              icon={<ShieldOff className="w-4 h-4" />}
            />
          ) : (
            <IconBtn
              title="관리자 지정"
              onClick={() => onToggleAdmin(user.uid, true)}
              icon={<Shield className="w-4 h-4" />}
            />
          )}

          {/* 삭제 (본인 문서 삭제는 비활성화) */}
          <IconBtn
            title="문서 삭제"
            onClick={() => onDelete(user.uid)}
            icon={<Trash2 className="w-4 h-4" />}
            disabled={isMe}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- UI helpers ---------- */

function IconBtn({ title, onClick, icon, primary = false, disabled = false }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs',
        primary
          ? 'bg-yellow-400 border-yellow-400 text-white hover:bg-yellow-500'
          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}

function StatPill({ label, value, tone = 'gray' }) {
  const tones = {
    gray:   'bg-gray-100 text-gray-800 border-gray-200',
    amber:  'bg-amber-100 text-amber-800 border-amber-200',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  };
  return (
    <div className={`px-2 py-1 rounded-full border text-[11px] ${tones[tone] || tones.gray}`}>
      {label}: <span className="font-semibold">{value}</span>
    </div>
  );
}

/* ---------- date helpers ---------- */

function toDateSafe(ts) {
  // 서버타임스탬프 or ISO string or millis → Date
  try {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') return new Date(ts);
    return null;
  } catch {
    return null;
  }
}

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

function formatHumanDate(d) {
  if (!d) return '—';
  try {
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return '—';
  }
}
