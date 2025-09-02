import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query, setLogLevel,
  updateDoc, writeBatch, getDoc, setDoc
} from 'firebase/firestore';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2, ShieldAlert, X, Save,
  UploadCloud, BellRing, Share2, RefreshCw, CalendarPlus, AlertCircle, Star, StarOff,
  LayoutGrid, FolderPlus, FolderMinus, Folder, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  LayoutList, Sparkles, LineChart, Menu, XCircle, Eye, ArrowLeft
} from 'lucide-react';

// ==============================
// Google API / Firebase env
// ==============================
const GOOGLE_API_KEY   = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const DISCOVERY_DOCS   = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES           = "https://www.googleapis.com/auth/calendar.events";

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId:     process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

const appId = 'profile-db-app-junyoungoh';

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

// 사이드바 메인 섹션
const MAIN = { ALERTS: 'alerts', SEARCH: 'search', SPOTLIGHT: 'spotlight', FUNCTIONS: 'functions', MANAGE: 'manage' };
// Functions 하위 섹션
const FN = { RECOMMEND: 'recommend', LONGTERM: 'longterm', GRAPHS: 'graphs' };

// ===============================
// 시간 파싱 & 포맷 유틸 (Asia/Seoul 기준)
// ===============================
const TZ = 'Asia/Seoul';
function formatRFC3339InTZ(date, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
function formatDateOnlyInTZ(date, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
// 다양한 표기 인식
function parseDateTimeFromRecord(recordText) {
  if (!recordText) return null;
  const text = typeof recordText === 'string' ? recordText : String(recordText || '');
  let best = null;
  const reA = /\((\d{2})\.(\d{2})\.(\d{2})\)\s*(?:(AM|PM|오전|오후)?\s*(\d{1,2})(?::(\d{2}))?(?:\s*시)?(?:\s*(\d{1,2})\s*분?)?)?/gi;
  let m;
  while ((m = reA.exec(text)) !== null) {
    const year  = 2000 + parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day   = parseInt(m[3], 10);
    let hadTime = false;
    let hour = 0, minute = 0;
    if (m[5] || m[6] || m[4]) {
      hadTime = true;
      hour   = m[5] ? parseInt(m[5], 10) : 0;
      minute = m[6] ? parseInt(m[6], 10) : (m[7] ? parseInt(m[7], 10) : 0);
      const ampm = m[4] ? m[4].toUpperCase() : '';
      if (ampm === 'PM' || ampm === '오후') { if (hour !== 12) hour += 12; }
      if (ampm === 'AM' || ampm === '오전') { if (hour === 12) hour = 0; }
    }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }
  const reB = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/g;
  while ((m = reB.exec(text)) !== null) {
    const year  = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day   = parseInt(m[3], 10);
    let hadTime = false;
    let hour = 0, minute = 0;
    if (m[4]) { hadTime = true; hour = parseInt(m[4], 10); minute = parseInt(m[5] || '0', 10); }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }
  return best ? best : null;
}

// ===============================
// 유사도 계산(간단 버전: 토큰 Jaccard + 보정)
// ===============================
function tokenizeProfile(p) {
  const base = [
    p.name || '', p.expertise || '', p.career || '', p.otherInfo || ''
  ].join(' ').toLowerCase();
  const words = base
    .replace(/[()\[\],./\\\-:~!@#$%^&*?'"`|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const extra = [];
  TARGET_KEYWORDS.forEach(k => { if ((p.career||'').includes(k)) extra.push(k); });
  if (p.priority) extra.push(`priority:${p.priority}`);
  if (p.age) {
    const band = p.age < 20 ? '10'
      : p.age < 30 ? '20'
      : p.age < 40 ? '30'
      : p.age < 50 ? '40' : '50+';
    extra.push(`age:${band}`);
  }
  return new Set([...words, ...extra]);
}
function jaccard(aSet, bSet) {
  const inter = new Set([...aSet].filter(x => bSet.has(x)));
  const uni   = new Set([...aSet, ...bSet]);
  return uni.size === 0 ? 0 : inter.size / uni.size;
}
function similarityScore(a, b) {
  const ta = tokenizeProfile(a);
  const tb = tokenizeProfile(b);
  let score = jaccard(ta, tb) * 100;
  if (a.priority && b.priority && a.priority === b.priority) score += 6;
  const ak = TARGET_KEYWORDS.filter(k => (a.career||'').includes(k));
  const bk = TARGET_KEYWORDS.filter(k => (b.career||'').includes(k));
  score += Math.min(ak.filter(k => bk.includes(k)).length * 6, 18);
  if (a.expertise && b.expertise && a.expertise === b.expertise) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ===============================
// 공유 보기
// ===============================
const ProfileDetailView = ({ profileId, accessCode }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', accessCode, profileId);
        const snap = await getDoc(ref);
        if (snap.exists()) setProfile({ ...snap.data(), id: snap.id });
        else setError('프로필을 찾을 수 없습니다.');
      } catch (e) {
        console.error('Error fetching profile:', e);
        setError('프로필을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, accessCode]);

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="animate-spin h-10 w-10 text-yellow-500" /></div>;
  if (error)   return <div className="flex justify-center items-center min-h-screen text-red-500">{error}</div>;
  if (!profile) return null;

  return (
    <div className="bg-gray-100 min-h-screen p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl p-8">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div className="flex items-baseline space-x-3">
            <h1 className="text-3xl font-bold text-yellow-600">{profile.name}</h1>
            <span className="text-xl text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
          </div>
        </div>
        {profile.expertise && <p className="text-lg font-semibold text-gray-700 mt-4">{profile.expertise}</p>}
        <div className="mt-6 space-y-4">
          <div>
            <h2 className="font-bold text-gray-500 text-sm uppercase tracking-wider">경력</h2>
            <p className="text-base text-gray-800 mt-1 whitespace-pre-wrap">{profile.career}</p>
          </div>
          {profile.otherInfo && (
            <div>
              <h2 className="font-bold text-gray-500 text-sm uppercase tracking-wider">기타 정보</h2>
              <p className="text-base text-gray-600 mt-1 whitespace-pre-wrap">{profile.otherInfo}</p>
            </div>
          )}
          {profile.meetingRecord && (
            <div>
              <h2 className="font-bold text-gray-500 text-sm uppercase tracking-wider">미팅 기록</h2>
              <p className="text-base text-gray-600 mt-1 whitespace-pre-wrap">{profile.meetingRecord}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===============================
// 로그인 화면
// ===============================
const LoginScreen = ({ onLogin, authStatus }) => {
  const [codeInput, setCodeInput] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); if (codeInput.trim()) onLogin(codeInput.trim()); };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <Users className="mx-auto text-yellow-400 w-12 h-12" />
          <h2 className="mt-4 text-2xl font-bold text-gray-800">프로필 대시보드 접속</h2>
          <p className="mt-2 text-sm text-gray-500">데이터를 불러올 접속 코드를 입력하세요.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input type="text" placeholder="Access Code" className="w-full pl-10 pr-3 py-3 border rounded-lg" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
          </div>
          <div>
            <button type="submit" disabled={authStatus !== 'authenticated'} className="w-full flex justify-center py-3 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
              {authStatus === 'authenticating' && <Loader2 className="animate-spin mr-2" />}
              {authStatus === 'authenticated' ? '데이터 불러오기' : '인증 중...'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ===============================
// 유사 프로필 모달 + 확대 보기
// ===============================
const SimilarModal = ({ open, onClose, baseProfile, items, onShowProfile, onUpdate, onDelete, accessCode, onSyncOne, onToggleStar }) => {
  const [expanded, setExpanded] = useState(null); // profile or null
  if (!open) return null;

  const TopBar = (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-bold text-gray-800">유사 프로필 — <span className="text-yellow-600">{baseProfile?.name}</span></h3>
      <button onClick={() => { setExpanded(null); onClose(); }} className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => { setExpanded(null); onClose(); }} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] p-6 overflow-hidden">
        {expanded ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button className="text-gray-600 hover:text-gray-900 flex items-center gap-1" onClick={() => setExpanded(null)}><ArrowLeft size={18}/> 뒤로</button>
            </div>
            <ProfileCard
              profile={expanded}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={() => {}}
              onToggleStar={onToggleStar}
              wide
            />
          </>
        ) : (
          <>
            {TopBar}
            <div className="text-sm text-gray-500 mb-3">유사도는 경력/전문영역/키워드/우선순위 등 텍스트 기반으로 계산돼요.</div>
            <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
              {items.length === 0 ? (
                <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map(({ profile, score }) => (
                    <button
                      key={profile.id}
                      className="border rounded-lg p-3 bg-white shadow-sm text-left hover:bg-gray-50"
                      onClick={() => setExpanded(profile)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-yellow-700">{profile.name}</div>
                        <div className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{score}%</div>
                      </div>
                      {profile.expertise && <div className="text-xs text-gray-600 mt-1">{profile.expertise}</div>}
                      <div className="text-xs text-gray-700 mt-2 whitespace-pre-wrap line-clamp-5">{profile.career}</div>
                      {profile.otherInfo && <div className="text-[11px] text-gray-500 mt-2 whitespace-pre-wrap line-clamp-4">{profile.otherInfo}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ===============================
// 확인 모달 (삭제 등)
// ===============================
const ConfirmationModal = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
      <div className="text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">확인</h3>
        <div className="mt-2 text-sm text-gray-500"><p>{message}</p></div>
      </div>
      <div className="mt-6 flex justify-center gap-4">
        <button onClick={onCancel} className="px-6 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300">취소</button>
        <button onClick={onConfirm} className="px-6 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">확인</button>
      </div>
    </div>
  </div>
);

// ===============================
// 폴더 선택 모달 (주목 중 추가 시)
// ===============================
const FolderPickerModal = ({ open, onClose, folders, onSave }) => {
  const [selected, setSelected] = useState(new Set(['전체']));
  useEffect(() => {
    if (open) setSelected(new Set(['전체']));
  }, [open]);
  if (!open) return null;
  const toggle = (name) => {
    const n = new Set(selected);
    if (n.has(name)) n.delete(name); else n.add(name);
    if (n.size === 0) n.add('전체');
    setSelected(n);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold mb-3">폴더 선택</h3>
        <div className="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-2">
          {folders.map(name => (
            <button
              key={name}
              className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${selected.has(name) ? 'bg-yellow-50 border-yellow-400' : 'bg-white'}`}
              onClick={() => toggle(name)}
            >
              <Folder size={16} className="text-yellow-600"/>{name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200" onClick={onClose}>취소</button>
          <button className="px-3 py-2 text-sm rounded-md bg-yellow-500 text-white hover:bg-yellow-600" onClick={() => onSave(Array.from(selected))}>저장</button>
        </div>
      </div>
    </div>
  );
};

// ===============================
// 프로필 카드 (가로 와이드, 버튼 우상단 콤팩트)
// ===============================
const ProfileCard = ({
  profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm,
  accessCode, onSyncOne, onShowSimilar, onToggleStar, wide
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setEditedProfile(profile); }, [profile]);

  const priorityBadge = profile.priority ? (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
      profile.priority==='3'?'bg-red-100 text-red-800':
      profile.priority==='2'?'bg-yellow-100 text-yellow-800':
      profile.priority==='1'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'
    }`}>
      {profile.priority}
    </span>
  ) : null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
  };

  const handleSave = async () => {
    const parsed = parseDateTimeFromRecord(editedProfile.meetingRecord);
    const eventDate = parsed ? new Date(parsed.date).toISOString() : null;
    try {
      await onUpdate(profile.id, { ...editedProfile, eventDate });
      setIsEditing(false);
    } catch (e) {
      console.error('프로필 저장 실패:', e);
      alert('프로필 저장 중 오류가 발생했습니다.');
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => alert('공유 링크가 클립보드에 복사되었습니다.'),
      () => alert('링크 복사에 실패했습니다.')
    );
  };

  const handleSyncClick = async () => {
    if (!onSyncOne) return;
    setSyncing(true);
    try { await onSyncOne(profile); } finally { setSyncing(false); }
  };

  const handleStarClick = async () => {
    if (profile.starred) {
      if (!window.confirm('모아보기에서 제외하시겠습니까?')) return;
      await onToggleStar(profile.id, false, []);
    } else {
      // 상위에서 폴더 선택 모달 띄워 처리 (여기서는 noop)
      await onToggleStar(profile.id, true, null);
    }
  };

  // 편집 모드
  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow border relative space-y-3">
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={() => setIsEditing(false)} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
          <button onClick={handleSave} className="p-1 rounded hover:bg-gray-100 text-green-700"><Save size={16} /></button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <input name="name" value={editedProfile.name} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
          <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea name="career" value={editedProfile.career} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-24" />
        <div className="grid grid-cols-3 gap-2">
          <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
          <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
          <input disabled value={profile.gcalEventId ? '캘린더 연동됨' : '캘린더 미연동'} className="w-full p-2 border rounded text-xs text-gray-500 bg-gray-50"/>
        </div>
        <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
        <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" className="w-full p-2 border rounded text-sm h-20" />
      </div>
    );
  }

  // 보기 모드 (와이드)
  return (
    <div className={`bg-white rounded-lg shadow border p-4 ${wide ? '' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-yellow-600 text-lg">{profile.name}</h3>
            <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
            {priorityBadge}
          </div>
          {profile.expertise && <p className="text-sm font-semibold text-gray-600 mt-1">{profile.expertise}</p>}
          <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>
          {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
          {profile.meetingRecord && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs font-semibold text-gray-500">미팅기록:</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{profile.meetingRecord}</p>
            </div>
          )}
          {isAlarmCard && (
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => onConfirmAlarm(profile.id)} className="text-xs bg-gray-200 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-300">확인</button>
              <button onClick={() => onSnooze(profile.id)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">3개월 후 다시 알림</button>
            </div>
          )}
        </div>

        {/* 우상단 액션 미니 버튼 묶음 */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1">
            <button onClick={() => onShowSimilar?.(profile)} className="p-1 rounded hover:bg-gray-100" title="유사 프로필"><Eye size={16} /></button>
            <button onClick={() => setIsEditing(true)} className="p-1 rounded hover:bg-gray-100" title="수정"><Edit size={16} /></button>
            <button onClick={() => onDelete(profile.id, profile.name)} className="p-1 rounded hover:bg-gray-100 text-red-600" title="삭제"><Trash2 size={16} /></button>
            <button onClick={handleShare} className="p-1 rounded hover:bg-gray-100" title="공유 링크 복사"><Share2 size={16} /></button>
          </div>
          <div className="flex items-center gap-2">
            {profile.gcalEventId ? (
              <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                Google Calendar
              </a>
            ) : <span className="text-[11px] text-gray-400">캘린더 미연동</span>}
            <button onClick={handleSyncClick} disabled={syncing} className="text-xs bg-blue-500 text-white font-semibold px-2 py-1 rounded hover:bg-blue-600 disabled:bg-blue-300 flex items-center" title="캘린더 동기화">
              {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CalendarPlus className="w-3 h-3 mr-1" />}
              {profile.gcalEventId ? '수정' : '등록'}
            </button>
            <button
              onClick={handleStarClick}
              className={`text-xs font-semibold px-2 py-1 rounded ${profile.starred ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              title={profile.starred ? '주목중' : '모아보기'}
            >
              {profile.starred ? '주목중' : '모아보기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===============================
// 필터 결과 섹션 (각 그래프 아래에 뜸)
// ===============================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in mt-4">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile, index) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${index * 50}ms` }}>
            <ProfileCard
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onToggleStar={onToggleStar}
              wide
            />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

// ===============================
// Functions > 그래프&필터 뷰
// ===============================
const GraphsView = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  // Hook은 무조건 컴포넌트 최상단에서
  const [activeFilter, setActiveFilter] = useState({ type: null, value: null });

  const ageData = useMemo(() => {
    const groups = { '10대': 0, '20대': 0, '30대': 0, '40대': 0, '50대 이상': 0 };
    profiles.forEach(({ age }) => {
      if (!age) return;
      if (age < 20) groups['10대']++;
      else if (age < 30) groups['20대']++;
      else if (age < 40) groups['30대']++;
      else if (age < 50) groups['40대']++;
      else groups['50대 이상']++;
    });
    return Object.entries(groups).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [profiles]);

  const priorityData = useMemo(() => {
    const p = { '3 (상)': 0, '2 (중)': 0, '1 (하)': 0 };
    profiles.forEach(x => { if (x.priority === '3') p['3 (상)']++; else if (x.priority === '2') p['2 (중)']++; else if (x.priority === '1') p['1 (하)']++; });
    return Object.entries(p).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [profiles]);

  const companyData = useMemo(() => TARGET_KEYWORDS.map(k => ({ name: k, count: profiles.filter(p => p.career?.includes(k)).length })), [profiles]);

  const expertiseData = useMemo(() => {
    const c = {}; profiles.forEach(p => { if (p.expertise) c[p.expertise] = (c[p.expertise] || 0) + 1; });
    return Object.entries(c).map(([name, count]) => ({ name, count }));
  }, [profiles]);

  const handlePieClick = (type, data) => { if (!data || (data.value ?? data.count) === 0) return; setActiveFilter({ type, value: data.name }); };
  const handleBarClick = (type, data) => { const count = data.count || data.value; if (count === 0) return; setActiveFilter({ type, value: data.name }); };

  const filteredProfiles = useMemo(() => {
    if (!activeFilter.type) return [];
    switch (activeFilter.type) {
      case 'age': {
        const g = activeFilter.value;
        return profiles.filter(p => p.age && (
          (g==='10대' && p.age<20) ||
          (g==='20대' && p.age>=20 && p.age<30) ||
          (g==='30대' && p.age>=30 && p.age<40) ||
          (g==='40대' && p.age>=40 && p.age<50) ||
          (g==='50대 이상' && p.age>=50)
        ));
      }
      case 'priority': {
        const v = activeFilter.value.split(' ')[0]; return profiles.filter(p => p.priority === v);
      }
      case 'company': return profiles.filter(p => p.career?.includes(activeFilter.value));
      case 'expertise': return profiles.filter(p => p.expertise === activeFilter.value);
      default: return [];
    }
  }, [profiles, activeFilter]);

  return (
    <div className="space-y-8">
      {/* 우선순위 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">우선순위별 분포</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              <radialGradient id="gp-0"><stop offset="0%" stopColor="#FF4444" stopOpacity={0.7} /><stop offset="100%" stopColor="#FF4444" stopOpacity={1} /></radialGradient>
              <radialGradient id="gp-1"><stop offset="0%" stopColor="#FFBB28" stopOpacity={0.7} /><stop offset="100%" stopColor="#FFBB28" stopOpacity={1} /></radialGradient>
              <radialGradient id="gp-2"><stop offset="0%" stopColor="#00C49F" stopOpacity={0.7} /><stop offset="100%" stopColor="#00C49F" stopOpacity={1} /></radialGradient>
            </defs>
            <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
              {priorityData.map((entry, i) => (
                <Cell key={`cell-pr-${i}`} fill={`url(#gp-${i})`} stroke="#fff" onClick={() => handlePieClick('priority', entry)} style={{ cursor: 'pointer' }} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${v}명`} /><Legend />
          </PieChart>
        </ResponsiveContainer>
        {activeFilter.type === 'priority' && (
          <FilterResultSection
            title={`"${activeFilter.value}" 필터 결과`}
            profiles={profiles.filter(p => p.priority === activeFilter.value.split(' ')[0])}
            onUpdate={onUpdate} onDelete={onDelete}
            onClear={() => setActiveFilter({ type: null, value: null })}
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
          />
        )}
      </section>

      {/* 세대 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              {COLORS.map((c, i) => (
                <radialGradient key={`g-age-${i}`} id={`g-age-${i}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                  <stop offset="0%" stopColor={c} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={c} stopOpacity={1} />
                </radialGradient>
              ))}
            </defs>
            <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
              {ageData.map((entry, i) => (
                <Cell key={`cell-age-${i}`} fill={`url(#g-age-${i})`} stroke="#fff" onClick={() => handlePieClick('age', entry)} style={{ cursor: 'pointer' }} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${v}명`} /><Legend />
          </PieChart>
        </ResponsiveContainer>
        {activeFilter.type === 'age' && (
          <FilterResultSection
            title={`"${activeFilter.value}" 필터 결과`}
            profiles={filteredProfiles}
            onUpdate={onUpdate} onDelete={onDelete}
            onClear={() => setActiveFilter({ type: null, value: null })}
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
          />
        )}
      </section>

      {/* 전문영역 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={useMemo(()=>{const c={}; profiles.forEach(p=>{if(p.expertise) c[p.expertise]=(c[p.expertise]||0)+1;}); return Object.entries(c).map(([name,count])=>({name,count}));},[profiles])} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/>
            <Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-expertise)">
              {useMemo(()=>{const c={}; profiles.forEach(p=>{if(p.expertise) c[p.expertise]=(c[p.expertise]||0)+1;}); return Object.entries(c).map(([name,count])=>({name,count}));},[profiles]).map((entry, i) => (
                <Cell key={`ex-${i}`} onClick={() => handleBarClick('expertise', entry)} style={{ cursor: 'pointer' }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {activeFilter.type === 'expertise' && (
          <FilterResultSection
            title={`"${activeFilter.value}" 전문영역 필터 결과`}
            profiles={profiles.filter(p => p.expertise === activeFilter.value)}
            onUpdate={onUpdate} onDelete={onDelete}
            onClear={() => setActiveFilter({ type: null, value: null })}
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
          />
        )}
      </section>

      {/* IT 기업 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={TARGET_KEYWORDS.map(k=>({name:k, count: profiles.filter(p=>p.career?.includes(k)).length}))} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8}/><stop offset="95%" stopColor="#FF8042" stopOpacity={1}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/>
            <Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-company)">
              {TARGET_KEYWORDS.map((_, i) => (
                <Cell key={`co-${i}`} onClick={(_, idx) => { const entry = TARGET_KEYWORDS.map(k=>({name:k, count: profiles.filter(p=>p.career?.includes(k)).length}))[i]; handleBarClick('company', entry); }} style={{ cursor: 'pointer' }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {activeFilter.type === 'company' && (
          <FilterResultSection
            title={`"${activeFilter.value}" 필터 결과`}
            profiles={profiles.filter(p => p.career?.includes(activeFilter.value))}
            onUpdate={onUpdate} onDelete={onDelete}
            onClear={() => setActiveFilter({ type: null, value: null })}
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
          />
        )}
      </section>
    </div>
  );
};

// ===============================
// 알림 탭(오늘/다가오는/추천/장기관리)
// ===============================
const AlertsViewBlocks = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, showRecommend, showLongterm }) => {
  const {
    todayProfiles, upcomingProfiles, longTermNoContactProfiles, recommendedProfiles
  } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const threeDaysLater = new Date(todayStart); threeDaysLater.setDate(threeDaysLater.getDate() + 4);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const today = [], upcoming = [], longTerm = [];
    profiles.forEach(p => {
      if (p.eventDate) {
        const eventDate = new Date(p.eventDate);
        if (eventDate >= todayStart && eventDate < tomorrowStart) today.push(p);
        else if (eventDate > now && eventDate < threeDaysLater) upcoming.push(p);
      }
      const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil  = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (lastContact && lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) {
        longTerm.push(p);
      }
    });

    const scoreOf = (p) => {
      const now = new Date();
      const last = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const days = last ? Math.max(1, Math.floor((now - last) / (1000*60*60*24))) : 180;
      let score = Math.min(100, Math.round((days / 90) * 60));
      if (p.priority === '3') score += 20;
      const kw = TARGET_KEYWORDS.filter(k => (p.career||'').includes(k)).length;
      score += Math.min(kw * 5, 15);
      if (p.expertise) score += 5;
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (snoozeUntil && snoozeUntil > now) score = -1;
      return score;
    };
    const rec = profiles
      .map(p => ({ p, s: scoreOf(p) }))
      .filter(x => x.s >= 0 && x.s >= 40)
      .sort((a,b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.p);

    return {
      todayProfiles: today.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      upcomingProfiles: upcoming.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      longTermNoContactProfiles: longTerm.sort((a,b) => (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0))),
      recommendedProfiles: rec
    };
  }, [profiles]);

  const handleSnooze = async (profileId) => {
    const snoozeDate = new Date(); snoozeDate.setMonth(snoozeDate.getMonth() + 3);
    await onUpdate(profileId, { snoozeUntil: snoozeDate.toISOString() });
  };
  const handleConfirmAlarm = async (profileId) => onUpdate(profileId, { lastReviewedDate: new Date().toISOString() });

  return (
    <div className="space-y-8">
      {/* 오늘의 일정 */}
      {todayProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {todayProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} wide />
            ))}
          </div>
        </section>
      )}

      {/* 다가오는 일정 */}
      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} wide />
            ))}
          </div>
        </section>
      )}

      {/* 추천 */}
      {showRecommend && (
        <section className="bg-white rounded-xl shadow-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800">추천 : 다시 들여다볼 프로필</h2>
              <div className="relative group">
                <AlertCircle className="w-4 h-4 text-yellow-600 cursor-default" />
                <div className="absolute z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-md px-3 py-2 w-72 -left-2 mt-2 shadow-lg">
                  최근 팔로업 시점/스누즈/우선순위/IT 키워드 등을 반영해 점수를 계산해요.
                  <br/>‘확인’을 누르면 목록에서 제외되고, 보통 3개월 후 조건 충족 시 다시 나타납니다.
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500">카드 오른쪽 상단 버튼으로 액션</div>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recommendedProfiles.length === 0 ? (
              <div className="text-gray-500 p-4 text-sm">없음</div>
            ) : recommendedProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} isAlarmCard onSnooze={handleSnooze} onConfirmAlarm={handleConfirmAlarm} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} wide />
            ))}
          </div>
        </section>
      )}

      {/* 장기 미접촉 */}
      {showLongterm && (
        <section className="bg-white rounded-xl shadow-md p-4">
          <h2 className="text-xl font-bold flex items-center"><BellRing className="mr-2 text-orange-500" />장기 미접촉 알림 (3개월 이상)</h2>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {longTermNoContactProfiles.length === 0 ? (
              <div className="text-gray-500 p-4 text-sm">없음</div>
            ) : longTermNoContactProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} isAlarmCard onSnooze={(id)=>onUpdate(id,{snoozeUntil:new Date(new Date().setMonth(new Date().getMonth()+3)).toISOString()})} onConfirmAlarm={(id)=>onUpdate(id,{lastReviewedDate:new Date().toISOString()})} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} wide />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ===============================
// 프로필 관리(검색/추가/엑셀/페이지네이션)
// ===============================
const ManageTab = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PROFILES_PER_PAGE = 10;

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim(); if (!term) return [];
    const orConditions = term.split(/\s+or\s+/i);
    return profiles.filter(p => orConditions.some(cond => {
      const andKeywords = cond.split(/\s+and\s+/i).filter(Boolean);
      return andKeywords.every(keyword => {
        const map = { '이름':'name','경력':'career','나이':'age','전문영역':'expertise','기타':'otherInfo','우선순위':'priority' };
        const f = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
        if (f) { const field = map[f[1]]; const val = f[2].toLowerCase(); const v = p[field] ? String(p[field]).toLowerCase() : ''; return v.includes(val); }
        const ageG = keyword.match(/^(\d{1,2})대$/);
        if (ageG) { const d = parseInt(ageG[1],10); if (d>=10) { const min=d, max=d+9; return p.age && p.age>=min && p.age<=max; } }
        const txt = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
        return txt.includes(keyword.toLowerCase());
      });
    }));
  }, [searchTerm, profiles]);

  const { currentProfiles, totalPages } = useMemo(() => {
    const sorted = [...profiles].sort((a,b) => a.name.localeCompare(b.name));
    const end = currentPage * PROFILES_PER_PAGE, start = end - PROFILES_PER_PAGE;
    return { currentProfiles: sorted.slice(start,end), totalPages: Math.ceil(sorted.length / PROFILES_PER_PAGE) };
  }, [currentPage, profiles]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  return (
    <>
      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div>
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} wide />
              )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500"/>새 프로필 추가</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" />
            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
          <div className="flex justify-end">
            <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">추가하기</button>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {currentProfiles.map(profile => (
            <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} wide />
          ))}
        </div>
        {totalPages > 1 && (
          <Pagination totalPages={totalPages} currentPage={currentPage} setCurrentPage={setCurrentPage} />
        )}
      </section>
    </>
  );
};

