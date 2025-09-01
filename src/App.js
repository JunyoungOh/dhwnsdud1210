// src/App.js
import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  setLogLevel, updateDoc, writeBatch, getDoc
} from 'firebase/firestore';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  // 네비 & UI
  Bell, Search as SearchIcon, Star, Layers, Users, Menu, X as Close,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Folder as FolderIcon, FolderPlus, Trash2,
  // 본문 동작
  LogOut, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, ShieldAlert, Save,
  UploadCloud, BellRing, Share2, CalendarPlus, AlertCircle
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

// 좌측 세로 네비
const NAV = { ALERTS:'alerts', SEARCH:'search', STARRED:'starred', FUNCTIONS:'functions', MANAGE:'manage' };
// Functions 하위
const FN_TAB = { RECOMMEND:'recommend', LONGTERM:'longterm', GRAPHS:'graphs' };

// ===============================
// 시간 파싱 & 포맷 유틸
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
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
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
  const base = [p.name || '', p.expertise || '', p.career || '', p.otherInfo || '']
    .join(' ').toLowerCase();
  const words = base.replace(/[()\[\],./\\\-:~!@#$%^&*?'"`|]/g, ' ')
    .split(/\s+/).filter(Boolean);
  const extra = [];
  TARGET_KEYWORDS.forEach(k => { if ((p.career||'').includes(k)) extra.push(k); });
  if (p.priority) extra.push(`priority:${p.priority}`);
  if (p.age) {
    const band = p.age < 20 ? '10' : p.age < 30 ? '20' : p.age < 40 ? '30' : p.age < 50 ? '40' : '50+';
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
      } finally { setLoading(false); }
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
// 유사 프로필 모달 (+확대 보기)
// ===============================
const SimilarModal = ({ open, onClose, baseProfile, items, onUpdate, onDelete, accessCode, onSyncOne, onToggleStar, onShare }) => {
  const [focus, setFocus] = useState(null);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!focus) onClose(); }} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {focus ? (
              <button onClick={() => setFocus(null)} className="p-1 rounded hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : null}
            <h3 className="text-lg font-bold text-gray-800">
              {focus ? '프로필 보기' : <>유사 프로필 — <span className="text-yellow-600">{baseProfile?.name}</span></>}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><Close size={20} /></button>
        </div>
        {!focus && <div className="text-sm text-gray-500 mb-3">유사도는 경력/전문영역/키워드/우선순위 등 텍스트 기반으로 계산돼요.</div>}
        <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
          {!focus ? (
            items.length === 0 ? (
              <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {items.map(({ profile, score }) => (
                  <button key={profile.id} onClick={() => setFocus(profile)} className="text-left border rounded-lg p-3 bg-white shadow-sm hover:shadow transition flex items-start justify-between">
                    <div className="pr-3">
                      <div className="font-semibold text-yellow-700">{profile.name}</div>
                      {profile.expertise && <div className="text-xs text-gray-600 mt-1">{profile.expertise}</div>}
                      <div className="text-xs text-gray-700 mt-2 whitespace-pre-wrap line-clamp-4">{profile.career}</div>
                    </div>
                    <div className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{score}%</div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <ExpandedProfile
              profile={focus}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onToggleStar={onToggleStar}
              onShare={onShare}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const ExpandedProfile = ({ profile, onUpdate, onDelete, accessCode, onSyncOne, onToggleStar, onShare }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => setEditedProfile(profile), [profile]);
  const handleSave = async () => {
    const parsed = parseDateTimeFromRecord(editedProfile.meetingRecord);
    const eventDate = parsed ? new Date(parsed.date).toISOString() : null;
    await onUpdate(profile.id, { ...editedProfile, eventDate });
    setIsEditing(false);
  };
  const handleSync = async () => { setSyncing(true); try { await onSyncOne(profile); } finally { setSyncing(false); } };
  return (
    <div className="border rounded-xl p-4 shadow-sm bg-white">
      {!isEditing ? (
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-yellow-700">{profile.name}</h3>
              <span className="text-sm text-gray-500">{profile.age ? `${profile.age}세` : ''}</span>
              {profile.priority && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">{profile.priority}</span>
              )}
            </div>
            {profile.expertise && <div className="text-sm font-semibold text-gray-700 mt-1">{profile.expertise}</div>}
            {profile.career && <div className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</div>}
            {profile.otherInfo && <div className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{profile.otherInfo}</div>}
            {profile.meetingRecord && (
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs font-semibold text-gray-500">미팅기록</div>
                <div className="text-xs text-gray-700 whitespace-pre-wrap">{profile.meetingRecord}</div>
              </div>
            )}
          </div>
          <div className="lg:w-64 flex flex-wrap gap-2">
            <button onClick={() => onToggleStar(profile, !profile.starred)} className={`px-3 py-1 rounded-full text-xs font-semibold ${profile.starred ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{profile.starred ? '주목중' : '모아보기'}</button>
            <button onClick={() => setIsEditing(true)} className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200">수정</button>
            <button onClick={() => onDelete(profile.id, profile.name)} className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200">삭제</button>
            <button onClick={() => onShare(profile)} className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">공유링크</button>
            <button onClick={handleSync} disabled={syncing} className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 flex items-center">{syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CalendarPlus className="w-3 h-3 mr-1" />}캘린더</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <input className="border rounded px-2 py-1" value={editedProfile.name} onChange={e => setEditedProfile(v => ({...v, name: e.target.value}))} placeholder="이름" />
            <input className="border rounded px-2 py-1" value={editedProfile.expertise||''} onChange={e => setEditedProfile(v => ({...v, expertise: e.target.value}))} placeholder="전문영역" />
          </div>
          <textarea className="border rounded px-2 py-1 h-24" value={editedProfile.career||''} onChange={e => setEditedProfile(v => ({...v, career: e.target.value}))} placeholder="경력"/>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className="border rounded px-2 py-1" value={editedProfile.age||''} onChange={e => setEditedProfile(v => ({...v, age: e.target.value ? Number(e.target.value): ''}))} placeholder="나이" />
            <input className="border rounded px-2 py-1" value={editedProfile.priority||''} onChange={e => setEditedProfile(v => ({...v, priority: e.target.value}))} placeholder="우선순위" />
          </div>
          <textarea className="border rounded px-2 py-1 h-20" value={editedProfile.otherInfo||''} onChange={e => setEditedProfile(v => ({...v, otherInfo: e.target.value}))} placeholder="기타 정보"/>
          <textarea className="border rounded px-2 py-1 h-20" value={editedProfile.meetingRecord||''} onChange={e => setEditedProfile(v => ({...v, meetingRecord: e.target.value}))} placeholder='미팅기록 (예: (25.08.14) 오후 7:00)'/>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setIsEditing(false)} className="px-3 py-1 rounded-full text-xs bg-gray-200 text-gray-700">취소</button>
            <button onClick={handleSave} className="px-3 py-1 rounded-full text-xs bg-green-600 text-white">저장</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ===============================
// 확인 모달
// ===============================
const ConfirmModal = ({ show, message, onConfirm, onCancel }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[60]">
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
};

// ===============================
// 폴더 선택 모달 (모아보기 추가 시)
// ===============================
const FolderSelectModal = ({ open, folders, onClose, onSave }) => {
  const [selected, setSelected] = useState(new Set()); // folderIds
  useEffect(() => {
    if (open) setSelected(new Set()); // 초기화 (기본은 전체만; 전체는 가상이므로 저장안함)
  }, [open]);

  const toggle = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><FolderIcon className="w-5 h-5 text-yellow-600"/>폴더 선택</h3>
        <p className="text-xs text-gray-500 mb-3">‘전체’는 기본으로 포함됩니다. 필요하면 다른 폴더도 함께 선택하세요.</p>
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
          {/* 가상 폴더: 전체 (항상 체크표시 UI만, 데이터 저장 X) */}
          <div className="flex items-center gap-2 p-2 border rounded bg-gray-50">
            <input type="checkbox" checked readOnly />
            <div className="flex items-center gap-2 text-gray-700"><FolderIcon className="w-4 h-4"/><span>전체</span></div>
          </div>
          {folders.map(f => (
            <label key={f.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
              <div className="flex items-center gap-2"><FolderIcon className="w-4 h-4 text-gray-600"/><span>{f.name}</span></div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded text-sm bg-gray-200">취소</button>
          <button onClick={() => onSave(Array.from(selected))} className="px-3 py-1 rounded text-sm bg-yellow-500 text-white">저장</button>
        </div>
      </div>
    </div>
  );
};

// ===============================
// 프로필 카드 (가로 와이드: PC)
// ===============================
const ProfileCard = ({
  profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm,
  accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => setEditedProfile(profile), [profile]);

  const priorityColors = { '3': 'bg-red-100 text-red-800', '2': 'bg-yellow-100 text-yellow-800', '1': 'bg-green-100 text-green-800' };

  const handleSave = async () => {
    const parsed = parseDateTimeFromRecord(editedProfile.meetingRecord);
    const eventDate = parsed ? new Date(parsed.date).toISOString() : null;
    await onUpdate(profile.id, { ...editedProfile, eventDate });
    setIsEditing(false);
  };
  const handleSyncClick = async () => {
    if (!onSyncOne) return;
    setSyncing(true); try { await onSyncOne(profile); } finally { setSyncing(false); }
  };
  const handleShare = () => onShare(profile);

  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-xl shadow border flex flex-col gap-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <input value={editedProfile.name} onChange={(e)=>setEditedProfile(v=>({...v, name:e.target.value}))} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
          <input value={editedProfile.expertise || ''} onChange={(e)=>setEditedProfile(v=>({...v, expertise:e.target.value}))} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea value={editedProfile.career||''} onChange={(e)=>setEditedProfile(v=>({...v, career:e.target.value}))} placeholder="경력" className="w-full p-2 border rounded text-sm h-20" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={editedProfile.age || ''} onChange={(e)=>setEditedProfile(v=>({...v, age:e.target.value?Number(e.target.value):''}))} placeholder="나이" className="w-full p-2 border rounded text-sm" />
          <input value={editedProfile.priority || ''} onChange={(e)=>setEditedProfile(v=>({...v, priority:e.target.value}))} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea value={editedProfile.otherInfo||''} onChange={(e)=>setEditedProfile(v=>({...v, otherInfo:e.target.value}))} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
        <textarea value={editedProfile.meetingRecord||''} onChange={(e)=>setEditedProfile(v=>({...v, meetingRecord:e.target.value}))} placeholder='미팅기록 (예: (25.08.14) 오후 7:00)' className="w-full p-2 border rounded text-sm h-20" />
        <div className="flex justify-end gap-2">
          <button onClick={()=>setIsEditing(false)} className="px-3 py-1 rounded text-sm bg-gray-200">취소</button>
          <button onClick={handleSave} className="px-3 py-1 rounded text-sm bg-green-600 text-white">저장</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow border flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-yellow-600 text-lg">{profile.name}</h3>
          <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
          {profile.priority && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${priorityColors[profile.priority] || 'bg-gray-100 text-gray-800'}`}>{profile.priority}</span>}
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
          <div className="mt-3 pt-3 border-t flex gap-2">
            <button onClick={() => onConfirmAlarm(profile.id)} className="text-xs bg-gray-200 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-300">확인</button>
            <button onClick={() => onSnooze(profile.id)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">3개월 후 다시 알림</button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 lg:w-72">
        <button onClick={() => onToggleStar(profile, !profile.starred)} className={`text-xs font-semibold px-3 py-1 rounded-full ${profile.starred ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{profile.starred ? '주목중' : '모아보기'}</button>
        <button onClick={() => onShowSimilar?.(profile)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">유사 프로필</button>
        <button onClick={() => setIsEditing(true)} className="text-xs bg-blue-100 text-blue-700 font-semibold px-3 py-1 rounded-full hover:bg-blue-200">수정</button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="text-xs bg-red-100 text-red-700 font-semibold px-3 py-1 rounded-full hover:bg-red-200">삭제</button>
        <button onClick={handleShare} className="text-xs bg-gray-100 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-200">공유 링크</button>
        <div className="flex items-center gap-2">
          {profile.gcalEventId ? (
            <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">캘린더 보기</a>
          ) : <span className="text-xs text-gray-400">캘린더 미연동</span>}
          <button onClick={handleSyncClick} disabled={syncing} className="text-xs bg-blue-500 text-white font-semibold px-3 py-1 rounded-full hover:bg-blue-600 disabled:bg-blue-300 flex items-center">
            {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CalendarPlus className="w-3 h-3 mr-1" />}{profile.gcalEventId ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ===============================
// 필터 결과 섹션
// ===============================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare }) => (
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
              onToggleStar={onToggleStar}
              onShare={onShare}
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
// Alerts (오늘/다가오는 일정)
// ===============================
const AlertsPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare }) => {
  const { todayProfiles, upcomingProfiles } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const threeDaysLater = new Date(todayStart); threeDaysLater.setDate(threeDaysLater.getDate() + 4);
    const today = [], upcoming = [];
    profiles.forEach(p => {
      if (!p.eventDate) return;
      const eventDate = new Date(p.eventDate);
      if (eventDate >= todayStart && eventDate < tomorrowStart) today.push(p);
      else if (eventDate > now && eventDate < threeDaysLater) upcoming.push(p);
    });
    return {
      todayProfiles: today.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      upcomingProfiles: upcoming.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
    };
  }, [profiles]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
        {todayProfiles.length === 0 ? (
          <div className="text-gray-500 text-sm bg-white rounded-xl border p-4">없음</div>
        ) : (
          <div className="space-y-4">
            {todayProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
        {upcomingProfiles.length === 0 ? (
          <div className="text-gray-500 text-sm bg-white rounded-xl border p-4">없음</div>
        ) : (
          <div className="space-y-4">
            {upcomingProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

// ===============================
// Search (검색창만)
// ===============================
const SearchPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const searched = useMemo(() => {
    const term = searchTerm.trim(); if (!term) return [];
    const orConds = term.split(/\s+or\s+/i);
    return profiles.filter(p => orConds.some(cond => {
      const andKs = cond.split(/\s+and\s+/i).filter(Boolean);
      return andKs.every(keyword => {
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
    <div className="space-y-6">
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
      </div>
      {searchTerm.trim() && (
        <div className="space-y-4">
          {searched.length === 0 ? (
            <div className="text-gray-500 text-sm bg-white rounded-xl border p-4">검색 결과가 없습니다.</div>
          ) : (
            searched.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ===============================
// Starred (주목중) — 폴더링 추가
// ===============================
const StarredPage = ({
  profiles, folders, selectedFolderId, setSelectedFolderId,
  onCreateFolder, onDeleteFolders,
  onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showDel, setShowDel] = useState(false);
  const [delIds, setDelIds] = useState(new Set());

  const starred = useMemo(() => profiles.filter(p => !!p.starred), [profiles]);
  const filtered = useMemo(() => {
    if (selectedFolderId === 'ALL') return starred;
    return starred.filter(p => Array.isArray(p.starFolders) && p.starFolders.includes(selectedFolderId));
  }, [starred, selectedFolderId]);

  useEffect(() => {
    // 선택된 폴더가 삭제되면 ALL로
    if (selectedFolderId !== 'ALL' && !folders.some(f => f.id === selectedFolderId)) {
      setSelectedFolderId('ALL');
    }
  }, [folders, selectedFolderId, setSelectedFolderId]);

  const toggleDelId = (id) => {
    setDelIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-6">
      {/* 폴더 바 */}
      <div className="bg-white rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 전체(가상) */}
          <button
            className={`px-3 py-1 rounded-md border flex items-center gap-2 ${selectedFolderId==='ALL'?'bg-yellow-400 text-white border-yellow-400':'hover:bg-gray-50'}`}
            onClick={() => setSelectedFolderId('ALL')}
          >
            <FolderIcon className="w-4 h-4" /> 전체
          </button>
          {folders.map(f => (
            <button
              key={f.id}
              className={`px-3 py-1 rounded-md border flex items-center gap-2 ${selectedFolderId===f.id?'bg-yellow-100 text-yellow-800 border-yellow-200':'hover:bg-gray-50'}`}
              onClick={() => setSelectedFolderId(f.id)}
            >
              <FolderIcon className="w-4 h-4" /> {f.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowAdd(true)} className="px-3 py-1 rounded-md border flex items-center gap-2 hover:bg-gray-50">
              <FolderPlus className="w-4 h-4 text-yellow-600" /> 폴더 추가
            </button>
            <button onClick={() => { setDelIds(new Set()); setShowDel(true); }} className="px-3 py-1 rounded-md border flex items-center gap-2 hover:bg-gray-50">
              <Trash2 className="w-4 h-4 text-red-600" /> 폴더 삭제
            </button>
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-gray-500 text-sm bg-white rounded-xl border p-4">
            이 폴더에 주목중 프로필이 없습니다. 카드의 ‘모아보기’를 눌러 폴더에 추가하세요.
          </div>
        ) : (
          filtered.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onToggleStar={onToggleStar}
              onShare={onShare}
            />
          ))
        )}
      </div>

      {/* 폴더 추가 모달 */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowAdd(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><FolderIcon className="w-5 h-5 text-yellow-600"/>새 폴더</h3>
            <input
              value={newFolderName}
              onChange={(e)=>setNewFolderName(e.target.value)}
              placeholder="폴더 이름"
              className="w-full border rounded px-3 py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowAdd(false)} className="px-3 py-1 rounded text-sm bg-gray-200">취소</button>
              <button
                onClick={async ()=>{
                  const name = newFolderName.trim();
                  if (!name) return;
                  await onCreateFolder(name);
                  setNewFolderName('');
                  setShowAdd(false);
                }}
                className="px-3 py-1 rounded text-sm bg-yellow-500 text-white"
              >생성</button>
            </div>
          </div>
        </div>
      )}

      {/* 폴더 삭제 모달 */}
      {showDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowDel(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600"/>폴더 삭제</h3>
            <p className="text-xs text-gray-500 mb-3">‘전체’는 삭제할 수 없습니다. 폴더를 삭제해도 프로필 데이터는 삭제되지 않습니다.</p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
              {folders.length === 0 ? (
                <div className="text-sm text-gray-500">삭제할 폴더가 없습니다.</div>
              ) : folders.map(f => (
                <label key={f.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={delIds.has(f.id)} onChange={()=>toggleDelId(f.id)} />
                  <div className="flex items-center gap-2"><FolderIcon className="w-4 h-4 text-gray-600"/><span>{f.name}</span></div>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowDel(false)} className="px-3 py-1 rounded text-sm bg-gray-200">취소</button>
              <button
                onClick={async ()=>{
                  if (delIds.size === 0) { setShowDel(false); return; }
                  const ok = window.confirm('정말 삭제하시겠습니까?');
                  if (!ok) return;
                  await onDeleteFolders(Array.from(delIds));
                  setShowDel(false);
                }}
                className="px-3 py-1 rounded text-sm bg-red-600 text-white"
              >삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===============================
// Functions (추천/장기/그래프)
// ===============================
const FunctionsPage = ({
  profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare,
  subTab, setSubTab
}) => {
  const now = new Date();
  const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

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

  const recommendedProfiles = useMemo(() => {
    return profiles
      .map(p => ({ p, s: scoreOf(p) }))
      .filter(x => x.s >= 0 && x.s >= 40)
      .sort((a,b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  const longTermNoContactProfiles = useMemo(() => {
    return profiles.filter(p => {
      const last = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      return last && last < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now);
    }).sort((a,b) => (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0)));
  }, [profiles, now, threeMonthsAgo]);

  const [activeFilter, setActiveFilter] = useState({ type: null, value: null });

  const priorityData = useMemo(() => {
    const p = { '3 (상)': 0, '2 (중)': 0, '1 (하)': 0 };
    profiles.forEach(x => { if (x.priority === '3') p['3 (상)']++; else if (x.priority === '2') p['2 (중)']++; else if (x.priority === '1') p['1 (하)']++; });
    return Object.entries(p).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [profiles]);
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
  const expertiseData = useMemo(() => {
    const c = {}; profiles.forEach(p => { if (p.expertise) c[p.expertise] = (c[p.expertise] || 0) + 1; });
    return Object.entries(c).map(([name, count]) => ({ name, count }));
  }, [profiles]);
  const companyData = useMemo(() => TARGET_KEYWORDS.map(k => ({ name: k, count: profiles.filter(p => p.career?.includes(k)).length })), [profiles]);

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

  const handlePieClick = (type, data) => {
    const val = data?.name;
    const count = data?.value ?? data?.count ?? 0;
    if (!val || count === 0) return;
    setActiveFilter({ type, value: val });
  };
  const handleBarClick = (type, data) => {
    const val = data?.name;
    const count = data?.count ?? data?.value ?? 0;
    if (!val || count === 0) return;
    setActiveFilter({ type, value: val });
  };

  const handleSnooze = async (profileId) => {
    const d = new Date(); d.setMonth(d.getMonth() + 3);
    await onUpdate(profileId, { snoozeUntil: d.toISOString() });
  };
  const handleConfirmAlarm = async (profileId) => {
    await onUpdate(profileId, { lastReviewedDate: new Date().toISOString() });
  };

  return (
    <div className="space-y-10">
      {/* 하위 카테고리 탭 */}
      <div className="flex gap-2">
        <button onClick={()=>setSubTab(FN_TAB.RECOMMEND)} className={`px-3 py-1 rounded-md text-sm ${subTab===FN_TAB.RECOMMEND ? 'bg-yellow-400 text-white' : 'bg-white border hover:bg-gray-50'}`}>추천</button>
        <button onClick={()=>setSubTab(FN_TAB.LONGTERM)} className={`px-3 py-1 rounded-md text-sm ${subTab===FN_TAB.LONGTERM ? 'bg-yellow-400 text-white' : 'bg-white border hover:bg-gray-50'}`}>장기관리</button>
        <button onClick={()=>setSubTab(FN_TAB.GRAPHS)} className={`px-3 py-1 rounded-md text-sm ${subTab===FN_TAB.GRAPHS ? 'bg-yellow-400 text-white' : 'bg-white border hover:bg-gray-50'}`}>그래프&필터</button>
      </div>

      {/* 추천 */}
      {subTab === FN_TAB.RECOMMEND && (
        <section>
          <div className="flex items-center justify-between mb-3">
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
            <div className="text-xs text-gray-500">카드에서 ‘확인/스누즈’ 조작 가능</div>
          </div>
          {recommendedProfiles.length === 0 ? (
            <div className="text-gray-500 text-sm bg-white rounded-xl border p-4">없음</div>
          ) : (
            <div className="space-y-4">
              {recommendedProfiles.map(p => (
                <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} isAlarmCard={true} onSnooze={handleSnooze} onConfirmAlarm={handleConfirmAlarm} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 장기관리 */}
      {subTab === FN_TAB.LONGTERM && (
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center">
            <BellRing className="mr-2 text-orange-500" />장기 미접촉 알림 (3개월 이상)
          </h2>
          {longTermNoContactProfiles.length === 0 ? (
            <div className="text-gray-500 text-sm bg-white rounded-xl border p-4">없음</div>
          ) : (
            <div className="space-y-4">
              {longTermNoContactProfiles.map(p => (
                <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} isAlarmCard={true} onSnooze={handleSnooze} onConfirmAlarm={handleConfirmAlarm} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 그래프 & 필터 */}
      {subTab === FN_TAB.GRAPHS && (
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
                    <Cell key={`cell-pr-${i}`} fill={`url(#gp-${i})`} stroke="#fff" onClick={() => setActiveFilter({ type:'priority', value: entry.name })} style={{ cursor: 'pointer' }} />
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
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}
              />
            )}
          </section>

          {/* 세대별 */}
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
                    <Cell key={`cell-age-${i}`} fill={`url(#g-age-${i})`} stroke="#fff" onClick={() => setActiveFilter({ type:'age', value: entry.name })} style={{ cursor: 'pointer' }} />
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
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}
              />
            )}
          </section>

          {/* 전문영역 */}
          <section className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={useMemo(()=>{const c={};profiles.forEach(p=>{if(p.expertise)c[p.expertise]=(c[p.expertise]||0)+1});return Object.entries(c).map(([name,count])=>({name,count}))},[profiles])} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                <defs>
                  <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false}/>
                <Tooltip formatter={(v)=>`${v}명`} /><Legend />
                <Bar dataKey="count" fill="url(#gradient-expertise)">
                  {useMemo(()=>{const c={};profiles.forEach(p=>{if(p.expertise)c[p.expertise]=(c[p.expertise]||0)+1});return Object.entries(c).map(([name,count])=>({name,count}))},[profiles]).map((entry, i) => (
                    <Cell key={`ex-${i}`} onClick={() => setActiveFilter({ type:'expertise', value: entry.name })} style={{ cursor: 'pointer' }} />
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
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}
              />
            )}
          </section>

          {/* IT 기업 경력 */}
          <section className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={useMemo(()=>TARGET_KEYWORDS.map(k=>({name:k,count:profiles.filter(p=>p.career?.includes(k)).length})),[profiles])} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                <defs>
                  <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8}/><stop offset="95%" stopColor="#FF8042" stopOpacity={1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false}/>
                <Tooltip formatter={(v)=>`${v}명`} /><Legend />
                {useMemo(()=>TARGET_KEYWORDS.map(k=>({name:k,count:profiles.filter(p=>p.career?.includes(k)).length})),[profiles]) && (
                  <Bar dataKey="count" fill="url(#gradient-company)">
                    {TARGET_KEYWORDS.map((k, i) => (
                      <Cell key={`co-${i}`} onClick={() => setActiveFilter({ type:'company', value: k })} style={{ cursor: 'pointer' }} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
            {activeFilter.type === 'company' && (
              <FilterResultSection
                title={`"${activeFilter.value}" 필터 결과`}
                profiles={profiles.filter(p => p.career?.includes(activeFilter.value))}
                onUpdate={onUpdate} onDelete={onDelete}
                onClear={() => setActiveFilter({ type: null, value: null })}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
};

// ===============================
// Manage (페이지네이션 10개/페이지)
// ===============================
const ManagePage = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, accessCode, onSyncOne, onShowSimilar, onToggleStar, onShare }) => {
  const { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;

  const [searchTerm, setSearchTerm] = useState('');
  const PAGE_SIZE = 10;

  const totalPages = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE));
  const [page, setPage] = useState(1);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const sorted = useMemo(() => [...profiles].sort((a,b) => a.name.localeCompare(b.name)), [profiles]);
  const pageProfiles = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim(); if (!term) return [];
    const orConds = term.split(/\s+or\s+/i);
    return profiles.filter(p => orConds.some(cond => {
      const andKs = cond.split(/\s+and\s+/i).filter(Boolean);
      return andKs.every(keyword => {
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

  const blockIndex = Math.floor((page - 1) / 10);
  const blockStart = blockIndex * 10 + 1;
  const blockEnd = Math.min(blockStart + 9, totalPages);
  const pageNumbers = Array.from({length: blockEnd - blockStart + 1}, (_,i)=> blockStart + i);

  return (
    <div className="space-y-10">
      <section>
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div>
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="space-y-4">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
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
        <div className="space-y-4">
          {pageProfiles.map(profile => (
            <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} onShare={onShare}/>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-1">
            <button onClick={()=>setPage(1)} disabled={page===1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronsLeft className="w-5 h-5"/></button>
            <button onClick={()=>setPage(Math.max(1, blockStart-1))} disabled={blockStart===1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronLeft className="w-5 h-5"/></button>
            {pageNumbers.map(n => (
              <button key={n} onClick={()=>setPage(n)} className={`px-3 py-1 rounded border ${page===n ? 'bg-yellow-400 text-white border-yellow-400' : 'bg-white hover:bg-gray-50'}`}>{n}</button>
            ))}
            <button onClick={()=>setPage(Math.min(totalPages, blockEnd+1))} disabled={blockEnd===totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronRight className="w-5 h-5"/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronsRight className="w-5 h-5"/></button>
          </div>
        )}
      </section>
    </div>
  );
};

const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const handleUpload = () => {
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
      <h2 className="text-xl font-bold mb-4 flex items-center"><UploadCloud className="mr-2 text-yellow-500"/>엑셀로 일괄 등록</h2>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">정해진 양식의 엑셀 파일을 업로드하여 여러 프로필을 한 번에 추가할 수 있습니다.</p>
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내:</p>
          <p>2행부터 각 행을 한 프로필로 읽습니다.</p>
          <p>각 열의 C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보 로 입력됩니다.</p>
          <p className="font-bold mt-1">※ 기존 프로필과 이름이 겹칠 경우, 덮어쓰기됩니다.</p>
        </div>
        <input type="file" accept=".xlsx, .xls" onChange={(e)=>{ setFile(e.target.files[0]); setMessage(''); }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
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
  const [accessCode, setAccessCode] = useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [profiles, setProfiles]     = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');

  // 좌측 네비
  const [activeNav, setActiveNav] = useState(NAV.ALERTS);
  const [fnSubTab, setFnSubTab]   = useState(FN_TAB.RECOMMEND);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 유사 프로필 모달
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarBase, setSimilarBase] = useState(null);
  const [similarList, setSimilarList] = useState([]);

  // 폴더 상태
  const [folders, setFolders] = useState([]); // {id, name}
  const [selectedFolderId, setSelectedFolderId] = useState('ALL');

  // 폴더 선택 모달(모아보기 추가)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false);
  const [folderSelectTarget, setFolderSelectTarget] = useState(null); // profile object

  // 삭제 확인
  const [confirmState, setConfirmState] = useState({ show: false, profileId: null, name: '' });

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
  const [newEventDate, setNewEventDate] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  // 공유 URL 모드
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  // 외부 스크립트 로드
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

  // 폴더 컬렉션 ref
  const foldersCollectionRef = useMemo(() => {
    if (!accessCode) return null;
    return collection(db, 'artifacts', appId, 'public', 'folders', accessCode, 'items');
  }, [accessCode]);

  // 프로필 구독
  useEffect(() => {
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const q = query(profilesCollectionRef);
    const unsub = onSnapshot(q, (qs) => {
      const data = qs.docs.map(d => ({ ...d.data(), id: d.id }));
      setProfiles(data);
    });
    return () => unsub();
  }, [profilesCollectionRef]);

  // 폴더 구독
  useEffect(() => {
    if (!foldersCollectionRef) { setFolders([]); return; }
    const unsub = onSnapshot(foldersCollectionRef, (qs) => {
      const data = qs.docs.map(d => ({ id: d.id, ...(d.data()||{}) })).sort((a,b)=>a.name.localeCompare(b.name));
      setFolders(data);
    });
    return () => unsub();
  }, [foldersCollectionRef]);

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
      expertise: newExpertise || null, priority: newPriority || null, meetingRecord: newMeetingRecord || null, starred: false
    };
    try {
      await addDoc(profilesCollectionRef, profileData);
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewEventDate(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    } catch (err) { console.error("프로필 저장 오류: ", err); }
  };

  // 엑셀 일괄 추가
  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const nameToId = new Map(profiles.map(p => [p.name, p.id]));
    const CHUNK = 300; let updated=0, added=0;
    for (let i=0; i<newProfiles.length; i+=CHUNK) {
      const chunk = newProfiles.slice(i, i+CHUNK);
      const batch = writeBatch(db);
      chunk.forEach(p => {
        const existingId = nameToId.get(p.name);
        if (existingId) { batch.set(doc(profilesCollectionRef, existingId), p); updated++; }
        else { batch.set(doc(profilesCollectionRef), p); added++; }
      });
      await batch.commit();
    }
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const updateProfile = async (profileId, updatedData) => {
    const { id, ...dataToUpdate } = updatedData;
    await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
  };

  const requestDelete = (profileId, name) => setConfirmState({ show: true, profileId, name });
  const doDelete = async () => {
    if (confirmState.profileId && profilesCollectionRef) await deleteDoc(doc(profilesCollectionRef, confirmState.profileId));
    setConfirmState({ show: false, profileId: null, name: '' });
  };

  // Google 캘린더(비공개)
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
        } else { reject(new Error('Google 토큰을 발급받지 못했습니다.')); }
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  };
  const syncOneToCalendar = async (profile) => {
    if (!googleApiReady) { alert('Google API가 준비되지 않았습니다.'); return; }
    try { await ensureGoogleAuth(); } catch (e) { alert(e.message || 'Google 인증에 실패했습니다.'); return; }
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
        visibility: 'private',
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

  // 공유 링크
  const shareProfile = (profile) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => alert('공유 링크가 클립보드에 복사되었습니다.'),
      () => alert('링크 복사에 실패했습니다.')
    );
  };

  // 폴더 생성
  const createFolder = async (name) => {
    if (!foldersCollectionRef) return;
    await addDoc(foldersCollectionRef, { name, createdAt: new Date().toISOString() });
  };

  // 폴더 삭제(다중) + 프로필의 starFolders 정리
  const deleteFoldersWithCleanup = async (folderIds) => {
    if (!foldersCollectionRef || !profilesCollectionRef || folderIds.length === 0) return;
    // 삭제
    const CHUNK = 300;
    for (let i=0; i<folderIds.length; i+=CHUNK) {
      const batch = writeBatch(db);
      folderIds.slice(i, i+CHUNK).forEach(fid => {
        batch.delete(doc(foldersCollectionRef, fid));
      });
      await batch.commit();
    }
    // 프로필 starFolders에서 제거
    const affected = profiles.filter(p => Array.isArray(p.starFolders) && p.starFolders.some(fid => folderIds.includes(fid)));
    for (let i=0; i<affected.length; i+=CHUNK) {
      const batch = writeBatch(db);
      affected.slice(i, i+CHUNK).forEach(p => {
        const next = (p.starFolders||[]).filter(fid => !folderIds.includes(fid));
        batch.update(doc(profilesCollectionRef, p.id), { starFolders: next });
      });
      await batch.commit();
    }
  };

  // 주목중 토글 -> true 면 폴더 선택 모달, false 면 해제
  const toggleStar = async (profileOrId, flag) => {
    const p = typeof profileOrId === 'object' ? profileOrId : profiles.find(x => x.id === profileOrId);
    if (!p) return;
    if (flag) {
      // 켜기: 폴더 선택 모달
      setFolderSelectTarget(p);
      setFolderSelectOpen(true);
    } else {
      const ok = window.confirm('모아보기에서 제외하시겠습니까?');
      if (!ok) return;
      await updateProfile(p.id, { starred: false, starFolders: [] });
    }
  };

  // 폴더 선택 모달 저장
  const saveFolderSelection = async (folderIds) => {
    if (!folderSelectTarget) { setFolderSelectOpen(false); return; }
    await updateProfile(folderSelectTarget.id, { starred: true, starFolders: folderIds });
    setFolderSelectOpen(false);
    setFolderSelectTarget(null);
  };

  // 유사 프로필 모달 열기
  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 30);
    setSimilarBase(base);
    setSimilarList(sorted);
    setSimilarOpen(true);
  };

  // 상단 카운트
  const totalCount = profiles.length;
  const meetingCount = useMemo(() => profiles.filter(p => !!p.eventDate).length, [profiles]);

  const formState = { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord };

  // 공유 모드
  if (profileIdFromUrl && accessCodeFromUrl) return <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />;
  if (!accessCode) return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;

  const NavItem = ({ icon:Icon, label, active, onClick }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-md w-full text-left ${active ? 'bg-yellow-400 text-white' : 'hover:bg-gray-100'}`}>
      <Icon className="w-4 h-4" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 삭제 모달 */}
      <ConfirmModal show={confirmState.show} message={`'${confirmState.name}' 프로필을 정말로 삭제하시겠습니까?`} onConfirm={doDelete} onCancel={()=>setConfirmState({ show:false, profileId:null, name:'' })} />

      {/* 유사 프로필 모달 */}
      <SimilarModal open={similarOpen} onClose={() => setSimilarOpen(false)} baseProfile={similarBase} items={similarList} onUpdate={updateProfile} onDelete={requestDelete} accessCode={accessCode} onSyncOne={syncOneToCalendar} onToggleStar={toggleStar} onShare={shareProfile} />

      {/* 폴더 선택 모달 */}
      <FolderSelectModal open={folderSelectOpen} folders={folders} onClose={()=>{ setFolderSelectOpen(false); setFolderSelectTarget(null); }} onSave={saveFolderSelection} />

      {/* 헤더 */}
      <header className="flex items-center justify-between p-3 border-b bg-white sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button className="lg:hidden p-2 rounded hover:bg-gray-100" onClick={()=>setSidebarOpen(v=>!v)}><Menu className="w-5 h-5"/></button>
          <div className="flex items-center space-x-2">
            <Users className="text-yellow-500 w-6 h-6" />
            <h1 className="text-xl font-bold text-gray-800">프로필 대시보드</h1>
            <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-mono">{accessCode}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3">
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <div className="text-xs text-gray-500">총 등록된 프로필</div>
              <div className="text-2xl font-bold text-yellow-500 text-center">{totalCount}</div>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <div className="text-xs text-gray-500">미팅 진행 프로필</div>
              <div className="text-2xl font-bold text-yellow-500 text-center">{meetingCount}</div>
            </div>
          </div>
          {googleApiReady === false && <span className="hidden sm:block text-xs text-red-500">Google 연동 비활성화{googleError ? ` (${googleError})` : ''}</span>}
          {googleApiReady === true && (
            isGoogleSignedIn ? (
              <button onClick={() => { if (window.gapi?.client) window.gapi.client.setToken(null); setIsGoogleSignedIn(false); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600">Google 로그아웃</button>
            ) : (
              <button onClick={() => tokenClient?.requestAccessToken({ prompt: 'consent' })} className="text-sm font-semibold text-gray-600 hover:text-yellow-600">Google 로그인</button>
            )
          )}
          <button onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center"><LogOut className="w-4 h-4 mr-1.5" /> 로그아웃</button>
        </div>
      </header>

      {/* 레이아웃 */}
      <div className="flex">
        {/* 사이드바 */}
        <aside className={`fixed lg:static z-30 top-0 left-0 h-full lg:h-auto bg-white lg:bg-transparent border-r lg:border-0 w-64 p-3 pt-16 lg:pt-6 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex flex-col gap-1">
            <NavItem icon={Bell} label="알림" active={activeNav===NAV.ALERTS} onClick={()=>{setActiveNav(NAV.ALERTS); setSidebarOpen(false);}}/>
            <NavItem icon={SearchIcon} label="검색" active={activeNav===NAV.SEARCH} onClick={()=>{setActiveNav(NAV.SEARCH); setSidebarOpen(false);}}/>
            <NavItem icon={Star} label="주목 중인 프로필들" active={activeNav===NAV.STARRED} onClick={()=>{setActiveNav(NAV.STARRED); setSidebarOpen(false);}}/>
            <NavItem icon={Layers} label="Functions" active={activeNav===NAV.FUNCTIONS} onClick={()=>{setActiveNav(NAV.FUNCTIONS); setSidebarOpen(false);}}/>
            <NavItem icon={Users} label="프로필 관리" active={activeNav===NAV.MANAGE} onClick={()=>{setActiveNav(NAV.MANAGE); setSidebarOpen(false);}}/>
          </div>
        </aside>

        {/* 컨텐츠 */}
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-6xl mx-auto space-y-10">
            {activeNav===NAV.ALERTS && (
              <AlertsPage profiles={profiles} onUpdate={updateProfile} onDelete={requestDelete} accessCode={accessCode} onSyncOne={syncOneToCalendar} onShowSimilar={openSimilarModal} onToggleStar={toggleStar} onShare={shareProfile}/>
            )}

            {activeNav===NAV.SEARCH && (
              <SearchPage profiles={profiles} onUpdate={updateProfile} onDelete={requestDelete} accessCode={accessCode} onSyncOne={syncOneToCalendar} onShowSimilar={openSimilarModal} onToggleStar={toggleStar} onShare={shareProfile}/>
            )}

            {activeNav===NAV.STARRED && (
              <StarredPage
                profiles={profiles}
                folders={folders}
                selectedFolderId={selectedFolderId}
                setSelectedFolderId={setSelectedFolderId}
                onCreateFolder={createFolder}
                onDeleteFolders={deleteFoldersWithCleanup}
                onUpdate={updateProfile}
                onDelete={requestDelete}
                accessCode={accessCode}
                onSyncOne={syncOneToCalendar}
                onShowSimilar={openSimilarModal}
                onToggleStar={toggleStar}
                onShare={shareProfile}
              />
            )}

            {activeNav===NAV.FUNCTIONS && (
              <FunctionsPage profiles={profiles} onUpdate={updateProfile} onDelete={requestDelete} accessCode={accessCode} onSyncOne={syncOneToCalendar} onShowSimilar={openSimilarModal} onToggleStar={toggleStar} onShare={shareProfile} subTab={fnSubTab} setSubTab={setFnSubTab}/>
            )}

            {activeNav===NAV.MANAGE && (
              <ManagePage profiles={profiles} onUpdate={updateProfile} onDelete={requestDelete} handleFormSubmit={handleFormSubmit} handleBulkAdd={handleBulkAdd} formState={formState} setFormState={setFormState} accessCode={accessCode} onSyncOne={syncOneToCalendar} onShowSimilar={openSimilarModal} onToggleStar={toggleStar} onShare={shareProfile}/>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
