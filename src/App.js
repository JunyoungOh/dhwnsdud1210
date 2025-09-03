// src/App.js
import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search as SearchIcon, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2, ShieldAlert, X, Save,
  UploadCloud, BellRing, Share2, CalendarPlus, AlertCircle, Star, StarOff, Folder, ChevronLeft, ChevronRight,
  ChevronDoubleLeft, ChevronDoubleRight, Layers, Filter, Clock, Sparkles
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query, setLogLevel,
  updateDoc, writeBatch, getDoc, setDoc
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

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

// ==============================
// App / Firestore
// ==============================
const appId = 'profile-db-app-junyoungoh';
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

// ==============================
// Constants
// ==============================
const TZ = 'Asia/Seoul';
const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

const SECTIONS = {
  ALERTS: 'alerts',
  SEARCH: 'search',
  SPOTLIGHT: 'spotlight',
  FUNCTIONS: 'functions',
  MANAGE: 'manage',
};
const FUNCTION_TABS = {
  RECO: 'reco',
  LONG: 'long',
  GRAPHS: 'graphs',
};

// ==============================
// Meta doc helpers (예약어/세그먼트 오류 방지)
// artifacts/{appId}/public/data/{code}/meta/_app_meta
// ==============================
const META_DOC_ID = '_app_meta';
function getMetaDocRef(accessCode) {
  return doc(
    db,
    'artifacts', appId,
    'public', 'data',
    accessCode,
    'meta', META_DOC_ID
  );
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

// ==============================
// Utils
// ==============================
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

// Similarity
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

// ==============================
// Small UI helpers
// ==============================
const SectionTitle = ({icon:Icon, text, right}) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
      {Icon ? <Icon className="text-yellow-600"/> : null}{text}
    </h2>
    {right || null}
  </div>
);

const Modal = ({ onClose, title, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onClose} />
    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
      </div>
      <div className="overflow-y-auto pr-2" style={{ maxHeight: '64vh' }}>{children}</div>
    </div>
  </div>
);