const Pagination = ({ totalPages, currentPage, setCurrentPage }) => {
  const pages = Array.from({length: totalPages}, (_,i)=>i+1);
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-8 flex justify-center items-center gap-1">
      <button onClick={() => setCurrentPage(1)} className="p-2 rounded hover:bg-gray-100"><ChevronsLeft size={16}/></button>
      <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} className="p-2 rounded hover:bg-gray-100"><ChevronLeft size={16}/></button>
      <ul className="inline-flex items-center -space-x-px">
        {pages.map(n => (
          <li key={n}>
            <button onClick={() => setCurrentPage(n)} className={`py-2 px-3 leading-tight border border-gray-300 ${currentPage===n?'bg-yellow-400 text-white border-yellow-400':'bg-white text-gray-600 hover:bg-gray-100'}`}>{n}</button>
          </li>
        ))}
      </ul>
      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} className="p-2 rounded hover:bg-gray-100"><ChevronRight size={16}/></button>
      <button onClick={() => setCurrentPage(totalPages)} className="p-2 rounded hover:bg-gray-100"><ChevronsRight size={16}/></button>
    </nav>
  );
};

const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e) => { setFile(e.target.files[0]); setMessage(''); };

  const handleUpload = async () => {
    if (!file) { setMessage('파일을 먼저 선택해주세요.'); return; }
    setIsUploading(true); setMessage('파일을 읽는 중...');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (json.length < 2) { setMessage('엑셀 파일에 데이터가 없습니다 (2행부터 읽습니다).'); setIsUploading(false); return; }
        const newProfiles = json.slice(1).map(row => ({
          name: row[2] || '', career: row[3] || '', age: row[5] ? Number(row[5]) : null,
          expertise: row[7] || '', priority: row[9] ? String(row[9]) : '',
          meetingRecord: row[11] || '', otherInfo: row[13] || '',
          eventDate: (()=>{const p=parseDateTimeFromRecord(row[11]||''); return p? p.date.toISOString():null;})(),
          starred: false, starredFolders: []
        })).filter(p => p.name && p.career);
        const msg = await onBulkAdd(newProfiles);
        setMessage(msg); setFile(null);
      } catch (err) {
        console.error('엑셀 처리 오류:', err); setMessage('엑셀 파일을 처리하는 중 오류가 발생했습니다.');
      } finally { setIsUploading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center"><UploadCloud className="mr-2 text-yellow-500"/>엑셀로 일괄 등록</h2>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">정해진 양식의 엑셀 파일을 업로드하여 여러 프로필을 한 번에 추가할 수 있습니다.</p>
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내:</p>
          <p>2행부터 각 행을 한 프로필로 읽습니다.</p>
          <p>각 열의 C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보 로 입력됩니다.</p>
          <p className="font-bold mt-1">※ 기존 프로필과 이름이 겹칠 경우, 덮어쓰기됩니다.</p>
        </div>
        <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
        <button onClick={handleUpload} disabled={!file || isUploading} className="w-full flex justify-center items-center py-2 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
          {isUploading ? <Loader2 className="animate-spin" /> : '업로드 및 추가'}
        </button>
        {message && <p className="text-sm text-center text-gray-600">{message}</p>}
      </div>
    </section>
  );
};

