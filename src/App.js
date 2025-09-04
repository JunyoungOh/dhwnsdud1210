// src/App.js
import React, { useEffect, useMemo, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc,
  query, updateDoc, writeBatch, getDoc, setDoc, setLogLevel
} from 'firebase/firestore';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2,
  ShieldAlert, X, Save, UploadCloud, BellRing, Share2, CalendarPlus, AlertCircle,
  Star, FolderPlus, FolderX, Folder as FolderIcon, ChevronRight, ChevronLeft,
  ChevronsRight, ChevronsLeft, LayoutList, LineChart, ListFilter, Sparkles,
  Link as LinkIcon, MapPin, PanelsTopLeft, PanelLeftClose, PanelLeftOpen,
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

const appId = 'profile-dashboard-app';

// Firebase init
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

const TZ = 'Asia/Seoul';

const MAIN = {
  ALERTS: 'alerts',
  SEARCH: 'search',
  STARRED: 'starred',
  FN_RECO: 'fn/recommend',
  FN_LONG: 'fn/long',
  FN_GRAPHS: 'fn/graphs',
  MANAGE: 'manage',
};

// ===============================
// Error Boundary
// ===============================
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false }; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(err, info){ console.error('UI ErrorBoundary', err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="p-6">
          <h2 className="text-lg font-bold text-red-600">문제가 발생했습니다</h2>
          <p className="text-sm text-gray-600 mt-2">콘솔의 오류 로그를 확인해 주세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===============================
// 시간 유틸
// ===============================
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
// 유사도 계산
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
  let score = jaccard(ta, tb) * 100; // 0~100
  if (a.priority && b.priority && a.priority === b.priority) score += 6;
  const ak = TARGET_KEYWORDS.filter(k => (a.career||'').includes(k));
  const bk = TARGET_KEYWORDS.filter(k => (b.career||'').includes(k));
  score += Math.min(ak.filter(k => bk.includes(k)).length * 6, 18);
  if (a.expertise && b.expertise && a.expertise === b.expertise) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ===============================
// 공유용 상세 보기
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
// 폴더(메타) 문서 경로: artifacts/{appId}/public/data/meta/{accessCode}
// ===============================
function getProfilesCollectionRef(accessCode) {
  return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
}
function getMetaDocRef(accessCode) {
  return doc(db, 'artifacts', appId, 'public', 'data', 'meta', accessCode);
}
async function readMeta(accessCode) {
  try {
    const snap = await getDoc(getMetaDocRef(accessCode));
    if (snap.exists()) return snap.data();
    return { spotlightFolders: { all: [] } };
  } catch (e) {
    console.error('meta doc load error', e);
    return { spotlightFolders: { all: [] } };
  }
}
async function writeMeta(accessCode, partial) {
  await setDoc(getMetaDocRef(accessCode), partial, { merge: true });
}

// ===============================
// 유사 프로필 모달 (+ 확대 보기)
// ===============================
const SimilarModal = ({ open, onClose, baseProfile, items, onOpenZoom }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">유사 프로필 — <span className="text-yellow-600">{baseProfile?.name}</span></h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
        </div>
        <div className="text-sm text-gray-500 mb-3">유사도는 경력/전문영역/키워드/우선순위 등 텍스트 기반으로 계산돼요.</div>
        <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
          {items.length === 0 ? (
            <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map(({ profile, score }) => (
                <button
                  key={profile.id}
                  className="text-left border rounded-lg p-3 bg-white shadow-sm hover:shadow-md transition"
                  onClick={() => onOpenZoom(profile)}
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
      </div>
    </div>
  );
};

// ===============================
// 별표(폴더 선택) 모달
// ===============================
const FolderSelectModal = ({ open, onClose, folders, initialSelected, onSave }) => {
  const [selected, setSelected] = useState(initialSelected || ['all']);
  useEffect(() => { setSelected(initialSelected && initialSelected.length ? initialSelected : ['all']); }, [initialSelected, open]);

  if (!open) return null;
  const handleToggle = (key) => {
    setSelected(prev => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key); else set.add(key);
      if (set.size === 0) set.add('all'); // 최소 all 1개
      return Array.from(set);
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">폴더 선택</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
          {Object.keys(folders).map(key => (
            <label key={key} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 border">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={()=>handleToggle(key)}
              />
              <div className="flex items-center gap-2">
                <FolderIcon className="w-4 h-4 text-yellow-600" />
                <span className="text-sm">{key === 'all' ? '전체' : key}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-4 py-2 text-sm bg-gray-100 rounded-md" onClick={onClose}>취소</button>
          <button className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-md" onClick={() => onSave(selected)}>저장</button>
        </div>
      </div>
    </div>
  );
};

// ===============================
// 확인 모달
// ===============================
const ConfirmationModal = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
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
// 프로필 카드
// ===============================
const ProfileCard = ({
  profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm,
  accessCode, onSyncOne, onShowSimilar, onOpenStarModal
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setEditedProfile(profile); }, [profile]);

  const priorityColors = {
    '3': 'bg-red-100 text-red-800',
    '2': 'bg-yellow-100 text-yellow-800',
    '1': 'bg-green-100 text-green-800',
  };
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

  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow border relative space-y-3">
        <div className="flex items-center justify-between">
          <input name="name" value={editedProfile.name} onChange={handleInputChange} placeholder="이름" className="w-1/2 p-2 border rounded text-sm font-bold" />
        <div className="flex items-center gap-1">
            <button onClick={() => setIsEditing(false)} className="p-1 text-gray-500 hover:text-gray-800"><X size={18} /></button>
            <button onClick={handleSave} className="p-1 text-green-600 hover:text-green-800"><Save size={18} /></button>
          </div>
        </div>
        <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
        <textarea name="career" value={editedProfile.career} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-20" />
        <div className="grid grid-cols-2 gap-2">
          <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
          <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
        <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" className="w-full p-2 border rounded text-sm h-20" />
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow border relative">
      {/* 우상단 작은 액션 묶음 */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <button
          onClick={() => onOpenStarModal(profile)}
          className={`p-1 rounded hover:bg-yellow-50 ${profile.starred ? 'text-yellow-600' : 'text-gray-400 hover:text-yellow-600'}`}
          title={profile.starred ? '주목중 폴더 변경' : '모아보기 폴더 지정'}
        >
          <Star size={18} fill={profile.starred ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => onShowSimilar?.(profile)} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded" title="유사 프로필">
          <Sparkles size={18} />
        </button>
        <button onClick={() => setIsEditing(true)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="수정">
          <Edit size={18} />
        </button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="삭제">
          <Trash2 size={18} />
        </button>
        <button onClick={handleShare} className="p-1 text-gray-600 hover:bg-gray-50 rounded" title="공유 링크">
          <LinkIcon size={18} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pr-10">
        <div className="flex items-baseline gap-2">
          <h3 className="font-bold text-yellow-600 text-lg">{profile.name}</h3>
          <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
        </div>
        {profile.priority && (
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
            profile.priority==='3'?'bg-red-100 text-red-800':
            profile.priority==='2'?'bg-yellow-100 text-yellow-800':
            profile.priority==='1'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}`}>
            우선순위 {profile.priority}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          {profile.expertise && <p className="text-sm font-semibold text-gray-600">{profile.expertise}</p>}
          {profile.meetingRecord && (
            <div className="mt-2 text-xs text-gray-600">
              <p className="font-semibold text-gray-500">미팅기록</p>
              <p className="whitespace-pre-wrap">{profile.meetingRecord}</p>
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{profile.career}</p>
          {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <MapPin className="w-3 h-3" />
          {profile.gcalEventId ? (
            <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Google Calendar에서 보기
            </a>
          ) : <span className="text-gray-400">캘린더 미연동</span>}
        </div>
        <button onClick={handleSyncClick} disabled={syncing} className="text-xs bg-blue-500 text-white font-semibold px-3 py-1 rounded-full hover:bg-blue-600 disabled:bg-blue-300 flex items-center">
          {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CalendarPlus className="w-3 h-3 mr-1" />}
          {profile.gcalEventId ? '캘린더 수정' : '캘린더 등록'}
        </button>
      </div>

      {isAlarmCard && (
        <div className="mt-3 pt-3 border-t flex justify-end space-x-2">
          <button onClick={() => onConfirmAlarm(profile.id)} className="text-xs bg-gray-200 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-300">확인</button>
          <button onClick={() => onSnooze(profile.id)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">3개월 후 다시 알림</button>
        </div>
      )}
    </div>
  );
};

// ===============================
// 필터 결과 섹션
// ===============================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, onSyncOne, onShowSimilar, onOpenStarModal }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in mt-4">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="space-y-4">
      {profiles.length > 0 ? (
        profiles.map((profile, index) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${index * 40}ms` }}>
            <ProfileCard
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

// ===============================
// 검색 탭
// ===============================
const SearchOnlyTab = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onOpenStarModal }) => {
  const [searchTerm, setSearchTerm] = useState('');
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

  return (
    <section className="p-2">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="검색... (예: 경력:네이버 AND 20대)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-4 pl-12 border rounded-xl shadow-sm"
        />
      </div>
      {searchTerm.trim() && (
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-4">검색 결과</h2>
          <div className="space-y-4">
            {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accessCode={accessCode}
                onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar}
                onOpenStarModal={onOpenStarModal}
              />
            )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
          </div>
        </div>
      )}
    </section>
  );
};

// ===============================
// 알림 탭
// ===============================
const AlertsTab = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onOpenStarModal }) => {
  const { todayProfiles, upcomingProfiles } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const threeDaysLater = new Date(todayStart); threeDaysLater.setDate(threeDaysLater.getDate() + 4);

    const today = [], upcoming = [];
    profiles.forEach(p => {
      if (p.eventDate) {
        const eventDate = new Date(p.eventDate);
        if (eventDate >= todayStart && eventDate < tomorrowStart) today.push(p);
        else if (eventDate > now && eventDate < threeDaysLater) upcoming.push(p);
      }
    });

    return {
      todayProfiles: today.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      upcomingProfiles: upcoming.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
    };
  }, [profiles]);

  return (
    <>
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
        <div className="space-y-4">
          {todayProfiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          ))}
          {todayProfiles.length === 0 && <div className="text-gray-500 p-4">없음</div>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
        <div className="space-y-4">
          {upcomingProfiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          ))}
          {upcomingProfiles.length === 0 && <div className="text-gray-500 p-4">없음</div>}
        </div>
      </section>
    </>
  );
};

