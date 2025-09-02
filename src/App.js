// src/App.js
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query, setLogLevel, updateDoc, writeBatch, getDoc, setDoc
} from 'firebase/firestore';

import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';

import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2, ShieldAlert, X, Save,
  UploadCloud, BellRing, Share2, CalendarPlus, AlertCircle, Star as StarIconFilled, StarOff,
  Menu, FolderPlus, FolderX, Folder, ChevronDown, ChevronRight, Layers, LineChart, Clock,
  Grid, Settings2, Bell, ChevronLeft, ChevronsLeft, ChevronRight as ChRight, ChevronsRight, MoreHorizontal
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

// 세로 사이드바 탭
const MAIN_TAB = {
  ALERTS: 'alerts',
  SEARCH: 'search',
  SPOTLIGHT: 'spotlight',
  FUNCTIONS: 'functions',
  MANAGE: 'manage'
};
const FUNC_SUB = {
  RECOMMEND: 'recommend',
  LONGTERM: 'longterm',
  GRAPHS: 'graphs'
};

// ===============================
// 시간/파싱 유틸
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
  const base = [p.name || '', p.expertise || '', p.career || '', p.otherInfo || ''].join(' ').toLowerCase();
  const words = base.replace(/[()\[\],./\\\-:~!@#$%^&*?'"`|]/g, ' ').split(/\s+/).filter(Boolean);
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
// 공용 모달들
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

const FolderSelectModal = ({ open, onClose, folders, selected, setSelected, onSave }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
        <h3 className="text-lg font-bold mb-3">폴더 선택</h3>
        <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {folders.order.map(id => {
            const f = folders.byId[id];
            const checked = selected.includes(id);
            return (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(prev => Array.from(new Set([...prev, id])));
                    else setSelected(prev => prev.filter(x => x !== id));
                  }}
                />
                <span className="flex items-center gap-2"><Folder size={16} className="text-yellow-500"/> {f.name}</span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200">취소</button>
          <button onClick={onSave} className="px-3 py-1.5 text-sm rounded-md bg-yellow-500 text-white hover:bg-yellow-600">저장</button>
        </div>
      </div>
    </div>
  );
};

// ✅ 새로 추가: 폴더 추가 모달
const AddFolderModal = ({ open, onClose, onSave }) => {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-lg font-bold mb-3">새 폴더 만들기</h3>
        <input
          className="w-full border rounded-md p-2"
          placeholder="폴더 이름"
          value={name}
          onChange={(e)=>setName(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200">취소</button>
          <button
            onClick={()=> onSave(name)}
            className="px-3 py-1.5 text-sm rounded-md bg-yellow-500 text-white hover:bg-yellow-600"
          >생성</button>
        </div>
      </div>
    </div>
  );
};

// ===============================
// 유사 프로필 모달
// ===============================
const SimilarModal = ({ open, onClose, baseProfile, items, onShowProfile, expanded, onBackInModal, actionHandlers }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {expanded && (
              <button onClick={onBackInModal} className="text-gray-600 hover:text-gray-900 mr-2">
                <ChevronLeft size={20} />
              </button>
            )}
            <h3 className="text-lg font-bold text-gray-800">
              유사 프로필 — <span className="text-yellow-600">{baseProfile?.name}</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
        </div>

        {!expanded && (
          <>
            <div className="text-sm text-gray-500 mb-3">유사도는 경력/전문영역/키워드/우선순위 등 텍스트 기반으로 계산돼요.</div>
            <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
              {items.length === 0 ? (
                <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map(({ profile, score }) => (
                    <button
                      key={profile.id}
                      onClick={() => onShowProfile(profile)}
                      className="text-left border rounded-lg p-3 bg-white shadow-sm hover:shadow-md transition"
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

        {expanded && (
          <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
            <div className="border rounded-lg p-4 relative">
              {/* 상단 우측 작은 액션 */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <button onClick={() => actionHandlers.onShare(expanded)} className="p-1 rounded hover:bg-gray-100" title="공유 링크 복사"><Share2 size={16} /></button>
                <button onClick={() => actionHandlers.onEdit(expanded)} className="p-1 rounded hover:bg-gray-100" title="수정"><Edit size={16} /></button>
                <button onClick={() => actionHandlers.onDelete(expanded)} className="p-1 rounded hover:bg-gray-100 text-red-600" title="삭제"><Trash2 size={16} /></button>
              </div>

              <div className="flex items-baseline gap-2">
                <h4 className="text-xl font-bold text-yellow-700">{expanded.name}</h4>
                {expanded.age ? <span className="text-sm text-gray-500">{expanded.age}세</span> : null}
              </div>
              {expanded.expertise && <div className="mt-1 text-sm font-semibold text-gray-600">{expanded.expertise}</div>}
              <div className="mt-3">
                <div className="text-xs font-semibold text-gray-500">경력</div>
                <div className="text-sm whitespace-pre-wrap">{expanded.career}</div>
              </div>
              {expanded.otherInfo && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-500">기타 정보</div>
                  <div className="text-sm whitespace-pre-wrap">{expanded.otherInfo}</div>
                </div>
              )}
              {expanded.meetingRecord && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-500">미팅 기록</div>
                  <div className="text-sm whitespace-pre-wrap">{expanded.meetingRecord}</div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => actionHandlers.onStar(expanded)} className={`text-xs font-semibold px-3 py-1 rounded-full ${expanded.starred ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                  {expanded.starred ? '주목중' : '모아보기'}
                </button>
                <button onClick={() => actionHandlers.onCalendar(expanded)} className="text-xs bg-blue-500 text-white font-semibold px-3 py-1 rounded-full hover:bg-blue-600">
                  {expanded.gcalEventId ? '캘린더 수정' : '캘린더 등록'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===============================
// 프로필 카드 (가로형, 우상단 액션)
// ===============================
const ProfileCard = ({
  profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm,
  accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink
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

  const handleShare = () => onShareLink(profile);
  const handleSyncClick = async () => { setSyncing(true); try { await onSyncOne(profile); } finally { setSyncing(false); } };

  return (
    <div className="bg-white rounded-xl shadow p-4 transition hover:shadow-md relative">
      {/* ✅ 우상단 작고 컴팩트한 액션 버튼들 */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          onClick={() => onToggleStarAskFolder(profile)}
          className="p-1 rounded hover:bg-gray-100"
          title={profile.starred ? '주목중 해제' : '모아보기'}
        >
          {profile.starred ? <StarIconFilled size={16} className="text-purple-600" /> : <StarOff size={16} className="text-gray-500" />}
        </button>
        <button onClick={() => onShowSimilar?.(profile)} className="p-1 rounded hover:bg-gray-100" title="유사 프로필">
          <Users size={16} />
        </button>
        <button onClick={handleSyncClick} disabled={syncing} className="p-1 rounded hover:bg-gray-100" title={profile.gcalEventId ? '캘린더 수정' : '캘린더 등록'}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus size={16} />}
        </button>
        <button onClick={handleShare} className="p-1 rounded hover:bg-gray-100" title="공유 링크">
          <Share2 size={16} />
        </button>
        <button onClick={() => setIsEditing(v => !v)} className="p-1 rounded hover:bg-gray-100" title={isEditing ? '편집 닫기' : '편집'}>
          <Edit size={16} />
        </button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="p-1 rounded hover:bg-red-50 text-red-600" title="삭제">
          <Trash2 size={16} />
        </button>
      </div>

      {/* 본문 (가독성 유지) */}
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between pr-24">
            <div className="flex items-baseline gap-2">
              <h3 className="font-bold text-yellow-600">{profile.name}</h3>
              <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
              {profile.expertise && <span className="text-xs text-gray-600 font-semibold px-2 py-0.5 rounded bg-gray-50 border">{profile.expertise}</span>}
            </div>
            {profile.priority && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${priorityColors[profile.priority] || 'bg-gray-100 text-gray-800'}`}>
                {profile.priority}
              </span>
            )}
          </div>

          <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{profile.career}</div>
          {profile.otherInfo && <div className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{profile.otherInfo}</div>}
          {profile.meetingRecord && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs font-semibold text-gray-500">미팅기록:</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{profile.meetingRecord}</p>
            </div>
          )}

          {isAlarmCard && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => onConfirmAlarm(profile.id)} className="text-xs bg-gray-200 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-300">확인</button>
              <button onClick={() => onSnooze(profile.id)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">3개월 후 다시 알림</button>
            </div>
          )}
        </div>
      </div>

      {/* 인라인 편집 */}
      {isEditing && (
        <div className="mt-4 border-t pt-3 space-y-2">
          <input name="name" value={editedProfile.name} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
          <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
          <textarea name="career" value={editedProfile.career} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-20" />
          <div className="grid grid-cols-2 gap-2">
            <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
            <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
          </div>
          <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
          <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" className="w-full p-2 border rounded text-sm h-20" />
          <div className="flex justify-end space-x-2">
            <button onClick={() => setIsEditing(false)} className="p-2 text-gray-500 hover:text-gray-800"><X size={20} /></button>
            <button onClick={handleSave} className="p-2 text-green-600 hover:text-green-800"><Save size={20} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

// ===============================
// 필터 결과 섹션
// ===============================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in mt-4">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            onUpdate={onUpdate}
            onDelete={onDelete}
            accessCode={accessCode}
            onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar}
            onToggleStarAskFolder={onToggleStarAskFolder}
            onShareLink={onShareLink}
          />
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

// ===============================
// 검색 탭
// ===============================
const SearchTab = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => {
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
    <section className="p-4">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accessCode={accessCode}
                onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar}
                onToggleStarAskFolder={onToggleStarAskFolder}
                onShareLink={onShareLink}
              />
            )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
          </div>
        </div>
      )}
    </section>
  );
};

// ===============================
// 주목 중 탭 (폴더링)
// ===============================
const SpotlightTab = ({
  profiles, folders, selectedFolder, setSelectedFolder,
  onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink,
  onOpenAddFolder, onDeleteFolders
}) => {

  const spotlightProfiles = useMemo(() => {
    return profiles.filter(p => {
      if (!p.starred) return false;
      const arr = Array.isArray(p.starredFolders) ? p.starredFolders : ['all'];
      return selectedFolder === 'all' ? true : arr.includes(selectedFolder);
    });
  }, [profiles, selectedFolder]);

  return (
    <section className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-bold">
          <StarIconFilled className="text-yellow-500" size={18} /> 주목 중인 프로필들
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAddFolder}
            className="text-xs px-2 py-1 rounded-md border bg-gray-50 hover:bg-gray-100 flex items-center gap-1"
          >
            <FolderPlus size={14}/> 폴더 추가
          </button>
          <button
            onClick={onDeleteFolders}
            className="text-xs px-2 py-1 rounded-md border bg-gray-50 hover:bg-gray-100 flex items-center gap-1"
          >
            <FolderX size={14}/> 폴더 삭제
          </button>
        </div>
      </div>

      {/* 폴더 칩 */}
      <div className="flex flex-wrap gap-2">
        {folders.order.map(id => {
          const f = folders.byId[id];
          const active = selectedFolder === id;
          return (
            <button
              key={id}
              onClick={() => setSelectedFolder(id)}
              className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-2 ${active ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <Folder size={14} className={active ? 'text-white' : 'text-yellow-500'} /> {f.name}
            </button>
          );
        })}
      </div>

      {/* 리스트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {spotlightProfiles.length === 0 ? (
          <div className="text-gray-500 p-4 text-sm">없음</div>
        ) : spotlightProfiles.map(p => (
          <ProfileCard
            key={p.id}
            profile={p}
            onUpdate={onUpdate}
            onDelete={onDelete}
            accessCode={accessCode}
            onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar}
            onToggleStarAskFolder={onToggleStarAskFolder}
            onShareLink={onShareLink}
          />
        ))}
      </div>
    </section>
  );
};

// ===============================
// 그래프 & 필터 (Functions > GRAPHS)
// ===============================
const GraphsPanel = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => {
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
      default: return [];
    }
  }, [profiles, activeFilter]);

  return (
    <section className="p-4 space-y-8">
      {/* 우선순위별 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><Layers size={18}/> 우선순위별 분포</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              <radialGradient id="gp-0"><stop offset="0%" stopColor="#FF4444" stopOpacity={0.7} /><stop offset="100%" stopColor="#FF4444" stopOpacity={1} /></radialGradient>
              <radialGradient id="gp-1"><stop offset="0%" stopColor="#FFBB28" stopOpacity={0.7} /><stop offset="100%" stopColor="#FFBB28" stopOpacity={1} /></radialGradient>
              <radialGradient id="gp-2"><stop offset="0%" stopColor="#00C49F" stopOpacity={0.7} /><stop offset="100%" stopColor="#00C49F" stopOpacity={1} /></radialGradient>
            </defs>
            <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
              {priorityData.map((entry, i) => (
                <Cell
                  key={`cell-pr-${i}`}
                  fill={`url(#gp-${i})`}
                  stroke="#fff"
                  onClick={() => setActiveFilter({ type: 'priority', value: entry.name })}
                  style={{ cursor: 'pointer' }}
                />
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
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStarAskFolder={onToggleStarAskFolder}
            onShareLink={onShareLink}
          />
        )}
      </section>

      {/* 세대별 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><Grid size={18}/> 세대별 분포</h2>
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
                <Cell
                  key={`cell-age-${i}`}
                  fill={`url(#g-age-${i})`}
                  stroke="#fff"
                  onClick={() => setActiveFilter({ type: 'age', value: entry.name })}
                  style={{ cursor: 'pointer' }}
                />
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
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar} onToggleStarAskFolder={onToggleStarAskFolder}
            onShareLink={onShareLink}
          />
        )}
      </section>
    </section>
  );
};

// ===============================
// 추천/장기관리 패널 (생략 없이 유지)
// ===============================
const RecommendPanel = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => {
  const recommendedProfiles = useMemo(() => {
    const now = new Date();
    const scoreOf = (p) => {
      const last = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const days = last ? Math.max(1, Math.floor((now - last) / (1000*60*60*24))) : 180;
      let score = Math.min(100, Math.round((days / 90) * 60)); // 0~60
      if (p.priority === '3') score += 20;
      const kw = TARGET_KEYWORDS.filter(k => (p.career||'').includes(k)).length;
      score += Math.min(kw * 5, 15);
      if (p.expertise) score += 5;
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (snoozeUntil && snoozeUntil > now) score = -1; // 제외
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
    <section className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-bold">
          <AlertCircle className="text-yellow-600" size={18}/> 추천 : 다시 들여다볼 프로필
        </div>
        <div className="text-xs text-gray-500 hidden md:block">최근 팔로업/스누즈/우선순위/IT 키워드 반영</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              onToggleStarAskFolder={onToggleStarAskFolder}
              onShareLink={onShareLink}
            />
          ))
        )}
      </div>
    </section>
  );
};

const LongtermPanel = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => {
  const longTermNoContactProfiles = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const longTerm = [];
    profiles.forEach(p => {
      const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil  = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (lastContact && lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) {
        longTerm.push(p);
      }
    });
    return longTerm.sort((a,b) => (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0)));
  }, [profiles]);

  return (
    <section className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BellRing className="text-orange-500" size={18}/> 장기 미접촉 알림 (3개월 이상)
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              onToggleStarAskFolder={onToggleStarAskFolder}
              onShareLink={onShareLink}
            />
          ))
        )}
      </div>
    </section>
  );
};

// ===============================
// 알림 탭
// ===============================
const AlertsTab = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => {
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
    <section className="p-4 space-y-8">
      {todayProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calendar className="text-red-500" size={18}/> 오늘의 일정</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {todayProfiles.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accessCode={accessCode}
                onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar}
                onToggleStarAskFolder={onToggleStarAskFolder}
                onShareLink={onShareLink}
              />
            ))}
          </div>
        </section>
      )}

      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Zap className="text-blue-500" size={18}/> 다가오는 일정</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {upcomingProfiles.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accessCode={accessCode}
                onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar}
                onToggleStarAskFolder={onToggleStarAskFolder}
                onShareLink={onShareLink}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
};

// ===============================
// 관리 탭 (페이징 + 엑셀 업로드)
// ===============================
const Pagination = ({ totalPages, currentPage, setCurrentPage }) => {
  if (totalPages <= 1) return null;
  const pages = Array.from({length: totalPages}, (_,i)=>i+1);
  const goto = (n) => { if (n<1 || n>totalPages) return; setCurrentPage(n); };
  return (
    <nav className="mt-8 flex flex-wrap items-center gap-2 justify-center">
      <button onClick={() => goto(1)} className="px-2 py-1 border rounded hover:bg-gray-50"><ChevronsLeft size={16}/></button>
      <button onClick={() => goto(currentPage-1)} className="px-2 py-1 border rounded hover:bg-gray-50"><ChevronLeft size={16}/></button>
      {pages.map(n => (
        <button
          key={n}
          onClick={() => goto(n)}
          className={`px-3 py-1 border rounded ${currentPage===n?'bg-yellow-400 text-white border-yellow-400':'hover:bg-gray-50'}`}
        >
          {n}
        </button>
      ))}
      <button onClick={() => goto(currentPage+1)} className="px-2 py-1 border rounded hover:bg-gray-50"><ChRight size={16}/></button>
      <button onClick={() => goto(totalPages)} className="px-2 py-1 border rounded hover:bg-gray-50"><ChevronsRight size={16}/></button>
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

const ManageTab = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, accessCode, onSyncOne, onShowSimilar, onToggleStarAskFolder, onShareLink }) => {
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
    <section className="p-4 space-y-8">
      {/* 검색 */}
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
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  accessCode={accessCode}
                  onSyncOne={onSyncOne}
                  onShowSimilar={onShowSimilar}
                  onToggleStarAskFolder={onToggleStarAskFolder}
                  onShareLink={onShareLink}
                />
              )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      {/* 추가 폼 */}
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

      {/* 전체 목록 */}
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {currentProfiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onToggleStarAskFolder={onToggleStarAskFolder}
              onShareLink={onShareLink}
            />
          ))}
        </div>
        <Pagination totalPages={Math.ceil(profiles.length/10)} currentPage={currentPage} setCurrentPage={setCurrentPage} />
      </section>
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
  const [activeMain, setActiveMain] = useState(MAIN_TAB.ALERTS);
  const [activeFuncSub, setActiveFuncSub] = useState(FUNC_SUB.RECOMMEND);
  const [functionsOpen, setFunctionsOpen] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  // 모바일 사이드바
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Similar modal
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarBase, setSimilarBase] = useState(null);
  const [similarList, setSimilarList] = useState([]);
  const [similarExpanded, setSimilarExpanded] = useState(null);

  // Folder select modal (모아보기 저장)
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalTarget, setFolderModalTarget] = useState(null);
  const [folderModalSelected, setFolderModalSelected] = useState(['all']);

  // ✅ AddFolderModal
  const [addFolderOpen, setAddFolderOpen] = useState(false);

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

  // Firestore refs
  const profilesCollectionRef = useMemo(() => {
    if (!accessCode) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  // meta/{accessCode}
  const metaDocRef = useMemo(() => {
    if (!accessCode) return null;
    return doc(db, 'artifacts', appId, 'meta', accessCode);
  }, [accessCode]);

  // 폴더 메타 상태
  const META_DEFAULT = useMemo(()=>({
    byId: { all: { id: 'all', name: '전체', order: 0 } },
    order: ['all'],
  }), []);
  const [folders, setFolders] = useState(META_DEFAULT);
  const [selectedFolder, setSelectedFolder] = useState('all');

  const normalizeFolders = useCallback((sf) => {
    if (!sf || typeof sf !== 'object') return META_DEFAULT;
    const byId = sf.byId && typeof sf.byId === 'object' ? sf.byId : {};
    const order = Array.isArray(sf.order) ? sf.order : [];
    const fixedById = { ...byId, all: byId.all || { id: 'all', name: '전체', order: 0 } };
    const fixedOrder = Array.from(new Set(['all', ...order.filter(id => fixedById[id])]));
    fixedOrder.forEach((id, i) => { fixedById[id] = { ...fixedById[id], order: i }; });
    return { byId: fixedById, order: fixedOrder };
  }, [META_DEFAULT]);

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

  // 폴더 메타 로드
  useEffect(() => {
    if (!metaDocRef) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(metaDocRef);
        if (!cancelled) {
          if (snap.exists()) {
            const fixed = normalizeFolders(snap.data()?.starredFolders);
            setFolders(fixed);
            if (JSON.stringify(snap.data()?.starredFolders) !== JSON.stringify(fixed)) {
              await setDoc(metaDocRef, { starredFolders: fixed }, { merge: true });
            }
          } else {
            await setDoc(metaDocRef, { starredFolders: META_DEFAULT }, { merge: true });
            if (!cancelled) setFolders(META_DEFAULT);
          }
        }
      } catch (e) {
        console.error('meta load error', e);
        if (!cancelled) setFolders(META_DEFAULT);
      }
    })();
    return () => { cancelled = true; };
  }, [metaDocRef, META_DEFAULT, normalizeFolders]);

  // 로그인
  const handleLogin = (code) => {
    setAccessCode(code);
    if (typeof window !== 'undefined') localStorage.setItem('profileDbAccessCode', code);
  };

  // 프로필 추가
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

  // 일괄 추가
  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const map = new Map(profiles.map(p => [p.name, p.id]));
    const CHUNK = 300;
    let updated=0, added=0;
    for (let i=0; i<newProfiles.length; i+=CHUNK) {
      const batch = writeBatch(db);
      const slice = newProfiles.slice(i, i+CHUNK);
      slice.forEach(p => {
        const existingId = map.get(p.name);
        const payload = { starred: p.starred ?? false, starredFolders: p.starredFolders ?? [], ...p };
        if (existingId) { batch.set(doc(profilesCollectionRef, existingId), payload); updated++; }
        else { batch.set(doc(profilesCollectionRef), payload); added++; }
      });
      await batch.commit();
    }
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const handleUpdate = async (profileId, updatedData) => {
    if (!profilesCollectionRef) return;
    const { id, ...dataToUpdate } = updatedData;
    await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
  };

  const [confirmState, setConfirmState] = useState({ show: false, profileId: null, profileName: '' });
  const handleDeleteRequest = (profileId, profileName) => setConfirmState({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (confirmState.profileId && profilesCollectionRef) await deleteDoc(doc(profilesCollectionRef, confirmState.profileId));
    setConfirmState({ show: false, profileId: null, profileName: '' });
  };

  // 캘린더
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
  const handleShareLink = (profile) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => alert('공유 링크가 클립보드에 복사되었습니다.'),
      () => alert('링크 복사에 실패했습니다.')
    );
  };

  // 모아보기 토글 + 폴더 선택 모달
  const handleToggleStarAskFolder = async (profile) => {
    if (!profilesCollectionRef) return;
    const ref = doc(profilesCollectionRef, profile.id);
    if (profile.starred) {
      if (!window.confirm('모아보기에서 제외하시겠습니까?')) return;
      await updateDoc(ref, { starred: false, starredFolders: [] });
    } else {
      setFolderModalTarget(profile);
      const preset = Array.isArray(profile.starredFolders) && profile.starredFolders.length ? profile.starredFolders : ['all'];
      setFolderModalSelected(preset);
      setFolderModalOpen(true);
    }
  };
  const saveFoldersForTarget = async () => {
    if (!folderModalTarget || !profilesCollectionRef) return;
    const ref = doc(profilesCollectionRef, folderModalTarget.id);
    const uniq = Array.from(new Set(folderModalSelected));
    await updateDoc(ref, { starred: true, starredFolders: uniq });
    setFolderModalOpen(false);
    setFolderModalTarget(null);
  };

  // ✅ 폴더 추가(모달) / 삭제
  const addFolder = async (name) => {
    const n = (name || '').trim();
    if (!n || !metaDocRef) return;
    const exists = Object.values(folders.byId).some(f => f.name === n);
    const safeName = exists ? `${n} (${Date.now().toString().slice(-4)})` : n;
    const id = `f_${Date.now()}`;
    const next = {
      byId: { ...folders.byId, [id]: { id, name: safeName, order: folders.order.length } },
      order: [...folders.order, id],
    };
    // Firestore 반영 + 로컬 즉시 반영
    await setDoc(metaDocRef, { starredFolders: next }, { merge: true });
    setFolders(next);
  };
  const deleteFolders = async () => {
    if (!metaDocRef) return;
    const choices = folders.order.filter(id => id !== 'all');
    if (choices.length === 0) { alert('삭제할 폴더가 없습니다.'); return; }
    const picked = window.prompt(`삭제할 폴더 id를 쉼표로 입력하세요:\n${choices.join(', ')}`);
    if (!picked) return;
    const ids = picked.split(',').map(s=>s.trim()).filter(Boolean).filter(id => choices.includes(id));
    if (ids.length === 0) return;
    if (!window.confirm(`정말 삭제하시겠습니까?\n(${ids.join(', ')})`)) return;

    const nextById = { ...folders.byId };
    let nextOrder = folders.order.slice();
    ids.forEach(id => { delete nextById[id]; nextOrder = nextOrder.filter(x => x !== id); });
    nextOrder.forEach((id,i)=>{ nextById[id] = { ...nextById[id], order: i }; });
    const next = { byId: nextById, order: nextOrder };

    if (profilesCollectionRef) {
      const batch = writeBatch(db);
      profiles.forEach(p => {
        if (Array.isArray(p.starredFolders) && p.starredFolders.some(x => ids.includes(x))) {
          const newArr = p.starredFolders.filter(x => !ids.includes(x));
          batch.update(doc(profilesCollectionRef, p.id), { starredFolders: newArr });
        }
      });
      await batch.commit();
    }

    await setDoc(metaDocRef, { starredFolders: next }, { merge: true });
    setFolders(next);
    if (ids.includes(selectedFolder)) setSelectedFolder('all');
  };

  // 유사 모달
  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 20);
    setSimilarBase(base);
    setSimilarList(sorted);
    setSimilarExpanded(null);
    setSimilarOpen(true);
  };

  // 공유 모드
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  // 렌더
  if (profileIdFromUrl && accessCodeFromUrl) {
    return <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />;
  }
  if (!accessCode) {
    return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;
  }

  const totalCount = profiles.length;
  const meetingCount = useMemo(() => profiles.filter(p => !!p.eventDate).length, [profiles]);

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      {(showDeleteConfirm.show || confirmState.show) && (
        <ConfirmationModal
          message={`'${(showDeleteConfirm.profileName || confirmState.profileName) || ''}' 프로필을 정말로 삭제하시겠습니까?`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmState({ show: false, profileId: null, profileName: '' })}
        />
      )}

      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="flex items-center justify-between p-3 md:p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:bg-gray-100"
              aria-label="Open menu"
            >
              <Menu/>
            </button>

            <div className="flex items-center space-x-3">
              <Users className="text-yellow-500 w-7 h-7" />
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">프로필 대시보드</h1>
              <span className="text-xs md:text-sm bg-gray-200 px-2 md:px-3 py-1 rounded-full font-mono">{accessCode}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3">
              <div className="bg-white p-3 rounded-xl shadow-sm border">
                <h3 className="text-xs font-medium text-gray-500">총 등록된 프로필</h3>
                <p className="text-xl font-bold text-yellow-500 mt-0.5 text-right">{totalCount}</p>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm border">
                <h3 className="text-xs font-medium text-gray-500">미팅 진행 프로필</h3>
                <p className="text-xl font-bold text-yellow-500 mt-0.5 text-right">{meetingCount}</p>
              </div>
            </div>

            {googleApiReady === false && (
              <span className="hidden md:block text-xs text-red-500">GCal 비활성{googleError ? ` (${googleError})` : ''}</span>
            )}
            {googleApiReady === true && (
              isGoogleSignedIn ? (
                <button
                  onClick={() => { if (window.gapi?.client) window.gapi.client.setToken(null); setIsGoogleSignedIn(false); }}
                  className="hidden md:block text-sm font-semibold text-gray-600 hover:text-yellow-600"
                >
                  Google 로그아웃
                </button>
              ) : (
                <button
                  onClick={() => tokenClient?.requestAccessToken({ prompt: 'consent' })}
                  className="hidden md:block text-sm font-semibold text-gray-600 hover:text-yellow-600"
                >
                  Google 로그인
                </button>
              )
            )}

            <button onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <div className="flex">
        {/* 사이드바 */}
        <aside
          className={`
            fixed md:static z-40 top-0 left-0 h-full md:h-[calc(100vh-57px)] md:top-auto
            w-72 md:w-64 bg-white border-r transform transition-transform duration-200
            ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          `}
        >
          <div className="md:hidden p-3 flex justify-end">
            <button onClick={() => setMobileNavOpen(false)} className="text-sm px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200">닫기</button>
          </div>

          <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100%-44px)] md:h-full">
            <button
              onClick={() => { setActiveMain(MAIN_TAB.ALERTS); setMobileNavOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.ALERTS?'bg-yellow-100 text-yellow-800':'text-gray-700'}`}
            >
              <Bell size={16}/> 알림
            </button>
            <button
              onClick={() => { setActiveMain(MAIN_TAB.SEARCH); setMobileNavOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.SEARCH?'bg-yellow-100 text-yellow-800':'text-gray-700'}`}
            >
              <Search size={16}/> 검색
            </button>
            <button
              onClick={() => { setActiveMain(MAIN_TAB.SPOTLIGHT); setMobileNavOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.SPOTLIGHT?'bg-yellow-100 text-yellow-800':'text-gray-700'}`}
            >
              <StarIconFilled size={16}/> 주목 중인 프로필들
            </button>

            <div className="mt-3">
              <button
                onClick={() => setFunctionsOpen(v=>!v)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.FUNCTIONS?'bg-yellow-100 text-yellow-800':'text-gray-700'}`}
              >
                <span className="flex items-center gap-2"><Settings2 size={16}/> Functions</span>
                {functionsOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
              </button>
              {functionsOpen && (
                <div className="ml-6 mt-1 space-y-1">
                  <button
                    onClick={() => { setActiveMain(MAIN_TAB.FUNCTIONS); setActiveFuncSub(FUNC_SUB.RECOMMEND); setMobileNavOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.FUNCTIONS && activeFuncSub===FUNC_SUB.RECOMMEND ? 'bg-yellow-100 text-yellow-800' : 'text-gray-700'}`}
                  >
                    <AlertCircle size={14}/> 추천
                  </button>
                  <button
                    onClick={() => { setActiveMain(MAIN_TAB.FUNCTIONS); setActiveFuncSub(FUNC_SUB.LONGTERM); setMobileNavOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.FUNCTIONS && activeFuncSub===FUNC_SUB.LONGTERM ? 'bg-yellow-100 text-yellow-800' : 'text-gray-700'}`}
                  >
                    <Clock size={14}/> 장기관리
                  </button>
                  <button
                    onClick={() => { setActiveMain(MAIN_TAB.FUNCTIONS); setActiveFuncSub(FUNC_SUB.GRAPHS); setMobileNavOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.FUNCTIONS && activeFuncSub===FUNC_SUB.GRAPHS ? 'bg-yellow-100 text-yellow-800' : 'text-gray-700'}`}
                  >
                    <LineChart size={14}/> 그래프&필터
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => { setActiveMain(MAIN_TAB.MANAGE); setMobileNavOpen(false); }}
              className={`mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-yellow-50 ${activeMain===MAIN_TAB.MANAGE?'bg-yellow-100 text-yellow-800':'text-gray-700'}`}
            >
              <Layers size={16}/> 프로필 관리
            </button>
          </nav>
        </aside>

        {/* 메인 컨텐트 */}
        <main className="flex-1 p-3 md:p-6">
          {activeMain === MAIN_TAB.ALERTS && (
            <AlertsTab
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
            />
          )}

          {activeMain === MAIN_TAB.SEARCH && (
            <SearchTab
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
            />
          )}

          {activeMain === MAIN_TAB.SPOTLIGHT && (
            <SpotlightTab
              profiles={profiles}
              folders={folders}
              selectedFolder={selectedFolder}
              setSelectedFolder={setSelectedFolder}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
              onOpenAddFolder={() => setAddFolderOpen(true)}
              onDeleteFolders={deleteFolders}
            />
          )}

          {activeMain === MAIN_TAB.FUNCTIONS && activeFuncSub === FUNC_SUB.RECOMMEND && (
            <RecommendPanel
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
            />
          )}
          {activeMain === MAIN_TAB.FUNCTIONS && activeFuncSub === FUNC_SUB.LONGTERM && (
            <LongtermPanel
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
            />
          )}
          {activeMain === MAIN_TAB.FUNCTIONS && activeFuncSub === FUNC_SUB.GRAPHS && (
            <GraphsPanel
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
            />
          )}

          {activeMain === MAIN_TAB.MANAGE && (
            <ManageTab
              profiles={profiles}
              onUpdate={handleUpdate}
              onDelete={handleDeleteRequest}
              handleFormSubmit={handleFormSubmit}
              handleBulkAdd={handleBulkAdd}
              formState={{ newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord }}
              setFormState={{ setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord }}
              accessCode={accessCode}
              onSyncOne={handleSyncOneToCalendar}
              onShowSimilar={openSimilarModal}
              onToggleStarAskFolder={handleToggleStarAskFolder}
              onShareLink={handleShareLink}
            />
          )}
        </main>
      </div>

      {/* 유사 모달 */}
      <SimilarModal
        open={similarOpen}
        onClose={() => setSimilarOpen(false)}
        baseProfile={similarBase}
        items={similarList}
        expanded={similarExpanded}
        onShowProfile={(p) => setSimilarExpanded(p)}
        onBackInModal={() => setSimilarExpanded(null)}
        actionHandlers={{
          onShare: handleShareLink,
          onEdit: () => alert('카드 내 인라인 편집을 사용하세요. (✏️ 아이콘)'),
          onDelete: (p) => handleDeleteRequest(p.id, p.name),
          onStar: handleToggleStarAskFolder,
          onCalendar: handleSyncOneToCalendar
        }}
      />

      {/* 폴더 선택 모달 */}
      <FolderSelectModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        folders={folders}
        selected={folderModalSelected}
        setSelected={setFolderModalSelected}
        onSave={saveFoldersForTarget}
      />

      {/* ✅ 폴더 추가 모달 */}
      <AddFolderModal
        open={addFolderOpen}
        onClose={() => setAddFolderOpen(false)}
        onSave={async (name) => { await addFolder(name); setAddFolderOpen(false); }}
      />
    </div>
  );
}