// ===============================
// App
// ===============================
export default function App() {
  // 전역 상태/세팅 Hook — 조기 return보다 위
  const [accessCode, setAccessCode] = useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [profiles, setProfiles]     = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');

  // UI: 레이아웃/사이드바
  const [sidebarOpen, setSidebarOpen] = useState(false); // 모바일 토글
  const [activeMain, setActiveMain]   = useState(MAIN.ALERTS);
  const [activeFn, setActiveFn]       = useState(FN.RECOMMEND);
  const [functionsOpen, setFunctionsOpen] = useState(true); // 사이드바 하위 카테고리 확장

  // Similar modal
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarBase, setSimilarBase] = useState(null);
  const [similarList, setSimilarList] = useState([]);

  // Google API 상태
  const [gapiClient, setGapiClient]   = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleApiReady, setGoogleApiReady]     = useState(null);
  const [googleError, setGoogleError]           = useState('');

  // 신규 입력 폼 상태
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  // Spotlight folders meta
  const [folders, setFolders] = useState(['전체']);
  const [folderPickerFor, setFolderPickerFor] = useState(null); // profile to assign folders

  // 삭제 확인
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  // 공유 URL 파라미터
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  // 상단 카운트 (Hook은 항상 위)
  const totalCount = profiles.length;
  const meetingCount = useMemo(() => profiles.filter(p => !!p.eventDate).length, [profiles]);

  // 외부 스크립트 로드 (gapi + gis + sheetjs)
  useEffect(() => {
    const xlsx = document.createElement('script');
    xlsx.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
    xlsx.async = true; document.body.appendChild(xlsx);

    const gapiScript = document.createElement('script');
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.async = true; gapiScript.defer = true; document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.async = true; gisScript.defer = true; document.body.appendChild(gisScript);

    Promise.all([
      new Promise(res => gapiScript.onload = res),
      new Promise(res => gisScript.onload = res),
    ]).then(() => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
          setGapiClient(window.gapi);
          const tc = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (resp) => {
              if (resp && resp.access_token) {
                window.gapi.client.setToken({ access_token: resp.access_token });
                setIsGoogleSignedIn(true);
              }
            },
          });
          setTokenClient(tc);
          setGoogleApiReady(true);
        } catch (err) {
          console.error("Error initializing Google API client", err);
          setGoogleError(err?.error || err?.details || 'Google API 초기화 실패');
          setGoogleApiReady(false);
        }
      });
    });

    return () => {
      [xlsx, gapiScript, gisScript].forEach(s => { if (s && document.body.contains(s)) document.body.removeChild(s); });
    };
  }, []);

  // Firebase 익명 로그인
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) setAuthStatus('authenticated');
      else {
        try { await signInAnonymously(auth); setAuthStatus('authenticated'); }
        catch (e) { console.error("Firebase 익명 로그인 오류:", e); setAuthStatus('error'); }
      }
    });
    return () => unsub();
  }, []);

  const profilesCollectionRef = useMemo(() => {
    if (!accessCode) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  // 메타 문서 참조 (짝수 세그먼트, 예약어 미사용)
  const metaDocRef = useMemo(() => {
    if (!accessCode) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', accessCode, '_meta_');
  }, [accessCode]);

  // 프로필 실시간 구독
  useEffect(() => {
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const q = query(profilesCollectionRef);
    const unsub = onSnapshot(q, (qs) => {
      const data = qs.docs.map(d => ({ ...d.data(), id: d.id, starredFolders: d.data().starredFolders || [] }));
      setProfiles(data);
    });
    return () => unsub();
  }, [profilesCollectionRef]);

  // 메타(폴더) 로드
  useEffect(() => {
    (async () => {
      if (!metaDocRef) return;
      try {
        const snap = await getDoc(metaDocRef);
        if (snap.exists()) {
          const m = snap.data();
          const list = Array.isArray(m.starredFolders) ? m.starredFolders : [];
          const unique = Array.from(new Set(['전체', ...list]));
          setFolders(unique);
        } else {
          await setDoc(metaDocRef, { starredFolders: ['전체'] }, { merge: true });
          setFolders(['전체']);
        }
      } catch (e) {
        console.warn('meta doc load error', e?.message || e);
      }
    })();
  }, [metaDocRef]);

  const handleLogin = (code) => {
    setAccessCode(code);
    if (typeof window !== 'undefined') localStorage.setItem('profileDbAccessCode', code);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
    const parsed = parseDateTimeFromRecord(newMeetingRecord);
    const eventDate = parsed ? parsed.date.toISOString() : null;
    const profileData = {
      name: newName, career: newCareer, age: newAge ? Number(newAge) : null, otherInfo: newOtherInfo, eventDate,
      expertise: newExpertise || null, priority: newPriority || null, meetingRecord: newMeetingRecord || null,
      starred: false, starredFolders: []
    };
    try {
      await addDoc(profilesCollectionRef, profileData);
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewEventDate(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    } catch (err) { console.error("프로필 저장 오류: ", err); }
  };

  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const map = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updated=0, added=0;
    newProfiles.forEach(p => {
      const existingId = map.get(p.name);
      const payload = { starred: !!p.starred, starredFolders: Array.isArray(p.starredFolders) ? p.starredFolders : [], ...p };
      if (existingId) { batch.set(doc(profilesCollectionRef, existingId), payload); updated++; }
      else { batch.set(doc(profilesCollectionRef), payload); added++; }
    });
    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const handleUpdate = async (profileId, updatedData) => {
    const { id, ...dataToUpdate } = updatedData;
    await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
  };

  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId && profilesCollectionRef) await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  // Google Calendar 동기화 (비공개)
  const ensureGoogleAuth = () => {
    return new Promise((resolve, reject) => {
      const token = gapiClient?.client?.getToken?.();
      if (token?.access_token) { setIsGoogleSignedIn(true); resolve(true); return; }
      if (!tokenClient) { reject(new Error('Google API 초기화 전입니다. 잠시 후 다시 시도해주세요.')); return; }
      tokenClient.callback = (resp) => {
        if (resp && resp.access_token) {
          gapiClient.client.setToken({ access_token: resp.access_token });
          setIsGoogleSignedIn(true);
          resolve(true);
        } else {
          reject(new Error('Google 토큰을 발급받지 못했습니다.'));
        }
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  };
  const handleSyncOneToCalendar = async (profile) => {
    if (!googleApiReady) { alert('Google API가 준비되지 않았습니다.'); return; }
    try { await ensureGoogleAuth(); }
    catch (e) { alert(e.message || 'Google 인증에 실패했습니다.'); return; }

    let parsed = parseDateTimeFromRecord(profile.meetingRecord);
    if (!parsed && profile.eventDate) {
      parsed = { date: new Date(profile.eventDate), hadTime: true };
    }
    if (!parsed) { alert('미팅 날짜/시간을 인식할 수 없습니다. "미팅기록"에 날짜를 입력해주세요.'); return; }

    const startDate = parsed.date;
    let eventResource;
    if (parsed.hadTime) {
      const startLocal = formatRFC3339InTZ(startDate, TZ);
      const endDate = new Date(startDate.getTime() + 90 * 60000);
      const endLocal = formatRFC3339InTZ(endDate, TZ);
      eventResource = {
        summary: `(영입) ${profile.name}님 미팅`,
        description: `${profile.name}님 프로필 보기:\n${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`,
        start: { dateTime: startLocal, timeZone: TZ },
        end:   { dateTime: endLocal,   timeZone: TZ },
        visibility: 'private',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      };
      const ten = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 10, 0, 0);
      if (startDate > ten) {
        const minutesBefore = Math.round((startDate.getTime() - ten.getTime()) / 60000);
        eventResource.reminders.overrides.push({ method: 'popup', minutes: minutesBefore });
      }
    } else {
      const dateStr = formatDateOnlyInTZ(startDate, TZ);
      const end = new Date(startDate); end.setDate(end.getDate() + 1);
      const endStr = formatDateOnlyInTZ(end, TZ);
      eventResource = {
        summary: `(영입) ${profile.name}님 미팅`,
        description: `${profile.name}님 프로필 보기:\n${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`,
        start: { date: dateStr },
        end:   { date: endStr  },
        visibility: 'private'
      };
    }

    try {
      let result;
      if (profile.gcalEventId) {
        result = await gapiClient.client.calendar.events.patch({ calendarId: 'primary', eventId: profile.gcalEventId, resource: eventResource });
      } else {
        result = await gapiClient.client.calendar.events.insert({ calendarId: 'primary', resource: eventResource });
      }
      const ev = result.result || {};
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', accessCode, profile.id), {
        gcalEventId: ev.id || profile.gcalEventId || null,
        gcalHtmlLink: ev.htmlLink || profile.gcalHtmlLink || null,
        gcalLastSyncAt: new Date().toISOString(),
      });
      alert(profile.gcalEventId ? '캘린더 일정이 수정되었습니다.' : '캘린더 일정이 등록되었습니다.');
    } catch (e) {
      console.error('Google Calendar 동기화 실패:', e);
      alert('캘린더 동기화에 실패했습니다. 콘솔 오류를 확인해주세요.');
    }
  };

  // 주목중 토글(+폴더 선택)
  const handleToggleStar = async (profileId, flag, foldersSelected) => {
    if (!profilesCollectionRef) return;
    if (flag && foldersSelected === null) {
      // 폴더 선택 모달 오픈
      const p = profiles.find(x => x.id === profileId);
      setFolderPickerFor(p || { id: profileId });
      return;
    }
    const payload = { starred: !!flag, starredFolders: Array.isArray(foldersSelected) ? foldersSelected : [] };
    await updateDoc(doc(profilesCollectionRef, profileId), payload);
  };
  const handleSaveFoldersForProfile = async (selectedNames) => {
    if (!folderPickerFor) return;
    await handleToggleStar(folderPickerFor.id, true, selectedNames);
    setFolderPickerFor(null);
  };

  // 유사 프로필 모달 열기
  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 20);
    setSimilarBase(base);
    setSimilarList(sorted);
    setSimilarOpen(true);
  };

  // 폴더 추가/삭제
  const addFolder = async () => {
    const name = prompt('새 폴더 이름을 입력하세요 (2~20자)');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) { alert('이름 길이를 확인해주세요.'); return; }
    if (folders.includes(trimmed)) { alert('이미 존재하는 폴더입니다.'); return; }
    const updated = Array.from(new Set([...folders, trimmed]));
    setFolders(updated);
    try {
      if (metaDocRef) await setDoc(metaDocRef, { starredFolders: updated }, { merge: true });
    } catch (e) {
      console.error('폴더 추가 실패', e);
      alert('폴더 추가 중 오류가 발생했습니다.');
    }
  };
  const deleteFolders = async () => {
    const candidates = folders.filter(f => f !== '전체');
    if (candidates.length === 0) { alert('삭제할 수 있는 폴더가 없습니다.'); return; }
    const input = prompt(`삭제할 폴더명을 입력하세요 (여러 개는 쉼표로 구분)\n가능: ${candidates.join(', ')}`);
    if (!input) return;
    const list = input.split(',').map(s => s.trim()).filter(Boolean);
    if (list.some(n => n === '전체' || !candidates.includes(n))) { alert('선택 불가한 폴더명이 포함되어 있습니다.'); return; }
    if (!window.confirm(`정말 삭제하시겠습니까? (${list.join(', ')})`)) return;
    const remain = folders.filter(f => !list.includes(f));
    setFolders(remain);
    // 프로필의 starredFolders에서 제거 (데이터 보존)
    try {
      const batch = writeBatch(db);
      profiles.forEach(p => {
        if (Array.isArray(p.starredFolders) && p.starredFolders.some(n => list.includes(n))) {
          const updated = p.starredFolders.filter(n => !list.includes(n));
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', accessCode, p.id), { starredFolders: updated });
        }
      });
      await batch.commit();
      if (metaDocRef) await setDoc(metaDocRef, { starredFolders: remain }, { merge: true });
    } catch (e) {
      console.error('폴더 삭제 적용 실패', e);
    }
  };

  // 공유/로그인 모드 — Hook 이후에 조기 return
  if (profileIdFromUrl && accessCodeFromUrl) {
    return <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />;
  }
  if (!accessCode) {
    return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;
  }

  const formState = { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord };

  // Spotlight(주목 중) - 현재 선택 폴더
  const [activeFolder, setActiveFolder] = useState('전체');
  const spotlightList = useMemo(() => {
    const starred = profiles.filter(p => !!p.starred);
    if (activeFolder === '전체') return starred;
    return starred.filter(p => (p.starredFolders || []).includes(activeFolder));
  }, [profiles, activeFolder]);

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      {showDeleteConfirm.show && (
        <ConfirmationModal
          message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
        />
      )}

      {/* 유사 프로필 모달 */}
      <SimilarModal
        open={similarOpen}
        onClose={() => setSimilarOpen(false)}
        baseProfile={similarBase}
        items={similarList}
        onUpdate={handleUpdate}
        onDelete={handleDeleteRequest}
        accessCode={accessCode}
        onSyncOne={handleSyncOneToCalendar}
        onToggleStar={handleToggleStar}
      />

      {/* 폴더 선택 모달 */}
      <FolderPickerModal
        open={!!folderPickerFor}
        onClose={() => setFolderPickerFor(null)}
        folders={folders}
        onSave={handleSaveFoldersForProfile}
      />

      {/* 헤더 */}
      <header className="flex items-center justify-between p-3 sm:p-4 border-b bg-white">
        <div className="flex items-center gap-3">
          {/* 모바일: 사이드바 토글 */}
          <button className="md:hidden p-2 rounded hover:bg-gray-100" onClick={() => setSidebarOpen(v=>!v)} aria-label="toggle sidebar">
            {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
          <div className="flex items-center space-x-2">
            <Users className="text-yellow-500 w-7 h-7" />
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">프로필 대시보드</h1>
            <span className="hidden sm:inline text-xs bg-gray-200 px-2 py-0.5 rounded-full font-mono">{accessCode}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* 카운트 박스 */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <h3 className="text-xs font-medium text-gray-500">총 등록된 프로필</h3>
              <p className="text-xl font-bold text-yellow-500 mt-0.5">{totalCount}</p>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <h3 className="text-xs font-medium text-gray-500">미팅 진행 프로필</h3>
              <p className="text-xl font-bold text-yellow-500 mt-0.5">{meetingCount}</p>
            </div>
          </div>

          {/* 구글 상태 */}
          {googleApiReady === false && (
            <span className="hidden sm:inline text-xs text-red-500">GCal 실패{googleError ? ` (${googleError})` : ''}</span>
          )}
          {googleApiReady === true && (
            isGoogleSignedIn ? (
              <button
                onClick={() => { if (window.gapi?.client) window.gapi.client.setToken(null); setIsGoogleSignedIn(false); }}
                className="text-sm font-semibold text-gray-600 hover:text-yellow-600"
              >
                Google 로그아웃
              </button>
            ) : (
              <button
                onClick={() => tokenClient?.requestAccessToken({ prompt: 'consent' })}
                className="text-sm font-semibold text-gray-600 hover:text-yellow-600"
              >
                Google 로그인
              </button>
            )
          )}
          <button onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center">
            <LogOut className="w-4 h-4 mr-1.5" /> 로그아웃
          </button>
        </div>
      </header>

      {/* 레이아웃 */}
      <div className="flex">
        {/* 사이드바 (모바일 오버레이 지원) */}
        <aside className={`fixed md:static z-40 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} transition-transform duration-200 top-0 left-0 h-full md:h-auto w-64 md:w-64 bg-white border-r`}>
          <div className="p-4 flex items-center justify-between md:hidden">
            <span className="font-semibold">메뉴</span>
            <button className="p-2 rounded hover:bg-gray-100" onClick={() => setSidebarOpen(false)}><XCircle size={18}/></button>
          </div>
          <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-3rem)] md:h-auto">
            <button onClick={() => { setActiveMain(MAIN.ALERTS); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.ALERTS?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
              <Calendar size={16}/> 알림
            </button>
            <button onClick={() => { setActiveMain(MAIN.SEARCH); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.SEARCH?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
              <Search size={16}/> 검색
            </button>
            <button onClick={() => { setActiveMain(MAIN.SPOTLIGHT); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.SPOTLIGHT?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
              <Star size={16}/> 주목 중인 프로필들
            </button>

            {/* Functions 확장 */}
            <div>
              <button onClick={() => setFunctionsOpen(o=>!o)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FUNCTIONS?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                <Sparkles size={16}/> Functions
              </button>
              {functionsOpen && (
                <div className="ml-6 mt-1 space-y-1">
                  <button onClick={() => { setActiveMain(MAIN.FUNCTIONS); setActiveFn(FN.RECOMMEND); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FUNCTIONS && activeFn===FN.RECOMMEND?'bg-yellow-50 text-yellow-800':'hover:bg-gray-100'}`}>
                    <LayoutList size={14}/> 추천
                  </button>
                  <button onClick={() => { setActiveMain(MAIN.FUNCTIONS); setActiveFn(FN.LONGTERM); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FUNCTIONS && activeFn===FN.LONGTERM?'bg-yellow-50 text-yellow-800':'hover:bg-gray-100'}`}>
                    <BellRing size={14}/> 장기관리
                  </button>
                  <button onClick={() => { setActiveMain(MAIN.FUNCTIONS); setActiveFn(FN.GRAPHS); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FUNCTIONS && activeFn===FN.GRAPHS?'bg-yellow-50 text-yellow-800':'hover:bg-gray-100'}`}>
                    <LineChart size={14}/> 그래프&필터
                  </button>
                </div>
              )}
            </div>

            <button onClick={() => { setActiveMain(MAIN.MANAGE); setSidebarOpen(false);} } className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.MANAGE?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
              <LayoutGrid size={16}/> 프로필 관리
            </button>
          </nav>
        </aside>

        {/* 메인 */}
        <main className="flex-1 p-4 sm:p-6 md:ml-0">
          {/* 모바일에서 사이드바 가림용 배경 */}
          {sidebarOpen && <div className="fixed inset-0 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />}

          {/* 뷰 스위치 */}
          {activeMain === MAIN.ALERTS && (
            <AlertsViewBlocks
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
              showRecommend={false}
              showLongterm={false}
            />
          )}

          {activeMain === MAIN.SEARCH && (
            <section className="max-w-3xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="상단 '프로필 관리' 탭에서 상세 검색/추가/일괄등록을 할 수 있습니다."
                  className="w-full p-4 pl-12 border rounded-xl shadow-sm"
                  onFocus={() => setActiveMain(MAIN.MANAGE)}
                  readOnly
                />
              </div>
            </section>
          )}

          {activeMain === MAIN.SPOTLIGHT && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2"><Star className="text-purple-600" size={18}/> 주목 중인 프로필들</h2>
                <div className="flex items-center gap-2">
                  <button onClick={addFolder} className="flex items-center gap-1 text-sm px-3 py-1 rounded border bg-gray-50 hover:bg-gray-100"><FolderPlus size={14}/> 폴더 추가</button>
                  <button onClick={deleteFolders} className="flex items-center gap-1 text-sm px-3 py-1 rounded border bg-gray-50 hover:bg-gray-100"><FolderMinus size={14}/> 폴더 삭제</button>
                </div>
              </div>

              {/* 폴더 탭 */}
              <div className="flex flex-wrap gap-2">
                {folders.map(name => (
                  <button key={name} onClick={() => setActiveFolder(name)} className={`flex items-center gap-1 text-sm px-3 py-1 rounded-full border ${activeFolder===name?'bg-yellow-100 border-yellow-300':'bg-white hover:bg-gray-50'}`}>
                    <Folder size={14} className="text-yellow-600"/>{name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {spotlightList.length === 0 ? (
                  <div className="text-gray-500 p-4 text-sm">없음</div>
                ) : spotlightList.map(p => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    onUpdate={handleUpdate}
                    onDelete={handleDeleteRequest}
                    accessCode={accessCode}
                    onSyncOne={handleSyncOneToCalendar}
                    onShowSimilar={openSimilarModal}
                    onToggleStar={handleToggleStar}
                    wide
                  />
                ))}
              </div>
            </section>
          )}

          {activeMain === MAIN.FUNCTIONS && activeFn === FN.RECOMMEND && (
            <AlertsViewBlocks
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
              showRecommend
              showLongterm={false}
            />
          )}

          {activeMain === MAIN.FUNCTIONS && activeFn === FN.LONGTERM && (
            <AlertsViewBlocks
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
              showRecommend={false}
              showLongterm
            />
          )}

          {activeMain === MAIN.FUNCTIONS && activeFn === FN.GRAPHS && (
            <GraphsView
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
            />
          )}

          {activeMain === MAIN.MANAGE && (
            <ManageTab
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              handleFormSubmit={handleFormSubmit}
              handleBulkAdd={handleBulkAdd}
              formState={formState}
              setFormState={setFormState}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
            />
          )}
        </main>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm.show && (
        <ConfirmationModal
          message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
        />
      )}
    </div>
  );
}