// ===============================
// Functions
// ===============================
const RecommendSection = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onOpenStarModal }) => {
  const recommendedProfiles = useMemo(() => {
    const now = new Date();
    const scoreOf = (p) => {
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
    return profiles
      .map(p => ({ p, s: scoreOf(p) }))
      .filter(x => x.s >= 0 && x.s >= 40)
      .sort((a,b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.p);
  }, [profiles]);

  const handleSnooze = async (profileId) => {
    const snoozeDate = new Date(); snoozeDate.setMonth(snoozeDate.getMonth() + 3);
    await onUpdate(profileId, { snoozeUntil: snoozeDate.toISOString() });
  };
  const handleConfirmAlarm = async (profileId) => onUpdate(profileId, { lastReviewedDate: new Date().toISOString() });

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold text-gray-800">추천 : 다시 들여다볼 프로필</h2>
        <div className="relative group">
          <AlertCircle className="w-4 h-4 text-yellow-600 cursor-default" />
          <div className="absolute z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-md px-3 py-2 w-72 -left-2 mt-2 shadow-lg">
            최근 팔로업 시점/스누즈/우선순위/IT 키워드 등을 반영해 점수를 계산해요.
            <br/>팔로업 ‘확인’을 누르면 목록에서 제외되고, 보통 3개월 후 조건 충족 시 다시 나타납니다.
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {recommendedProfiles.length === 0 ? (
          <div className="text-gray-500 p-4 text-sm">없음</div>
        ) : (
          recommendedProfiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isAlarmCard={true}
              onSnooze={handleSnooze}
              onConfirmAlarm={handleConfirmAlarm}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          ))
        )}
      </div>
    </section>
  );
};