// ==============================
// Login & Share-only view
// ==============================
const LoginScreen = ({ onLogin, authStatus }) => {
  const [codeInput, setCodeInput] = React.useState('');
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

const ProfileDetailView = ({ profileId, accessCode }) => {
  const [profile, setProfile] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState('');
  React.useEffect(() => {
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

// ==============================
// Profile UI (PC: Wide row, Mobile: Card)
// ==============================
function WideProfileRow({ profile, accessCode, onUpdate, onDelete, onShowSimilar, onSyncOne, onStarClick }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [edited, setEdited] = React.useState(profile);
  React.useEffect(()=>setEdited(profile),[profile]);

  const smallIconBtn = 'p-1 rounded-md hover:bg-gray-100 text-gray-500';

  const save = async () => {
    const parsed = parseDateTimeFromRecord(edited.meetingRecord);
    const eventDate = parsed ? parsed.date.toISOString() : null;
    await onUpdate(profile.id, { ...edited, eventDate });
    setIsEditing(false);
  };
  const share = () => {
    const url = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(url).then(()=>alert('공유 링크가 복사되었습니다.'),()=>alert('복사 실패'));
  };

  if (isEditing) {
    return (
      <div className="relative bg-white border rounded-xl p-4 shadow-sm">
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button onClick={()=>setIsEditing(false)} className={smallIconBtn} title="취소"><X size={16}/></button>
          <button onClick={save} className={smallIconBtn} title="저장"><Save size={16}/></button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input className="border rounded-md p-2" value={edited.name} onChange={e=>setEdited(s=>({...s,name:e.target.value}))} placeholder="이름"/>
            <input className="border rounded-md p-2 w-24" type="number" value={edited.age||''} onChange={e=>setEdited(s=>({...s,age:e.target.value?Number(e.target.value):null}))} placeholder="나이"/>
            <input className="border rounded-md p-2 w-24" value={edited.priority||''} onChange={e=>setEdited(s=>({...s,priority:e.target.value}))} placeholder="우선순위"/>
          </div>
          <input className="border rounded-md p-2" value={edited.expertise||''} onChange={e=>setEdited(s=>({...s,expertise:e.target.value}))} placeholder="전문영역"/>
          <textarea className="border rounded-md p-2 h-24" value={edited.career||''} onChange={e=>setEdited(s=>({...s,career:e.target.value}))} placeholder="경력"/>
          <textarea className="border rounded-md p-2 h-20" value={edited.otherInfo||''} onChange={e=>setEdited(s=>({...s,otherInfo:e.target.value}))} placeholder="기타"/>
          <textarea className="border rounded-md p-2 h-20" value={edited.meetingRecord||''} onChange={e=>setEdited(s=>({...s,meetingRecord:e.target.value}))} placeholder='미팅기록 예: (25.08.14) 오후 7:00'/>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white border rounded-xl p-4 shadow-sm">
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <button onClick={onStarClick} className={smallIconBtn} title={profile.starred?'주목 해제':'모아보기'}>{profile.starred ? <Star size={16} className="text-yellow-500"/> : <StarOff size={16}/>}</button>
        <button onClick={()=>onShowSimilar?.(profile)} className={smallIconBtn} title="유사 프로필"><Users size={16}/></button>
        <button onClick={share} className={smallIconBtn} title="공유"><Share2 size={16}/></button>
        <button onClick={()=>setIsEditing(true)} className={smallIconBtn} title="수정"><Edit size={16}/></button>
        <button onClick={()=>onDelete(profile.id, profile.name)} className={smallIconBtn} title="삭제"><Trash2 size={16}/></button>
        <button onClick={()=>onSyncOne?.(profile)} className={smallIconBtn} title={profile.gcalEventId?'캘린더 수정':'캘린더 등록'}><CalendarPlus size={16}/></button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:gap-6">
        <div className="flex-1">
          <div className="flex items-center">
            <h3 className="text-lg font-bold text-yellow-700">{profile.name}</h3>
            {profile.age ? <span className="ml-2 text-sm text-gray-500">{profile.age}세</span> : null}
            {profile.priority && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${profile.priority==='3'?'bg-red-100 text-red-700':profile.priority==='2'?'bg-yellow-100 text-yellow-700':'bg-green-100 text-green-700'}`}>
                {profile.priority}
              </span>
            )}
          </div>
          {profile.expertise && <div className="text-sm text-gray-600 mt-0.5">{profile.expertise}</div>}
          <div className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</div>
          {profile.otherInfo && <div className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{profile.otherInfo}</div>}
          {profile.meetingRecord && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs font-semibold text-gray-500">미팅기록</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{profile.meetingRecord}</p>
            </div>
          )}
        </div>
        <div className="mt-3 md:mt-0">
          {profile.gcalEventId ? (
            <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
              Google Calendar에서 보기
            </a>
          ) : <span className="text-xs text-gray-400">캘린더 미연동</span>}
        </div>
      </div>
    </div>
  );
}

function ProfileCardMobile({ profile, accessCode, onUpdate, onDelete, onShowSimilar, onSyncOne, onStarClick }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [edited, setEdited] = React.useState(profile);
  React.useEffect(()=>setEdited(profile),[profile]);

  const save = async () => {
    const parsed = parseDateTimeFromRecord(edited.meetingRecord);
    const eventDate = parsed ? parsed.date.toISOString() : null;
    await onUpdate(profile.id, { ...edited, eventDate });
    setIsEditing(false);
  };
  const share = () => {
    const url = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(url).then(()=>alert('공유 링크가 복사되었습니다.'),()=>alert('복사 실패'));
  };

  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border relative space-y-3">
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button onClick={()=>setIsEditing(false)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><X size={16}/></button>
          <button onClick={save} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><Save size={16}/></button>
        </div>
        <input className="w-full p-2 border rounded text-sm font-bold" value={edited.name} onChange={e=>setEdited(s=>({...s,name:e.target.value}))} placeholder="이름"/>
        <input className="w-full p-2 border rounded text-sm" value={edited.expertise||''} onChange={e=>setEdited(s=>({...s,expertise:e.target.value}))} placeholder="전문영역"/>
        <textarea className="w-full p-2 border rounded text-sm h-20" value={edited.career||''} onChange={e=>setEdited(s=>({...s,career:e.target.value}))} placeholder="경력"/>
        <div className="grid grid-cols-2 gap-2">
          <input className="w-full p-2 border rounded text-sm" type="number" value={edited.age||''} onChange={e=>setEdited(s=>({...s,age:e.target.value?Number(e.target.value):null}))} placeholder="나이"/>
          <input className="w-full p-2 border rounded text-sm" value={edited.priority||''} onChange={e=>setEdited(s=>({...s,priority:e.target.value}))} placeholder="우선순위"/>
        </div>
        <textarea className="w-full p-2 border rounded text-sm h-20" value={edited.otherInfo||''} onChange={e=>setEdited(s=>({...s,otherInfo:e.target.value}))} placeholder="기타"/>
        <textarea className="w-full p-2 border rounded text-sm h-20" value={edited.meetingRecord||''} onChange={e=>setEdited(s=>({...s,meetingRecord:e.target.value}))} placeholder='미팅기록 예: (25.08.14) 오후 7:00'/>
        <div className="flex justify-end gap-2">
          <button onClick={share} className="text-xs bg-white border px-3 py-1 rounded">공유</button>
          <button onClick={()=>setIsEditing(false)} className="text-xs bg-gray-200 px-3 py-1 rounded">취소</button>
          <button onClick={save} className="text-xs bg-yellow-500 text-white px-3 py-1 rounded">저장</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow relative">
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <button onClick={onStarClick} className="p-1 rounded-md hover:bg-gray-100 text-gray-500">{profile.starred ? <Star size={16} className="text-yellow-500"/> : <StarOff size={16}/>}</button>
        <button onClick={()=>onShowSimilar?.(profile)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><Users size={16}/></button>
        <button onClick={()=>onSyncOne?.(profile)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><CalendarPlus size={16}/></button>
        <button onClick={()=>setIsEditing(true)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><Edit size={16}/></button>
        <button onClick={()=>onDelete(profile.id, profile.name)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><Trash2 size={16}/></button>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline space-x-2">
          <h3 className="font-bold text-yellow-600">{profile.name}</h3>
          <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
        </div>
        {profile.priority && (
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${profile.priority==='3'?'bg-red-100 text-red-800':profile.priority==='2'?'bg-yellow-100 text-yellow-800':'bg-green-100 text-green-800'}`}>
            {profile.priority}
          </span>
        )}
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
    </div>
  );
}

// ==============================
// Similar modal
// ==============================
function SimilarModal({ open, onClose, baseProfile, items, accessCode, onUpdate, onDelete, onShowSimilar, onSyncOne, onStarClick }) {
  const [focus, setFocus] = React.useState(null);
  React.useEffect(()=>{ if(!open) setFocus(null); },[open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">유사 프로필 — <span className="text-yellow-600">{baseProfile?.name}</span></h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
        </div>
        {!focus ? (
          <div className="overflow-y-auto pr-3" style={{ maxHeight: '64vh' }}>
            <div className="text-sm text-gray-500 mb-2">유사도는 경력/전문영역/키워드/우선순위 등을 반영합니다.</div>
            {items.length === 0 ? (
              <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map(({ profile, score }) => (
                  <div key={profile.id} className="border rounded-lg p-3 bg-white shadow-sm cursor-pointer" onClick={()=>setFocus({ ...profile })}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-yellow-700">{profile.name}</div>
                      <div className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{score}%</div>
                    </div>
                    {profile.expertise && <div className="text-xs text-gray-600 mt-1">{profile.expertise}</div>}
                    <div className="text-xs text-gray-700 mt-2 whitespace-pre-wrap line-clamp-5">{profile.career}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-y-auto pr-3" style={{ maxHeight: '64vh' }}>
            <button onClick={()=>setFocus(null)} className="mb-3 px-2 py-1 rounded-md border text-sm">← 목록으로</button>
            <WideProfileRow
              profile={focus}
              accessCode={accessCode}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onShowSimilar={onShowSimilar}
              onSyncOne={onSyncOne}
              onStarClick={()=>onStarClick?.(focus)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ==============================
// Spotlight folders panel
// ==============================
function PickFolderContent({ folders, onSave, onCancel }) {
  const [sel, setSel] = React.useState(()=>Object.fromEntries(Object.keys(folders).map(k=>[k,k==='all']))); // all 기본 ON
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {Object.keys(folders).sort((a,b)=>a==='all'?-1:b==='all'?1:a.localeCompare(b)).map(fn => (
          <label key={fn} className="flex items-center gap-2 border rounded-md p-2 text-sm">
            <input type="checkbox" checked={!!sel[fn]} onChange={e=>setSel(s=>({...s,[fn]:e.target.checked}))}/>
            <span>📁 {fn}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1 rounded-md border">취소</button>
        <button onClick={()=>onSave(sel)} className="px-3 py-1 rounded-md bg-yellow-500 text-white">저장</button>
      </div>
    </div>
  );
}

function SpotlightFoldersPanel({ accessCode, profiles, onToggleStar, onUpdate, onDelete, onShowSimilar, onSyncOne }) {
  const [folders, setFolders] = React.useState({ all: [] });
  const [activeFolder, setActiveFolder] = React.useState('all');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deleteTargets, setDeleteTargets] = React.useState({});
  const [showPickFolder, setShowPickFolder] = React.useState(false);
  const [pickTargetId, setPickTargetId] = React.useState(null);

  React.useEffect(() => { (async()=>{ if(!accessCode) return; const meta = await readMeta(accessCode); const sf = { all: [], ...(meta.spotlightFolders||{}) }; setFolders(sf); })(); }, [accessCode]);

  const folderProfiles = React.useMemo(() => {
    const ids = folders[activeFolder] || [];
    const map = new Map(profiles.map(p => [p.id, p]));
    return ids.map(id => map.get(id)).filter(Boolean);
  }, [folders, activeFolder, profiles]);

  const createFolder = async () => {
    const name = (newFolderName||'').trim();
    if (!name || name==='all') { alert('폴더명은 비워둘 수 없고 "all"은 사용할 수 없습니다.'); return; }
    if (folders[name]) { alert('이미 존재하는 폴더입니다.'); return; }
    const next = { ...folders, [name]: [] };
    setFolders(next);
    setShowAddModal(false);
    setNewFolderName('');
    await writeMeta(accessCode, { spotlightFolders: next });
  };

  const doDeleteFolders = async () => {
    const remain = { ...folders };
    let changed = false;
    Object.keys(deleteTargets).forEach(fn => {
      if (fn!=='all' && deleteTargets[fn]) { delete remain[fn]; changed = true; }
    });
    setDeleting(false); setDeleteTargets({});
    if (changed) { setFolders(remain); await writeMeta(accessCode, { spotlightFolders: remain }); if (!remain[activeFolder]) setActiveFolder('all'); }
  };

  const openPick = async (profileId) => { setPickTargetId(profileId); setShowPickFolder(true); };
  const savePick = async (selected) => {
    const next = { ...folders };
    Object.keys(next).forEach(fn => {
      if (selected[fn]) {
        if (!next[fn].includes(pickTargetId)) next[fn] = [...next[fn], pickTargetId];
      } else {
        if (next[fn].includes(pickTargetId)) next[fn] = next[fn].filter(x => x !== pickTargetId);
      }
    });
    if (!next.all.includes(pickTargetId)) next.all = [...next.all, pickTargetId];
    setFolders(next);
    setShowPickFolder(false);
    setPickTargetId(null);
    await writeMeta(accessCode, { spotlightFolders: next });
  };

  const handleStarClick = async (profile) => {
    if (profile.starred) {
      await onToggleStar(profile.id, false);
      const next = Object.fromEntries(Object.entries(folders).map(([k, arr]) => [k, arr.filter(id => id !== profile.id)]));
      setFolders(next);
      await writeMeta(accessCode, { spotlightFolders: next });
    } else {
      await onToggleStar(profile.id, true);
      openPick(profile.id);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-wrap gap-2">
          {Object.keys(folders).sort((a,b)=>a==='all'?-1:b==='all'?1:a.localeCompare(b)).map(fn => (
            <button key={fn} onClick={()=>setActiveFolder(fn)}
              className={`px-3 py-1 rounded-full text-sm border ${activeFolder===fn ? 'bg-yellow-100 border-yellow-400 text-yellow-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              <Folder className="inline-block mr-1" size={14}/> {fn}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowAddModal(true)} className="px-3 py-1 rounded-md text-sm border bg-white hover:bg-gray-50">+ 폴더 추가</button>
          <button onClick={()=>setDeleting(true)} className="px-3 py-1 rounded-md text-sm border bg-white hover:bg-gray-50">폴더 삭제</button>
        </div>
      </div>

      {folderProfiles.length === 0 ? (
        <div className="text-sm text-gray-500 border rounded-md p-4 bg-white">해당 폴더에 프로필이 없습니다.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {folderProfiles.map(p => (
            <WideProfileRow
              key={p.id}
              profile={p}
              accessCode={accessCode}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onShowSimilar={onShowSimilar}
              onSyncOne={onSyncOne}
              onStarClick={()=>handleStarClick(p)}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <Modal onClose={()=>setShowAddModal(false)} title="새 폴더 추가">
          <div className="space-y-3">
            <input className="w-full border rounded-md p-2" placeholder="폴더 이름" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}/>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setShowAddModal(false)} className="px-3 py-1 rounded-md border">취소</button>
              <button onClick={createFolder} className="px-3 py-1 rounded-md bg-yellow-500 text-white">생성</button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal onClose={()=>setDeleting(false)} title="폴더 삭제">
          <div className="space-y-3">
            <div className="text-sm text-gray-600">삭제할 폴더를 선택하세요. <b>all</b> 폴더는 삭제할 수 없습니다.</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(folders).filter(fn=>fn!=='all').map(fn=>(
                <label key={fn} className="flex items-center gap-2 text-sm border rounded-md p-2">
                  <input type="checkbox" checked={!!deleteTargets[fn]} onChange={e=>setDeleteTargets(s=>({...s,[fn]:e.target.checked}))}/>
                  <span><Folder size={14} className="inline-block mr-1"/>{fn}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setDeleting(false)} className="px-3 py-1 rounded-md border">취소</button>
              <button onClick={()=>{
                if (!window.confirm('정말 삭제하시겠습니까? 폴더만 삭제되며 프로필은 보존됩니다.')) return;
                doDeleteFolders();
              }} className="px-3 py-1 rounded-md bg-red-500 text-white">삭제</button>
            </div>
          </div>
        </Modal>
      )}

      {showPickFolder && (
        <Modal onClose={()=>{setShowPickFolder(false); setPickTargetId(null);}} title="폴더 선택">
          <PickFolderContent folders={folders} onSave={savePick} onCancel={()=>{setShowPickFolder(false); setPickTargetId(null);}}/>
        </Modal>
      )}
    </section>
  );
}

// ==============================
// Filter results section
// ==============================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => (
  <section className="bg-white p-4 rounded-xl shadow-md mt-4">
    <div className="flex justify-between items-center mb-3">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      <span className="text-xs text-gray-400">필터 해제는 그래프 영역 밖 클릭</span>
    </div>
    {/* PC: 와이드, Mobile: 카드 */}
    <div className="hidden md:grid md:grid-cols-2 gap-4">
      {profiles.map(p => (
        <WideProfileRow key={p.id} profile={p} accessCode={accessCode}
          onUpdate={onUpdate} onDelete={onDelete} onShowSimilar={onShowSimilar}
          onSyncOne={onSyncOne} onStarClick={()=>onToggleStar(p.id, !p.starred)} />
      ))}
    </div>
    <div className="md:hidden grid grid-cols-1 gap-4">
      {profiles.map(p => (
        <ProfileCardMobile key={p.id} profile={p} accessCode={accessCode}
          onUpdate={onUpdate} onDelete={onDelete} onShowSimilar={onShowSimilar}
          onSyncOne={onSyncOne} onStarClick={()=>onToggleStar(p.id, !p.starred)} />
      ))}
    </div>
  </section>
);

// ==============================
// Excel uploader
// ==============================
function ExcelUploader({ onBulkAdd }) {
  const [file, setFile] = React.useState(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (window.XLSX) return;
    const xlsx = document.createElement('script');
    xlsx.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
    xlsx.async = true; document.body.appendChild(xlsx);
    return () => { if (xlsx && document.body.contains(xlsx)) document.body.removeChild(xlsx); };
  }, []);

  const handleUpload = async () => {
    if (!file) { setMessage('파일을 먼저 선택해주세요.'); return; }
    if (!window.XLSX) { setMessage('엑셀 라이브러리를 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요.'); return; }
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
          starred: false
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
      <SectionTitle icon={UploadCloud} text="엑셀로 일괄 등록" />
      <div className="space-y-4">
        <p className="text-sm text-gray-600">정해진 양식의 엑셀 파일을 업로드하여 여러 프로필을 한 번에 추가할 수 있습니다.</p>
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내:</p>
          <p>2행부터 각 행을 한 프로필로 읽습니다.</p>
          <p>C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보</p>
          <p className="font-bold mt-1">※ 동일 이름은 덮어쓰기됩니다.</p>
        </div>
        <input type="file" accept=".xlsx, .xls" onChange={(e)=>{setFile(e.target.files[0]); setMessage('');}} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
        <button onClick={handleUpload} disabled={!file || isUploading} className="w-full flex justify-center items-center py-2 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
          {isUploading ? <Loader2 className="animate-spin" /> : '업로드 및 추가'}
        </button>
        {message && <p className="text-sm text-center text-gray-600">{message}</p>}
      </div>
    </section>
  );
}

// ==============================
// Tabs content (Alerts/Search/Spotlight/Functions/Manage)
// ==============================
function AlertsTodayUpcoming({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const threeDaysLater = new Date(todayStart); threeDaysLater.setDate(threeDaysLater.getDate() + 4);

  const today = profiles.filter(p => p.eventDate && new Date(p.eventDate) >= todayStart && new Date(p.eventDate) < tomorrowStart)
                        .sort((a,b)=>new Date(a.eventDate)-new Date(b.eventDate));
  const upcoming = profiles.filter(p => p.eventDate && new Date(p.eventDate) > now && new Date(p.eventDate) < threeDaysLater)
                           .sort((a,b)=>new Date(a.eventDate)-new Date(b.eventDate));

  return (
    <>
      {today.length>0 && (
        <section className="mb-8">
          <SectionTitle icon={Calendar} text="오늘의 일정" />
          <div className="hidden md:grid md:grid-cols-2 gap-4">
            {today.map(p => (
              <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
          <div className="md:hidden grid grid-cols-1 gap-4">
            {today.map(p => (
              <ProfileCardMobile key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length>0 && (
        <section className="mb-8">
          <SectionTitle icon={Zap} text="다가오는 일정" />
          <div className="hidden md:grid md:grid-cols-2 gap-4">
            {upcoming.map(p => (
              <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
          <div className="md:hidden grid grid-cols-1 gap-4">
            {upcoming.map(p => (
              <ProfileCardMobile key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SearchOnly({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) {
  const [term, setTerm] = React.useState('');
  const results = React.useMemo(() => {
    const t = term.trim(); if (!t) return [];
    const orConds = t.split(/\s+or\s+/i);
    return profiles.filter(p => orConds.some(cond => {
      const ands = cond.split(/\s+and\s+/i).filter(Boolean);
      return ands.every(keyword => {
        const map = { '이름':'name','경력':'career','나이':'age','전문영역':'expertise','기타':'otherInfo','우선순위':'priority' };
        const f = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
        if (f) { const field = map[f[1]]; const val = f[2].toLowerCase(); const v = p[field] ? String(p[field]).toLowerCase() : ''; return v.includes(val); }
        const ageG = keyword.match(/^(\d{1,2})대$/);
        if (ageG) { const d = parseInt(ageG[1],10); if (d>=10) { const min=d, max=d+9; return p.age && p.age>=min && p.age<=max; } }
        const txt = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
        return txt.includes(keyword.toLowerCase());
      });
    }));
  }, [term, profiles]);

  return (
    <section>
      <div className="relative mb-6">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)"
          value={term} onChange={(e)=>setTerm(e.target.value)}
          className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
      </div>
      {term.trim() && (
        <div className="space-y-4">
          <SectionTitle icon={Filter} text="검색 결과" />
          <div className="hidden md:grid md:grid-cols-2 gap-4">
            {results.map(p => (
              <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
          <div className="md:hidden grid grid-cols-1 gap-4">
            {results.map(p => (
              <ProfileCardMobile key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SpotlightTab({ accessCode, profiles, onToggleStar, onUpdate, onDelete, onShowSimilar, onSyncOne }) {
  return (
    <section>
      <SectionTitle icon={Star} text="주목 중인 프로필들" />
      <SpotlightFoldersPanel
        accessCode={accessCode}
        profiles={profiles.filter(p => !!p.starred)}
        onToggleStar={onToggleStar}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onShowSimilar={onShowSimilar}
        onSyncOne={onSyncOne}
      />
    </section>
  );
}

function RecoContent({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) {
  const now = new Date();
  const rec = React.useMemo(() => {
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
    return profiles.map(p => ({ p, s: scoreOf(p) }))
      .filter(x => x.s >= 40)
      .sort((a,b)=>b.s-a.s)
      .slice(0, 30).map(x=>x.p);
  }, [profiles, now]);

  const handleSnooze = async (id) => {
    const snoozeDate = new Date(); snoozeDate.setMonth(snoozeDate.getMonth() + 3);
    await onUpdate(id, { snoozeUntil: snoozeDate.toISOString() });
  };
  const handleConfirm = async (id) => onUpdate(id, { lastReviewedDate: new Date().toISOString() });

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <SectionTitle icon={Sparkles} text="추천 : 다시 들여다볼 프로필"
          right={<div className="relative group">
            <AlertCircle className="w-4 h-4 text-yellow-600 cursor-default" />
            <div className="absolute z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-md px-3 py-2 w-72 -left-2 mt-2 shadow-lg">
              최근 팔로업 시점/스누즈/우선순위/IT 키워드 등을 반영해 점수를 계산해요.
              ‘확인’을 누르면 목록에서 제외되고, 보통 3개월 후 조건 충족 시 다시 나타납니다.
            </div>
          </div>}
        />
      </div>
      {rec.length===0 ? (
        <div className="text-sm text-gray-500 border rounded-md p-4 bg-white">추천 목록이 비어 있습니다.</div>
      ) : (
        <>
          <div className="hidden md:grid md:grid-cols-2 gap-4">
            {rec.map(p => (
              <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
          <div className="md:hidden grid grid-cols-1 gap-4">
            {rec.map(p => (
              <div key={p.id}>
                <ProfileCardMobile profile={p} accessCode={accessCode} onUpdate={onUpdate}
                  onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                  onStarClick={()=>onToggleStar(p.id, !p.starred)} />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={()=>handleConfirm(p.id)} className="text-xs bg-gray-200 px-3 py-1 rounded">확인</button>
                  <button onClick={()=>handleSnooze(p.id)} className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded">3개월 후 다시</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LongTermContent({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) {
  const now = new Date();
  const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const longTerm = React.useMemo(() => {
    return profiles.filter(p => {
      const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil  = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      return lastContact && lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now);
    }).sort((a,b)=> (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0)));
  }, [profiles, now, threeMonthsAgo]);

  const handleSnooze = async (id) => {
    const snoozeDate = new Date(); snoozeDate.setMonth(snoozeDate.getMonth() + 3);
    await onUpdate(id, { snoozeUntil: snoozeDate.toISOString() });
  };
  const handleConfirm = async (id) => onUpdate(id, { lastReviewedDate: new Date().toISOString() });

  return (
    <section>
      <SectionTitle icon={BellRing} text="장기 미접촉 알림 (3개월 이상)" />
      {longTerm.length===0 ? (
        <div className="text-sm text-gray-500 border rounded-md p-4 bg-white">없음</div>
      ) : (
        <>
          <div className="hidden md:grid md:grid-cols-2 gap-4">
            {longTerm.map(p => (
              <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                onStarClick={()=>onToggleStar(p.id, !p.starred)} />
            ))}
          </div>
          <div className="md:hidden grid grid-cols-1 gap-4">
            {longTerm.map(p => (
              <div key={p.id}>
                <ProfileCardMobile profile={p} accessCode={accessCode} onUpdate={onUpdate}
                  onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                  onStarClick={()=>onToggleStar(p.id, !p.starred)} />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={()=>handleConfirm(p.id)} className="text-xs bg-gray-200 px-3 py-1 rounded">확인</button>
                  <button onClick={()=>handleSnooze(p.id)} className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded">3개월 후 다시</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function GraphsFiltersContent({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) {
  const [activeFilter, setActiveFilter] = React.useState({ type: null, value: null });

  const ageData = React.useMemo(() => {
    const g = { '10대':0,'20대':0,'30대':0,'40대':0,'50대 이상':0 };
    profiles.forEach(({age})=>{
      if (!age) return;
      if (age < 20) g['10대']++; else if (age<30) g['20대']++; else if (age<40) g['30대']++; else if (age<50) g['40대']++; else g['50대 이상']++;
    });
    return Object.entries(g).map(([name, value]) => ({ name, value })).filter(d=>d.value>0);
  }, [profiles]);

  const priorityData = React.useMemo(() => {
    const p = { '3 (상)':0,'2 (중)':0,'1 (하)':0 };
    profiles.forEach(x=>{ if (x.priority==='3') p['3 (상)']++; else if (x.priority==='2') p['2 (중)']++; else if (x.priority==='1') p['1 (하)']++; });
    return Object.entries(p).map(([name, value]) => ({ name, value })).filter(d=>d.value>0);
  }, [profiles]);

  const companyData = React.useMemo(() => TARGET_KEYWORDS.map(k => ({ name: k, count: profiles.filter(p => p.career?.includes(k)).length })), [profiles]);

  const expertiseData = React.useMemo(() => {
    const c = {}; profiles.forEach(p=>{ if (p.expertise) c[p.expertise] = (c[p.expertise]||0)+1; });
    return Object.entries(c).map(([name, count]) => ({ name, count }));
  }, [profiles]);

  const filteredProfiles = React.useMemo(() => {
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

  const clear = () => setActiveFilter({ type:null, value:null });

  return (
    <>
      <section className="bg-white p-6 rounded-xl shadow-md">
        <SectionTitle icon={Layers} text="우선순위별 분포" />
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              <radialGradient id="gp-0"><stop offset="0%" stopColor="#FF4444" stopOpacity={0.7} /><stop offset="100%" stopColor="#FF4444" stopOpacity={1} /></radialGradient>
              <radialGradient id="gp-1"><stop offset="0%" stopColor="#FFBB28" stopOpacity={0.7} /><stop offset="100%" stopColor="#FFBB28" stopOpacity={1} /></radialGradient>
              <radialGradient id="gp-2"><stop offset="0%" stopColor="#00C49F" stopOpacity={0.7} /><stop offset="100%" stopColor="#00C49F" stopOpacity={1} /></radialGradient>
            </defs>
            <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
              {priorityData.map((entry, i) => (
                <Cell key={`cell-pr-${i}`} fill={`url(#gp-${i})`} stroke="#fff"
                  onClick={() => setActiveFilter({ type:'priority', value: entry.name })} style={{ cursor:'pointer' }}/>
              ))}
            </Pie>
            <Tooltip formatter={(v)=>`${v}명`} /><Legend />
          </PieChart>
        </ResponsiveContainer>
        {activeFilter.type==='priority' && (
          <FilterResultSection title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles}
            onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md mt-8">
        <SectionTitle icon={Clock} text="세대별 분포" />
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
                <Cell key={`cell-age-${i}`} fill={`url(#g-age-${i})`} stroke="#fff"
                  onClick={() => setActiveFilter({ type:'age', value: entry.name })} style={{ cursor:'pointer' }}/>
              ))}
            </Pie>
            <Tooltip formatter={(v)=>`${v}명`} /><Legend />
          </PieChart>
        </ResponsiveContainer>
        {activeFilter.type==='age' && (
          <FilterResultSection title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles}
            onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md mt-8">
        <SectionTitle icon={Filter} text="전문영역 분포" />
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={expertiseData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/><Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-expertise)">
              {expertiseData.map((entry, i) => (
                <Cell key={`ex-${i}`} onClick={() => setActiveFilter({ type:'expertise', value: entry.name })} style={{ cursor: 'pointer' }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {activeFilter.type==='expertise' && (
          <FilterResultSection title={`"${activeFilter.value}" 전문영역 필터 결과`} profiles={filteredProfiles}
            onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md mt-8">
        <SectionTitle icon={Filter} text="IT 기업 경력 분포" />
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
                <Cell key={`co-${i}`} onClick={() => setActiveFilter({ type:'company', value: entry.name })} style={{ cursor: 'pointer' }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {activeFilter.type==='company' && (
          <FilterResultSection title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles}
            onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
        )}
      </section>
    </>
  );
}

function ManageTab({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, accessCode, onSyncOne, onShowSimilar, onToggleStar }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 10;

  const results = React.useMemo(() => {
    const t = searchTerm.trim(); if (!t) return [];
    const orConds = t.split(/\s+or\s+/i);
    return profiles.filter(p => orConds.some(cond => {
      const ands = cond.split(/\s+and\s+/i).filter(Boolean);
      return ands.every(keyword => {
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

  const sorted = React.useMemo(() => [...profiles].sort((a,b)=>a.name.localeCompare(b.name)), [profiles]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const start = (page-1) * PAGE_SIZE;
  const current = sorted.slice(start, start + PAGE_SIZE);

  const {
    newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord
  } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;

  return (
    <>
      <section>
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)"
            value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div>
            <SectionTitle icon={Filter} text="검색 결과" />
            <div className="hidden md:grid md:grid-cols-2 gap-4">
              {results.map(p => (
                <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                  onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                  onStarClick={()=>onToggleStar(p.id, !p.starred)} />
              ))}
            </div>
            <div className="md:hidden grid grid-cols-1 gap-4">
              {results.map(p => (
                <ProfileCardMobile key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
                  onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
                  onStarClick={()=>onToggleStar(p.id, !p.starred)} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <SectionTitle icon={UserPlus} text="새 프로필 추가" />
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
        <SectionTitle icon={Users} text="전체 프로필 목록" />
        <div className="hidden md:grid md:grid-cols-2 gap-4">
          {current.map(p => (
            <WideProfileRow key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
              onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
              onStarClick={()=>onToggleStar(p.id, !p.starred)} />
          ))}
        </div>
        <div className="md:hidden grid grid-cols-1 gap-4">
          {current.map(p => (
            <ProfileCardMobile key={p.id} profile={p} accessCode={accessCode} onUpdate={onUpdate}
              onDelete={onDelete} onShowSimilar={onShowSimilar} onSyncOne={onSyncOne}
              onStarClick={()=>onToggleStar(p.id, !p.starred)} />
          ))}
        </div>
        {/* 페이지네이션: 숫자/좌우/더블 */}
        <div className="mt-6 flex items-center justify-center gap-1">
          <button className="px-2 py-1 border rounded disabled:opacity-40" disabled={page<=1} onClick={()=>setPage(1)}><ChevronDoubleLeft size={16}/></button>
          <button className="px-2 py-1 border rounded disabled:opacity-40" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={16}/></button>
          {Array.from({length: totalPages}, (_,i)=>i+1).slice(Math.max(0, page-6), Math.max(0, page-6)+10).map(n=>(
            <button key={n} className={`px-2 py-1 border rounded ${n===page?'bg-yellow-400 text-white border-yellow-400':''}`} onClick={()=>setPage(n)}>{n}</button>
          ))}
          <button className="px-2 py-1 border rounded disabled:opacity-40" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}><ChevronRight size={16}/></button>
          <button className="px-2 py-1 border rounded disabled:opacity-40" disabled={page>=totalPages} onClick={()=>setPage(totalPages)}><ChevronDoubleRight size={16}/></button>
        </div>
      </section>
    </>
  );
}

// ==============================
// App
// ==============================
export default function App() {
  // Auth & access
  const [accessCode, setAccessCode] = React.useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [authStatus, setAuthStatus] = React.useState('authenticating');

  // Data
  const [profiles, setProfiles] = React.useState([]);

  // UI
  const [activeSection, setActiveSection] = React.useState(SECTIONS.ALERTS);
  const [functionTab, setFunctionTab] = React.useState(FUNCTION_TABS.RECO);
  const [sidebarOpen, setSidebarOpen] = React.useState(true); // 모바일에서 완전 숨김 토글

  // Similar modal
  const [similarOpen, setSimilarOpen] = React.useState(false);
  const [similarBase, setSimilarBase] = React.useState(null);
  const [similarList, setSimilarList] = React.useState([]);

  // Google API
  const [gapiClient, setGapiClient]   = React.useState(null);
  const [tokenClient, setTokenClient] = React.useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = React.useState(false);
  const [googleApiReady, setGoogleApiReady]     = React.useState(null);
  const [googleError, setGoogleError]           = React.useState('');

  // New profile form
  const [newName, setNewName] = React.useState('');
  const [newCareer, setNewCareer] = React.useState('');
  const [newAge, setNewAge] = React.useState('');
  const [newOtherInfo, setNewOtherInfo] = React.useState('');
  const [newExpertise, setNewExpertise] = React.useState('');
  const [newPriority, setNewPriority] = React.useState('');
  const [newMeetingRecord, setNewMeetingRecord] = React.useState('');

  // Share params
  const urlParams = React.useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  // Load gapi/gis once
  React.useEffect(() => {
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
      [gapiScript, gisScript].forEach(s => { if (s && document.body.contains(s)) document.body.removeChild(s); });
    };
  }, []);

  // Firebase anonymous auth
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) setAuthStatus('authenticated');
      else {
        try { await signInAnonymously(auth); setAuthStatus('authenticated'); }
        catch (e) { console.error("Firebase 익명 로그인 오류:", e); setAuthStatus('error'); }
      }
    });
    return () => unsub();
  }, []);

  const profilesCollectionRef = React.useMemo(() => {
    if (!accessCode) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  // Realtime profiles
  React.useEffect(() => {
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const q = query(profilesCollectionRef);
    const unsub = onSnapshot(q, (qs) => {
      const data = qs.docs.map(d => ({ ...d.data(), id: d.id }));
      setProfiles(data);
    });
    return () => unsub();
  }, [profilesCollectionRef]);

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
      starred: false
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
      const payload = { starred: false, ...p };
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

  const handleDeleteRequest = async (profileId/*, profileName*/) => {
    if (!profilesCollectionRef) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    await deleteDoc(doc(profilesCollectionRef, profileId));
  };

  // Google Calendar sync (private)
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
    if (!parsed && profile.eventDate) parsed = { date: new Date(profile.eventDate), hadTime: true };
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
        extendedProperties: { private: { visibility: 'private' } },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
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
        extendedProperties: { private: { visibility: 'private' } },
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

  const handleToggleStar = async (profileId, flag) => {
    if (!profilesCollectionRef) return;
    await updateDoc(doc(profilesCollectionRef, profileId), { starred: !!flag });
  };

  // Similar modal open
  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 20);
    setSimilarBase(base);
    setSimilarList(sorted);
    setSimilarOpen(true);
  };

  // counts
  const totalCount = profiles.length;
  const meetingCount = React.useMemo(() => profiles.filter(p => !!p.eventDate).length, [profiles]);

  const formState = { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord };

  // Share-only
  if (profileIdFromUrl && accessCodeFromUrl) {
    return <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />;
  }
  if (!accessCode) {
    return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;
  }

  return (
    <div className="bg-gray-50 min-h-screen font-sans flex">
      {/* Sidebar */}
      <aside className={`bg-white border-r w-64 p-4 space-y-2 fixed md:static inset-y-0 z-20 transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="text-yellow-500" />
            <h1 className="text-lg font-bold text-gray-800">프로필 대시보드</h1>
          </div>
          <button className="md:hidden text-sm text-gray-600" onClick={()=>setSidebarOpen(false)}>닫기</button>
        </div>

        <div className="text-xs text-gray-500 mb-3">
          <span className="bg-gray-100 px-2 py-0.5 rounded font-mono">{accessCode}</span>
        </div>

        <nav className="space-y-1">
          <button onClick={()=>setActiveSection(SECTIONS.ALERTS)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeSection===SECTIONS.ALERTS?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
            <BellRing size={16}/> 알림
          </button>
          <button onClick={()=>setActiveSection(SECTIONS.SEARCH)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeSection===SECTIONS.SEARCH?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
            <SearchIcon size={16}/> 검색
          </button>
          <button onClick={()=>setActiveSection(SECTIONS.SPOTLIGHT)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeSection===SECTIONS.SPOTLIGHT?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
            <Star size={16}/> 주목 중인 프로필들
          </button>

          {/* Functions expandable */}
          <div className={`border rounded-md ${activeSection===SECTIONS.FUNCTIONS?'border-yellow-300':'border-gray-200'}`}>
            <button onClick={()=>setActiveSection(SECTIONS.FUNCTIONS)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-t ${activeSection===SECTIONS.FUNCTIONS?'bg-yellow-50 text-yellow-800':'hover:bg-gray-50'}`}>
              <Layers size={16}/> Functions
            </button>
            {activeSection===SECTIONS.FUNCTIONS && (
              <div className="p-2 border-t grid gap-1">
                <button onClick={()=>setFunctionTab(FUNCTION_TABS.RECO)} className={`w-full text-left px-3 py-2 rounded ${functionTab===FUNCTION_TABS.RECO?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
                  추천
                </button>
                <button onClick={()=>setFunctionTab(FUNCTION_TABS.LONG)} className={`w-full text-left px-3 py-2 rounded ${functionTab===FUNCTION_TABS.LONG?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
                  장기관리
                </button>
                <button onClick={()=>setFunctionTab(FUNCTION_TABS.GRAPHS)} className={`w-full text-left px-3 py-2 rounded ${functionTab===FUNCTION_TABS.GRAPHS?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
                  그래프&필터
                </button>
              </div>
            )}
          </div>

          <button onClick={()=>setActiveSection(SECTIONS.MANAGE)} className={`w-full flex items-center gap-2 px-3 py-2 rounded ${activeSection===SECTIONS.MANAGE?'bg-yellow-100 text-yellow-800':'hover:bg-gray-50'}`}>
            <Users size={16}/> 프로필 관리
          </button>
        </nav>

        <div className="pt-4 border-t mt-4 space-y-2">
          {googleApiReady === false && (
            <div className="text-xs text-red-500">Google Calendar 연동 비활성화됨{googleError ? ` (${googleError})` : ' (초기화 실패)'}</div>
          )}
          {googleApiReady === true && (
            isGoogleSignedIn ? (
              <button onClick={() => { if (window.gapi?.client) window.gapi.client.setToken(null); setIsGoogleSignedIn(false); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600">Google 로그아웃</button>
            ) : (
              <button onClick={() => tokenClient?.requestAccessToken({ prompt: 'consent' })} className="text-sm font-semibold text-gray-600 hover:text-yellow-600">Google 로그인</button>
            )
          )}
          <button onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center gap-1">
            <LogOut size={16}/> 로그아웃
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 md:ml-0 ml-0">
        {/* Top bar (counts + mobile menu btn) */}
        <header className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button className="md:hidden px-3 py-2 border rounded" onClick={()=>setSidebarOpen(s=>!s)}>
              {sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
            </button>
            <div className="hidden md:flex items-center gap-2">
              <span className="text-sm text-gray-500">엑세스 코드:</span>
              <span className="text-sm bg-gray-100 px-2 py-0.5 rounded font-mono">{accessCode}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">총 등록된 프로필</h3>
              <p className="text-2xl font-bold text-yellow-500 mt-1 text-center">{totalCount}</p>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">미팅 진행 프로필</h3>
              <p className="text-2xl font-bold text-yellow-500 mt-1 text-center">{meetingCount}</p>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 space-y-10">
          {activeSection===SECTIONS.ALERTS && (
            <AlertsTodayUpcoming
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
            />
          )}

          {activeSection===SECTIONS.SEARCH && (
            <SearchOnly
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStar={handleToggleStar}
            />
          )}

          {activeSection===SECTIONS.SPOTLIGHT && (
            <SpotlightTab
              accessCode={accessCode}
              profiles={profiles}
              onToggleStar={handleToggleStar}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              onShowSimilar={openSimilarModal}
              onSyncOne={handleSyncOneToCalendar}
            />
          )}

          {activeSection===SECTIONS.FUNCTIONS && (
            <>
              {functionTab===FUNCTION_TABS.RECO && (
                <RecoContent
                  profiles={profiles}
                  onUpdate={handleUpdate}
                  onDelete={handleDeleteRequest}
                  accessCode={accessCode}
                  onSyncOne={handleSyncOneToCalendar}
                  onShowSimilar={openSimilarModal}
                  onToggleStar={handleToggleStar}
                />
              )}
              {functionTab===FUNCTION_TABS.LONG && (
                <LongTermContent
                  profiles={profiles}
                  onUpdate={handleUpdate}
                  onDelete={handleDeleteRequest}
                  accessCode={accessCode}
                  onSyncOne={handleSyncOneToCalendar}
                  onShowSimilar={openSimilarModal}
                  onToggleStar={handleToggleStar}
                />
              )}
              {functionTab===FUNCTION_TABS.GRAPHS && (
                <GraphsFiltersContent
                  profiles={profiles}
                  onUpdate={handleUpdate}
                  onDelete={handleDeleteRequest}
                  accessCode={accessCode}
                  onSyncOne={handleSyncOneToCalendar}
                  onShowSimilar={openSimilarModal}
                  onToggleStar={handleToggleStar}
                />
              )}
            </>
          )}

          {activeSection===SECTIONS.MANAGE && (
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

      {/* Similar modal */}
      <SimilarModal
        open={similarOpen}
        onClose={() => setSimilarOpen(false)}
        baseProfile={similarBase}
        items={similarList}
        accessCode={accessCode}
        onUpdate={handleUpdate}
        onDelete={handleDeleteRequest}
        onShowSimilar={openSimilarModal}
        onSyncOne={handleSyncOneToCalendar}
        onStarClick={(p)=>handleToggleStar(p.id, !p.starred)}
      />
    </div>
  );
}