const LongTermSection = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onOpenStarModal }) => {
  const longTermNoContactProfiles = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const longTerm = [];
    profiles.forEach(p => {
      const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil  = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (lastContact && lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) longTerm.push(p);
    });
    return longTerm.sort((a,b) => (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0)));
  }, [profiles]);

  return (
    <section>
      <h2 className="text-xl font-bold flex items-center">
        <BellRing className="mr-2 text-orange-500" />장기 미접촉 알림 (3개월 이상)
      </h2>
      <div className="mt-4 space-y-4">
        {longTermNoContactProfiles.length === 0 ? (
          <div className="text-gray-500 p-4 text-sm">없음</div>
        ) : (
          longTermNoContactProfiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isAlarmCard={true}
              onSnooze={(id)=>onUpdate(id,{snoozeUntil:new Date(new Date().setMonth(new Date().getMonth()+3)).toISOString()})}
              onConfirmAlarm={(id)=>onUpdate(id,{lastReviewedDate:new Date().toISOString()})}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          ))
        )}
      </div>
    </section>
  );
};

const GraphsSection = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onOpenStarModal }) => {
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

  const handlePieClick = (type, data) => { if (!data || (data.value ?? data.count) === 0) return; setActiveFilter({ type, value: data.name }); };
  const handleBarClick = (type, data) => { const count = data.count || data.value; if (count === 0) return; setActiveFilter({ type, value: data.name }); };

  return (
    <>
      <section className="bg-white p-6 rounded-xl shadow-md mb-8">
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
            onShowSimilar={onShowSimilar} onOpenStarModal={onOpenStarModal}
          />
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md mb-8">
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
            onShowSimilar={onShowSimilar} onOpenStarModal={onOpenStarModal}
          />
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={expertiseData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/>
            <Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-expertise)">
              {expertiseData.map((entry, i) => (
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
            onShowSimilar={onShowSimilar} onOpenStarModal={onOpenStarModal}
          />
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={companyData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8}/><stop offset="95%" stopColor="#FF8042" stopOpacity={1}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/><Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-company)">
              {companyData.map((entry, i) => (
                <Cell key={`co-${i}`} onClick={() => handleBarClick('company', entry)} style={{ cursor: 'pointer' }} />
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
            onShowSimilar={onShowSimilar} onOpenStarModal={onOpenStarModal}
          />
        )}
      </section>
    </>
  );
};

// ===============================
// 주목 중(폴더링) 탭
// ===============================
const StarredTab = ({
  profiles, folders, setFolders, accessCode,
  onUpdate, onDelete, onSyncOne, onShowSimilar, onOpenStarModal
}) => {
  const [activeFolder, setActiveFolder] = useState('all');
  const [showDeleteFolder, setShowDeleteFolder] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState({});

  const currentIds = folders[activeFolder] || [];
  const starredProfiles = useMemo(() => {
    const map = new Set(currentIds);
    return profiles.filter(p => map.has(p.id));
  }, [profiles, currentIds]);

  const handleAddFolder = async () => {
    const name = window.prompt('새 폴더 이름을 입력하세요 (예: 핵심타깃)');
    if (!name) return;
    const safe = name.trim();
    if (!safe || safe.toLowerCase() === 'all') { alert('이 이름은 사용할 수 없습니다.'); return; }
    if (folders[safe]) { alert('이미 존재하는 폴더입니다.'); return; }
    const next = { ...folders, [safe]: [] };
    setFolders(next);
    await writeMeta(accessCode, { spotlightFolders: next });
  };

  const handleDeleteFolders = async () => {
    const keys = Object.keys(selectedToDelete).filter(k => selectedToDelete[k]);
    if (keys.length === 0) { setShowDeleteFolder(false); setSelectedToDelete({}); return; }
    if (!window.confirm('정말 삭제하시겠습니까? (폴더 안의 프로필은 삭제되지 않습니다)')) return;
    const next = { ...folders };
    keys.forEach(k => { if (k !== 'all') delete next[k]; });
    setFolders(next);
    if (!next[activeFolder]) setActiveFolder('all');
    await writeMeta(accessCode, { spotlightFolders: next });
    setShowDeleteFolder(false); setSelectedToDelete({});
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderIcon className="w-5 h-5 text-yellow-600" />
          <span className="text-lg font-bold">폴더</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAddFolder} className="text-xs px-2 py-1 rounded-md border bg-gray-50 hover:bg-gray-100 flex items-center gap-1">
            <FolderPlus className="w-3.5 h-3.5" /> 폴더 추가
          </button>
          <button onClick={() => setShowDeleteFolder(true)} className="text-xs px-2 py-1 rounded-md border bg-gray-50 hover:bg-gray-100 flex items-center gap-1">
            <FolderX className="w-3.5 h-3.5" /> 폴더 삭제
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.keys(folders).map(key => (
          <button
            key={key}
            className={`px-3 py-1 rounded-full border text-sm ${activeFolder===key?'bg-yellow-400 text-white border-yellow-400':'bg-white hover:bg-gray-50'}`}
            onClick={()=>setActiveFolder(key)}
          >
            {key === 'all' ? '전체' : key}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {starredProfiles.length === 0 ? (
          <div className="text-gray-500 p-4">없음</div>
        ) : (
          starredProfiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          ))
        )}
      </div>

      {showDeleteFolder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">폴더 삭제</h3>
              <button onClick={() => setShowDeleteFolder(false)}><X size={18} /></button>
            </div>
            <div className="text-sm text-gray-600 mb-2">삭제할 폴더를 선택하세요. <span className="font-semibold">‘전체’는 삭제할 수 없습니다.</span></div>
            <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-2">
              {Object.keys(folders).filter(k => k !== 'all').map(key => (
                <label key={key} className="flex items-center gap-2 p-2 border rounded-md hover:bg-gray-50">
                  <input type="checkbox" checked={!!selectedToDelete[key]} onChange={(e)=>setSelectedToDelete(prev => ({...prev, [key]: e.target.checked}))} />
                  <div className="flex items-center gap-2"><FolderIcon className="w-4 h-4 text-yellow-600" /><span>{key}</span></div>
                </label>
              ))}
              {Object.keys(folders).filter(k => k !== 'all').length === 0 && <div className="text-gray-500 text-sm">삭제 가능한 폴더가 없습니다.</div>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-4 py-2 text-sm bg-gray-100 rounded-md" onClick={() => setShowDeleteFolder(false)}>취소</button>
              <button className="px-4 py-2 text-sm bg-red-600 text-white rounded-md" onClick={handleDeleteFolders}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

// ===============================
// 관리 탭
// ===============================
const ManageTab = ({
  profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd,
  formState, setFormState, accessCode, onSyncOne, onShowSimilar, onOpenStarModal
}) => {
  const { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const PER = 10;

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim(); if (!term) return profiles;
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

  const totalPages = Math.max(1, Math.ceil(searchedProfiles.length / PER));
  const paged = useMemo(() => {
    const start = (page - 1) * PER;
    return searchedProfiles.slice(start, start + PER);
  }, [searchedProfiles, page]);

  useEffect(() => { setPage(1); }, [searchTerm, profiles.length]);

  return (
    <>
      <section className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md mb-8">
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
        <div className="space-y-4">
          {paged.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onOpenStarModal={onOpenStarModal}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-2">
            <button disabled={page===1} onClick={()=>setPage(1)} className="p-2 rounded border disabled:opacity-40"><ChevronsLeft className="w-4 h-4" /></button>
            <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="p-2 rounded border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            {Array.from({length: totalPages}, (_,i)=>i+1).slice(Math.max(0,page-3), Math.max(0,page-3)+7).map(n=>(
              <button key={n} onClick={()=>setPage(n)} className={`px-3 py-1 rounded border text-sm ${page===n?'bg-yellow-400 text-white border-yellow-400':'bg-white'}`}>{n}</button>
            ))}
            <button disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="p-2 rounded border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            <button disabled={page===totalPages} onClick={()=>setPage(totalPages)} className="p-2 rounded border disabled:opacity-40"><ChevronsRight className="w-4 h-4" /></button>
          </nav>
        )}
      </section>
    </>
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
  // 공유보기 모드 플래그 (훅 호출 전에 '계산'만 하고, 조기 return은 하지 않음)
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
  const profileIdFromUrl = params.get('profile');
  const accessCodeFromUrl = params.get('code');
  const sharedMode = Boolean(profileIdFromUrl && accessCodeFromUrl);

  // ===== States =====
  const [accessCode, setAccessCode] = useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [profiles, setProfiles]     = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');

  // UI
  const [activeMain, setActiveMain] = useState(MAIN.ALERTS);
  const [functionsOpen, setFunctionsOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 삭제 확인
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  // 유사 프로필 모달
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarBase, setSimilarBase] = useState(null);
  const [similarList, setSimilarList] = useState([]);
  const [zoomProfile, setZoomProfile] = useState(null);

  // 별표 폴더 모달
  const [starModalOpen, setStarModalOpen] = useState(false);
  const [starTarget, setStarTarget] = useState(null);

  // Spotlight 폴더(메타)
  const [folders, setFolders] = useState({ all: [] });

  // Google API
  const [gapiClient, setGapiClient]   = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleApiReady, setGoogleApiReady]     = useState(null);
  const [googleError, setGoogleError]           = useState('');

  // 신규 입력 폼
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  // ===== Effects =====
  useEffect(() => {
    if (sharedMode) return; // 공유보기면 외부 스크립트 로딩 불필요
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
  }, [sharedMode]);

  // Firebase 익명 로그인
  useEffect(() => {
    if (sharedMode) return; // 공유보기면 로그인/구독 불필요
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) setAuthStatus('authenticated');
      else {
        try { await signInAnonymously(auth); setAuthStatus('authenticated'); }
        catch (e) { console.error("Firebase 익명 로그인 오류:", e); setAuthStatus('error'); }
      }
    });
    return () => unsub();
  }, [sharedMode]);

  const profilesCollectionRef = useMemo(() => {
    if (!accessCode) return null;
    return getProfilesCollectionRef(accessCode);
  }, [accessCode]);

  // 프로필 실시간 구독
  useEffect(() => {
    if (sharedMode) return; // 공유보기면 불필요
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const q = query(profilesCollectionRef);
    const unsub = onSnapshot(q, (qs) => {
      const data = qs.docs.map(d => ({ ...d.data(), id: d.id }));
      setProfiles(data);
    });
    return () => unsub();
  }, [profilesCollectionRef, sharedMode]);

  // 메타(폴더) 실시간 구독
  useEffect(() => {
    if (sharedMode) return;
    if (!accessCode) { setFolders({ all: [] }); return; }
    const ref = getMetaDocRef(accessCode);
    let createdOnce = false;
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const sf = snap.data()?.spotlightFolders || {};
        const safe = { all: [], ...sf };
        setFolders(safe);
      } else if (!createdOnce) {
        createdOnce = true;
        await setDoc(ref, { spotlightFolders: { all: [] } }, { merge: true });
      }
    }, (err)=>console.error('meta onSnapshot error', err));
    return () => unsub();
  }, [accessCode, sharedMode]);

  // ===== Handlers =====
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
      starred: false, starFolders: []
    };
    try {
      await addDoc(profilesCollectionRef, profileData);
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    } catch (err) { console.error("프로필 저장 오류: ", err); }
  };

  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const map = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updated=0, added=0;
    newProfiles.forEach(p => {
      const existingId = map.get(p.name);
      const payload = { starred: false, starFolders: [], ...p };
      if (existingId) { batch.set(doc(profilesCollectionRef, existingId), payload); updated++; }
      else { batch.set(doc(profilesCollectionRef), payload); added++; }
    });
    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const handleUpdate = async (profileId, updatedData) => {
    if (!profilesCollectionRef) return;
    const { id, ...dataToUpdate } = updatedData;
    await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
  };

  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId && profilesCollectionRef) await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  // 구글 토큰 보장
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

  // 개별 캘린더 동기화 (비공개 이벤트)
  const handleSyncOneToCalendar = async (profile) => {
    try {
      const parsedInRecord = parseDateTimeFromRecord(profile.meetingRecord);
      const parsed = parsedInRecord || (profile.eventDate ? { date: new Date(profile.eventDate), hadTime: true } : null);
      if (!parsed) { alert('미팅 날짜/시간을 인식할 수 없습니다. "미팅기록"에 날짜를 입력해주세요.'); return; }
      // 공유보기에서는 동기화 기능 사용 안 함
      if (sharedMode) { alert('공유 보기에서는 캘린더 연동을 사용할 수 없습니다.'); return; }

      if (!gapiClient || !tokenClient) { alert('Google API가 준비되지 않았습니다.'); return; }
      await ensureGoogleAuth();

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
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
          visibility: 'private',
        };
      } else {
        const dateStr = formatDateOnlyInTZ(startDate, TZ);
        const end = new Date(startDate); end.setDate(end.getDate() + 1);
        const endStr = formatDateOnlyInTZ(end, TZ);
        eventResource = {
          summary: `(영입) ${profile.name}님 미팅`,
          description: `${profile.name}님 프로필 보기:\n${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`,
          start: { date: dateStr },
          end:   { date: endStr  },
          visibility: 'private',
        };
      }

      let result;
      if (profile.gcalEventId) {
        result = await gapiClient.client.calendar.events.patch({ calendarId: 'primary', eventId: profile.gcalEventId, resource: eventResource });
      } else {
        result = await gapiClient.client.calendar.events.insert({ calendarId: 'primary', resource: eventResource });
      }
      const ev = result.result || {};
      if (profilesCollectionRef) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', accessCode, profile.id), {
          gcalEventId: ev.id || profile.gcalEventId || null,
          gcalHtmlLink: ev.htmlLink || profile.gcalHtmlLink || null,
          gcalLastSyncAt: new Date().toISOString(),
        });
      }
      alert(profile.gcalEventId ? '캘린더 일정이 수정되었습니다.' : '캘린더 일정이 등록되었습니다.');
    } catch (e) {
      console.error('Google Calendar 동기화 실패:', e);
      alert('캘린더 동기화에 실패했습니다. 콘솔 오류를 확인해주세요.');
    }
  };

  // 유사 프로필 모달/확대
  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 20);
    setSimilarBase(base);
    setSimilarList(sorted);
    setSimilarOpen(true);
  };
  const openZoomFromSimilar = (p) => { setZoomProfile(p); };

  // 별표 모달
  const openStarModal = (profile) => { setStarTarget(profile); setStarModalOpen(true); };
  const saveStarFolders = async (selectedFolders) => {
    if (!starTarget || !profilesCollectionRef) return;
    const profRef = doc(profilesCollectionRef, starTarget.id);

    const cur = { ...folders };
    Object.keys(cur).forEach(k => { cur[k] = cur[k].filter(id => id !== starTarget.id); });
    selectedFolders.forEach(k => { cur[k] = Array.from(new Set([...(cur[k] || []), starTarget.id])); });

    await updateDoc(profRef, { starred: selectedFolders.length > 0, starFolders: selectedFolders });
    await writeMeta(accessCode, { spotlightFolders: cur });
    setFolders(cur);
    setStarModalOpen(false);
    setStarTarget(null);
  };

  // 상단 카운트
  const totalCount = profiles.length;
  const meetingCount = useMemo(() => profiles.filter(p => !!p.eventDate).length, [profiles]);

  // 폼 바인딩
  const formState = { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord };

  // === 렌더 ===
  return (
    <ErrorBoundary>
      {/* 공유보기 모드라면 이 화면만 렌더 (훅은 위에서 모두 호출됨) */}
      {sharedMode ? (
        <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />
      ) : (
        <>
          {(!accessCode) ? (
            <LoginScreen onLogin={handleLogin} authStatus={authStatus} />
          ) : (
            <>
              {showDeleteConfirm.show && (
                <ConfirmationModal
                  message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
                  onConfirm={confirmDelete}
                  onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
                />
              )}

              <FolderSelectModal
                open={starModalOpen}
                onClose={() => { setStarModalOpen(false); setStarTarget(null); }}
                folders={folders}
                initialSelected={starTarget?.starFolders?.length ? starTarget.starFolders : (starTarget?.starred ? ['all'] : ['all'])}
                onSave={saveStarFolders}
              />

              <SimilarModal
                open={similarOpen}
                onClose={() => setSimilarOpen(false)}
                baseProfile={similarBase}
                items={similarList}
                onOpenZoom={openZoomFromSimilar}
              />
              {zoomProfile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/50" onClick={() => setZoomProfile(null)} />
                  <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] p-6 overflow-auto">
                    <button className="absolute top-3 left-3 p-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setZoomProfile(null)}>
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <ProfileCard
                      profile={zoomProfile}
                      onUpdate={handleUpdate}
                      onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                      accessCode={accessCode}
                      onSyncOne={handleSyncOneToCalendar}
                      onShowSimilar={openSimilarModal}
                      onOpenStarModal={openStarModal}
                    />
                  </div>
                </div>
              )}

              <div className="min-h-screen bg-gray-50 flex">
                {/* 사이드바 */}
                <aside className={`bg-white border-r w-64 p-4 flex-shrink-0 ${sidebarOpen ? 'block' : 'hidden sm:block'} fixed sm:static inset-y-0 z-40`}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Users className="text-yellow-500 w-6 h-6" />
                      <h1 className="font-bold text-gray-800">프로필 대시보드</h1>
                    </div>
                    <button className="sm:hidden p-1 rounded hover:bg-gray-100" onClick={()=>setSidebarOpen(false)}>
                      <PanelLeftClose className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="text-xs bg-gray-100 rounded px-2 py-1 font-mono">{accessCode}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-3 rounded border">
                        <div className="text-xs text-gray-500">총 프로필</div>
                        <div className="text-xl font-bold text-yellow-600">{totalCount}</div>
                      </div>
                      <div className="bg-white p-3 rounded border">
                        <div className="text-xs text-gray-500">미팅 진행</div>
                        <div className="text-xl font-bold text-yellow-600">{meetingCount}</div>
                      </div>
                    </div>
                  </div>

                  <nav className="space-y-1">
                    <button onClick={()=>setActiveMain(MAIN.ALERTS)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.ALERTS?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                      <BellRing className="w-4 h-4" /> 알림
                    </button>
                    <button onClick={()=>setActiveMain(MAIN.SEARCH)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.SEARCH?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                      <Search className="w-4 h-4" /> 검색
                    </button>
                    <button onClick={()=>setActiveMain(MAIN.STARRED)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.STARRED?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                      <Star className="w-4 h-4" /> 주목 중인 프로필들
                    </button>

                    <div className="mt-1">
                      <button onClick={()=>setFunctionsOpen(o=>!o)} className={`w-full flex items-center justify-between px-3 py-2 rounded ${activeMain.startsWith('fn/')?'bg-yellow-50':'hover:bg-gray-50'}`}>
                        <span className="flex items-center gap-2"><LayoutList className="w-4 h-4" /> Functions</span>
                        <ChevronRight className={`w-4 h-4 transition ${functionsOpen ? 'rotate-90' : ''}`} />
                      </button>
                      {functionsOpen && (
                        <div className="mt-1 pl-6 space-y-1">
                          <button onClick={()=>setActiveMain(MAIN.FN_RECO)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FN_RECO?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                            <Sparkles className="w-4 h-4" /> 추천
                          </button>
                          <button onClick={()=>setActiveMain(MAIN.FN_LONG)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FN_LONG?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                            <ListFilter className="w-4 h-4" /> 장기관리
                          </button>
                          <button onClick={()=>setActiveMain(MAIN.FN_GRAPHS)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.FN_GRAPHS?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                            <LineChart className="w-4 h-4" /> 그래프&필터
                          </button>
                        </div>
                      )}
                    </div>

                    <button onClick={()=>setActiveMain(MAIN.MANAGE)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeMain===MAIN.MANAGE?'bg-yellow-100 text-yellow-700':'hover:bg-gray-50'}`}>
                      <PanelsTopLeft className="w-4 h-4" /> 프로필 관리
                    </button>
                  </nav>

                  <div className="mt-8 space-y-2">
                    {googleApiReady === false && (
                      <span className="text-xs text-red-500">Google 연동 비활성화{googleError ? ` (${googleError})` : ''}</span>
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
                </aside>

                <main className="flex-1 p-4 sm:p-6 sm:ml-0 ml-0">
                  <div className="sm:hidden mb-3">
                    <button onClick={()=>setSidebarOpen(true)} className="px-3 py-2 border rounded-md flex items-center gap-2 bg-white shadow-sm">
                      <PanelLeftOpen className="w-4 h-4" /> 메뉴
                    </button>
                  </div>

                  <div className="max-w-5xl mx-auto">
                    {activeMain === MAIN.ALERTS && (
                      <AlertsTab
                        profiles={profiles}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        accessCode={accessCode}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}

                    {activeMain === MAIN.SEARCH && (
                      <SearchOnlyTab
                        profiles={profiles}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        accessCode={accessCode}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}

                    {activeMain === MAIN.STARRED && (
                      <StarredTab
                        profiles={profiles}
                        folders={folders}
                        setFolders={setFolders}
                        accessCode={accessCode}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}

                    {activeMain === MAIN.FN_RECO && (
                      <RecommendSection
                        profiles={profiles}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        accessCode={accessCode}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}

                    {activeMain === MAIN.FN_LONG && (
                      <LongTermSection
                        profiles={profiles}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        accessCode={accessCode}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}

                    {activeMain === MAIN.FN_GRAPHS && (
                      <GraphsSection
                        profiles={profiles}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        accessCode={accessCode}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}

                    {activeMain === MAIN.MANAGE && (
                      <ManageTab
                        profiles={profiles}
                        onUpdate={handleUpdate}
                        onDelete={(id, name)=>setShowDeleteConfirm({show:true, profileId:id, profileName:name})}
                        handleFormSubmit={handleFormSubmit}
                        handleBulkAdd={handleBulkAdd}
                        formState={formState}
                        setFormState={setFormState}
                        accessCode={accessCode}
                        onSyncOne={handleSyncOneToCalendar}
                        onShowSimilar={openSimilarModal}
                        onOpenStarModal={openStarModal}
                      />
                    )}
                  </div>
                </main>
              </div>
            </>
          )}
        </>
      )}
    </ErrorBoundary>
  );
}
