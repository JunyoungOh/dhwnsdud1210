/* ===== App.js (패치 적용 완전체) ===== */
import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  updateDoc, writeBatch, getDoc, getDocs, setLogLevel, limit, setDoc
} from 'firebase/firestore';

import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';

import {
  Users, LogOut, Search as SearchIcon, Calendar, Zap, UserPlus, KeyRound, Loader2,
  Edit, Trash2, ShieldAlert, X, Save, UploadCloud, BellRing, Share2,
  CalendarPlus, AlertCircle, Star, StarOff, Menu,
  Layers, LineChart as LineChartIcon, Clock, Sparkles, ExternalLink,
  ChevronDown
} from 'lucide-react';

import { parseNaturalQuery, matchProfileWithNL } from './utils/nlp';
import { MeetingsPage } from './utils/meetings';

import AuthGate, { useUserCtx } from './auth/AuthGate';
import UserAdmin from './admin/UserAdmin';

/* === 새 UI 컴포넌트들 === */
import Btn from './components/ui/Btn';
import Badge from './components/ui/Badge';
import SkeletonRow from './components/ui/SkeletonRow';
import { toast } from './components/ui/Toast';

// ============ 환경 변수 ============
const GOOGLE_API_KEY   = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const DISCOVERY_DOCS   = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES           = "https://www.googleapis.com/auth/calendar.events";

// ============ Firebase ============
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

// === DevTools 진단용 전역 노출 (디버그 전용) ===
if (typeof window !== 'undefined') {
  window.__AUTH__ = auth;
  window.__DB__   = db;
  window.__FIRE__ = {
    db,
    auth,
    doc,
    collection,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    updateDoc,
    setDoc,
    addDoc,
    deleteDoc,
    writeBatch,
    limit,
  };
  console.log('[debug] window.__FIRE__ ready =', !!window.__FIRE__);
}

const TZ = 'Asia/Seoul';
const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

/* === 관리자 여부 공용 훅 (개선본) === */
function useIsAdmin() {
  const ctx = useUserCtx?.();

  const [uid, setUid] = React.useState(null);
  const [fireAdmin, setFireAdmin] = React.useState(null); // null=미확인
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid || null);
    });
    return () => off();
  }, []);

  React.useEffect(() => {
    setErr('');
    if (!uid) { setFireAdmin(null); return; }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const v = snap.data()?.isAdmin;
        setFireAdmin(v === true || v === 'true');
      },
      (e) => {
        setFireAdmin(false);
        setErr(e?.code ? `${e.code}: ${e.message}` : 'users 문서를 읽을 수 없습니다.');
      }
    );
    return () => unsub();
  }, [uid]);

  const ctxAdmin = !!(ctx?.isAdmin || ctx?.profile?.isAdmin);

  const isAdmin = Boolean(ctxAdmin || fireAdmin === true);
  const isLoading = uid === null || (!ctxAdmin && fireAdmin === null);

  return { isAdmin, isLoading, uid, ctxAdmin, fireAdmin, err };
}

// ============ 유틸 ============
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
  let best = null; let m;
  const reA = /\((\d{2})\.(\d{2})\.(\d{2})\)\s*(?:(AM|PM|오전|오후)?\s*(\d{1,2})(?::(\d{2}))?(?:\s*시)?(?:\s*(\d{1,2})\s*분?)?)?/gi;
  while ((m = reA.exec(text)) !== null) {
    const year  = 2000 + parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day   = parseInt(m[3], 10);
    let hadTime = false, hour = 0, minute = 0;
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
    let hadTime = false, hour = 0, minute = 0;
    if (m[4]) { hadTime = true; hour = parseInt(m[4], 10); minute = parseInt(m[5] || '0', 10); }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }
  return best ? best : null;
}
function tokenizeProfile(p) {
  const base = [p.name||'', p.expertise||'', p.career||'', p.otherInfo||''].join(' ').toLowerCase();
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
  const ta = tokenizeProfile(a); const tb = tokenizeProfile(b);
  let score = jaccard(ta, tb) * 100;
  if (a.priority && b.priority && a.priority === b.priority) score += 6;
  const ak = TARGET_KEYWORDS.filter(k => (a.career||'').includes(k));
  const bk = TARGET_KEYWORDS.filter(k => (b.career||'').includes(k)).filter(Boolean);
  score += Math.min(ak.filter(k => bk.includes(k)).length * 6, 18);
  if (a.expertise && b.expertise && a.expertise === b.expertise) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ======== 경로 자동 탐지 (기존 구조 고정) ========
function buildPathCandidates(accessCode, aid) {
  return [
    ['artifacts', aid, 'public', 'data', accessCode],
  ];
}

// ============ UI 컴포넌트 ============
const ConfirmationModal = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
      <div className="text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500" aria-hidden />
        <h3 className="mt-4 text-lg font-medium text-gray-900">확인</h3>
        <div className="mt-2 text-sm text-gray-500"><p>{message}</p></div>
      </div>
      <div className="mt-6 flex justify-center gap-4">
        <Btn variant="subtle" onClick={onCancel}>취소</Btn>
        <Btn variant="danger" onClick={onConfirm}>확인</Btn>
      </div>
    </div>
  </div>
);

/* --- 로그인 화면 --- */
const LoginScreen = ({ onLogin, onLogout, isAuthed }) => {
  const [codeInput, setCodeInput] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); if (codeInput.trim()) onLogin(codeInput.trim()); };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <Users className="mx-auto text-yellow-400 w-12 h-12" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold text-gray-800">프로필 대시보드 접속</h2>
          <p className="mt-2 text-sm text-gray-500">데이터를 불러올 접속 코드를 입력하세요.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden />
            <input
              type="text"
              placeholder="Access Code"
              className="w-full pl-10 pr-3 py-3 border rounded-lg"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
          </div>
          <div>
            <Btn as="button" type="submit" className="w-full" variant="primary">
              데이터 불러오기
            </Btn>
          </div>
        </form>

        {isAuthed && (
          <div className="mt-4 text-center">
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              title="다른 계정으로 로그인하기"
            >
              <LogOut size={16} aria-hidden /> 로그아웃 (다른 계정으로 로그인)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ProfileCard = ({
  profile, onUpdate, onDelete,
  accessCode, onSyncOne, onShowSimilar, onToggleStar,
  renderFooterLeft
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setEditedProfile(profile); }, [profile]);

  const priorityTone = {
    '3': 'danger',
    '2': 'warning',
    '1': 'success',
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
  };

  const handleSave = async () => {
    const parsed = parseDateTimeFromRecord(editedProfile.meetingRecord);
    const eventDate = parsed ? new Date(parsed.date).toISOString() : null;
    const payload = {
      name: editedProfile.name || '',
      career: editedProfile.career || '',
      age: editedProfile.age ? Number(editedProfile.age) : null,
      otherInfo: editedProfile.otherInfo || '',
      expertise: editedProfile.expertise || '',
      priority: editedProfile.priority || '',
      meetingRecord: editedProfile.meetingRecord || '',
      eventDate,
    };
    try {
      await onUpdate(profile.id, payload);
      setIsEditing(false);
      (toast.success?.('프로필이 저장되었습니다.') ?? toast('프로필이 저장되었습니다.'));
    } catch (e) {
      console.error('프로필 저장 실패:', e);
      (toast.error?.('프로필 저장 중 오류가 발생했습니다.') ?? toast('프로필 저장 중 오류가 발생했습니다.'));
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => (toast.success?.('공유 링크가 복사되었습니다.') ?? toast('공유 링크가 복사되었습니다.')),
      () => (toast.error?.('링크 복사에 실패했습니다.') ?? toast('링크 복사에 실패했습니다.'))
    );
  };

  const handleSyncClick = async () => {
    if (!onSyncOne) return;
    setSyncing(true);
    try {
      await onSyncOne(profile);
    } finally {
      setSyncing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl shadow border p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <input name="name" value={editedProfile.name || ''} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
            <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
            <textarea name="career" value={editedProfile.career || ''} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-24" />
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
              <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
            </div>
            <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
            <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" className="w-full p-2 border rounded text-sm h-20" />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Btn variant="subtle" onClick={() => setIsEditing(false)}><X size={18} /> 취소</Btn>
          <Btn variant="success" onClick={handleSave}><Save size={18} /> 저장</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow border p-4 relative flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="font-bold text-yellow-600 text-lg">{profile.name}</h3>
          {profile.age && <span className="text-sm text-gray-500">{profile.age}세</span>}
          {profile.priority && (
            <Badge tone={priorityTone[profile.priority] || 'neutral'}>
              {profile.priority}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button title={profile.starred ? '주목중' : '모아보기'}
            onClick={() => onToggleStar?.(profile.id, !profile.starred)}
            className={`p-1.5 rounded-full ${profile.starred ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {profile.starred ? <Star size={14}/> : <StarOff size={14}/>}
          </button>
          <button onClick={() => onShowSimilar?.(profile)} title="유사 프로필" className="p-1.5 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
            <Layers size={14}/>
          </button>
          <button onClick={handleShare} title="공유 링크 복사" className="p-1.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200">
            <Share2 size={14}/>
          </button>
          <button onClick={() => setIsEditing(true)} title="수정" className="p-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100">
            <Edit size={14}/>
          </button>
          <button onClick={() => onDelete(profile.id, profile.name)} title="삭제" className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100">
            <Trash2 size={14}/>
          </button>
        </div>
      </div>

      {profile.expertise && <p className="text-sm font-semibold text-gray-600 mt-1">{profile.expertise}</p>}
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{profile.career}</p>
      {profile.otherInfo && <p className="text-xs text-gray-500 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
      {profile.meetingRecord && (
        <div className="pt-2 border-t">
          <p className="text-xs font-semibold text-gray-500">미팅기록:</p>
          <p className="text-xs text-gray-600 whitespace-pre-wrap">{profile.meetingRecord}</p>
        </div>
      )}

      {/* 하단 바 */}
      <div className="mt-2 pt-2 border-t flex items-center justify-between">
        <div className="flex items-center gap-2">
          {typeof renderFooterLeft === 'function' ? renderFooterLeft() : null}
        </div>
        <div className="flex items-center gap-3">
          {profile.gcalEventId ? (
            <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <ExternalLink size={14}/> Google Calendar
            </a>
          ) : <span className="text-xs text-gray-400">캘린더 미연동</span>}
          <Btn size="xs" variant="primary" onClick={handleSyncClick} disabled={syncing}>
            {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CalendarPlus className="w-3 h-3 mr-1" />}
            {profile.gcalEventId ? '캘린더 수정' : '캘린더 등록'}
          </Btn>
        </div>
      </div>
    </div>
  );
};

const AlertsPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const tomorrowStart = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() + 1); return d; }, [todayStart]);
  const threeDaysLater = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() + 4); return d; }, [todayStart]);

  const todayProfiles = useMemo(() => (
    profiles.filter(p => p.eventDate && new Date(p.eventDate) >= todayStart && new Date(p.eventDate) < tomorrowStart)
            .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate))
  ), [profiles, todayStart, tomorrowStart]);

  const upcomingProfiles = useMemo(() => (
    profiles.filter(p => p.eventDate && new Date(p.eventDate) > now && new Date(p.eventDate) < threeDaysLater)
            .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate))
  ), [profiles, now, threeDaysLater]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" aria-hidden />오늘의 일정</h2>
        {todayProfiles.length === 0 ? <div className="text-sm text-gray-500">없음</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {todayProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" aria-hidden />다가오는 일정</h2>
        {upcomingProfiles.length === 0 ? <div className="text-sm text-gray-500">없음</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const SearchPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const advancedResults = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const orConditions = term.split(/\s+or\s+/i);

    return profiles.filter(p => orConditions.some(cond => {
      const andKeywords = cond.split(/\s+and\s+/i).filter(Boolean);

      return andKeywords.every(keyword => {
        const map = { '이름':'name','경력':'career','나이':'age','전문영역':'expertise','기타':'otherInfo','우선순위':'priority' };
        const f = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
        if (f) {
          const field = map[f[1]];
          const val = f[2].toLowerCase();
          const v = p[field] ? String(p[field]).toLowerCase() : '';
          return v.includes(val);
        }
        const ageG = keyword.match(/^(\d{1,2})대$/);
        if (ageG) {
          const d = parseInt(ageG[1],10);
          if (d>=10) { const min=d, max=d+9; return p.age && p.age>=min && p.age<=max; }
        }
        const txt = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
        return txt.includes(keyword.toLowerCase());
      });
    }));
  }, [searchTerm, profiles]);

  const parsedNL = useMemo(() => parseNaturalQuery(searchTerm), [searchTerm]);
  const hasNL = useMemo(() => !!parsedNL && !parsedNL.__isEmpty, [parsedNL]);

  const nlResults = useMemo(() => {
    if (!hasNL) return [];
    try {
      return profiles.filter(p => matchProfileWithNL(p, parsedNL));
    } catch {
      return [];
    }
  }, [profiles, parsedNL, hasNL]);

  const looksLikeAdvanced = useMemo(() => /:|\sAND\s|\sOR\s/i.test(searchTerm), [searchTerm]);
  const visible = useMemo(() => {
    if (!searchTerm.trim()) return [];
    if (looksLikeAdvanced) return advancedResults;
    if (hasNL && nlResults.length) return nlResults;
    return advancedResults;
  }, [searchTerm, looksLikeAdvanced, hasNL, nlResults, advancedResults]);

  return (
    <div>
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="text"
          placeholder="자연어로도 검색 가능: 예) 네이버 경력 백엔드 30대 리더"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-4 pl-12 border rounded-xl shadow-sm"
        />
      </div>

      {searchTerm.trim() && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.length ? (
            visible.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accessCode={accessCode}
                onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar}
                onToggleStar={onToggleStar}
              />
            ))
          ) : (
            <div className="text-sm text-gray-500">검색 결과가 없습니다.</div>
          )}
        </div>
      )}
    </div>
  );
};

const StarredPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const starred = useMemo(() => profiles.filter(p => p.starred), [profiles]);
  const expertiseOptions = useMemo(() => Array.from(new Set(starred.map(p => p.expertise).filter(Boolean))), [starred]);
  const [selectedExp, setSelectedExp] = useState('전체');
  const visible = useMemo(() => selectedExp === '전체' ? starred : starred.filter(p => p.expertise === selectedExp), [starred, selectedExp]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-600">전문영역 필터:</label>
        <select value={selectedExp} onChange={(e)=>setSelectedExp(e.target.value)} className="border rounded-md text-sm px-2 py-1">
          <option value="전체">전체</option>
          {expertiseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.length ? visible.map(p => (
          <ProfileCard key={p.id} profile={p}
            onUpdate={onUpdate} onDelete={onDelete}
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar}
            onToggleStar={(id, val) => onToggleStar(id, val)}
          />
        )) : <div className="text-sm text-gray-500">표시할 프로필이 없습니다.</div>}
      </div>
    </div>
  );
};

const FunctionsPage = ({ activeSub, setActiveSub, profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const now = useMemo(() => new Date(), []);
  const threeMonthsAgo = useMemo(() => { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }, [now]);

  const recommended = useMemo(() => {
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
      .filter(x => x.s >= 40)
      .sort((a,b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.p);
  }, [profiles, now]);

  const longTerm = useMemo(() => (
    profiles.filter(p => {
      const last = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      return last && last < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now);
    }).sort((a,b) => (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0)))
  ), [profiles, threeMonthsAgo, now]);

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

  const handleConfirm = async (p) => {
    await onUpdate(p.id, { lastReviewedDate: new Date().toISOString(), snoozeUntil: null });
    (toast.success?.('확인 처리되었습니다.') ?? toast('확인 처리되었습니다.'));
  };
  const handleSnooze3M = async (p) => {
    const dt = new Date(); dt.setMonth(dt.getMonth() + 3);
    await onUpdate(p.id, { snoozeUntil: dt.toISOString() });
    (toast.success?.('3개월 후 다시 알림으로 설정했습니다.') ?? toast('3개월 후 다시 알림으로 설정했습니다.'));
  };

  return (
    <div className="space-y-8">
      {activeSub === 'rec' && (
        <section className="bg-white rounded-xl shadow-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800">추천 : 다시 들여다볼 프로필</h2>
              <div className="relative group">
                <AlertCircle className="w-4 h-4 text-yellow-600 cursor-default" aria-hidden />
                <div className="absolute z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-md px-3 py-2 w-72 -left-2 mt-2 shadow-lg">
                  최근 팔로업 시점/스누즈/우선순위/IT 키워드 등을 반영해 점수를 계산해요.
                  <br/>팔로업 ‘확인’을 누르면 목록에서 제외되고, 보통 3개월 후 조건 충족 시 다시 나타납니다.
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500">카드에서 ‘확인’/‘스누즈’ 가능</div>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recommended.length === 0 ? (
              <div className="text-gray-500 p-4 text-sm">없음</div>
            ) : recommended.map(p => (
              <ProfileCard key={p.id}
                profile={p}
                onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
                renderFooterLeft={() => (
                  <div className="flex items-center gap-2">
                    <Btn size="xs" variant="subtle" onClick={() => handleConfirm(p)}>확인</Btn>
                    <Btn size="xs" variant="warning" onClick={() => handleSnooze3M(p)}>3개월 후 다시</Btn>
                  </div>
                )}
              />
            ))}
          </div>
        </section>
      )}

      {activeSub === 'long' && (
        <section className="bg-white rounded-xl shadow-md p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold flex items-center">
              <BellRing className="mr-2 text-orange-500" aria-hidden />장기 미접촉 알림 (3개월 이상)
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {longTerm.length === 0 ? (
              <div className="text-gray-500 p-4 text-sm">없음</div>
            ) : longTerm.map(p => (
              <ProfileCard key={p.id}
                profile={p}
                onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
                renderFooterLeft={() => (
                  <div className="flex items-center gap-2">
                    <Btn size="xs" variant="subtle" onClick={() => handleConfirm(p)}>확인</Btn>
                    <Btn size="xs" variant="warning" onClick={() => handleSnooze3M(p)}>3개월 후 다시</Btn>
                  </div>
                )}
              />
            ))}
          </div>
        </section>
      )}

      {activeSub === 'graphs' && (
        <>
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
                    <Cell key={`cell-pr-${i}`} fill={`url(#gp-${i})`} stroke="#fff"
                      onClick={() => setActiveFilter({ type:'priority', value: entry.name })} style={{ cursor: 'pointer' }}/>
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

          <section className="bg-white p-6 rounded-xl shadow-md mt-8">
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
                    <Cell key={`cell-age-${i}`} fill={`url(#g-age-${i})`} stroke="#fff"
                      onClick={() => setActiveFilter({ type:'age', value: entry.name })} style={{ cursor: 'pointer' }}/>
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

          <section className="bg-white p-6 rounded-xl shadow-md mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
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

          <section className="bg-white p-6 rounded-xl shadow-md mt-8">
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
                    <Cell key={`co-${i}`} onClick={() => setActiveFilter({ type:'company', value: entry.name })} style={{ cursor: 'pointer' }} />
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
        </>
      )}
    </div>
  );
};

const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in mt-4">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      <Btn size="xs" variant="subtle" onClick={onClear}>필터 해제</Btn>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile) => (
          <div key={profile.id}>
            <ProfileCard
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onToggleStar={onToggleStar}
            />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');

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
        (toast.success?.(msg) ?? toast(msg));
      } catch (err) {
        console.error('엑셀 처리 오류:', err);
        setMessage('엑셀 파일을 처리하는 중 오류가 발생했습니다.');
        (toast.error?.('엑셀 처리 중 오류가 발생했습니다.') ?? toast('엑셀 처리 중 오류가 발생했습니다.'));
      } finally { setIsUploading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center"><UploadCloud className="mr-2 text-yellow-500" aria-hidden/>엑셀로 일괄 등록</h2>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">정해진 양식의 엑셀 파일을 업로드하여 여러 프로필을 한 번에 추가할 수 있습니다.</p>
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내:</p>
          <p>2행부터 각 행을 한 프로필로 읽습니다.</p>
          <p>각 열의 C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보 로 입력됩니다.</p>
          <p className="font-bold mt-1">※ 기존 프로필과 이름이 겹칠 경우, 덮어쓰기됩니다.</p>
        </div>
        <input type="file" accept=".xlsx, .xls" onChange={(e)=>{ setFile(e.target.files[0]); setMessage(''); }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
        <Btn onClick={handleUpload} disabled={!file || isUploading} className="w-full" variant="primary">
          {isUploading ? <Loader2 className="animate-spin" /> : '업로드 및 추가'}
        </Btn>
        {message && <p className="text-sm text-center text-gray-600">{message}</p>}
      </div>
    </section>
  );
};

// 관리 페이지
const ManagePage = ({ profiles, onUpdate, onDelete, onAddOne, handleBulkAdd, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;
  const sorted = useMemo(() => [...profiles].sort((a,b)=>a.name.localeCompare(b.name)), [profiles]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageItems = useMemo(() => {
    const end = currentPage * PER_PAGE, start = end - PER_PAGE;
    return sorted.slice(start,end);
  }, [sorted, currentPage]);
  const pages = useMemo(() => Array.from({length: totalPages}, (_,i)=>i+1), [totalPages]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim()) return;
    await onAddOne({
      name: newName, career: newCareer, age: newAge ? Number(newAge) : null,
      otherInfo: newOtherInfo || '', expertise: newExpertise || '', priority: newPriority || '',
      meetingRecord: newMeetingRecord || ''
    });
    setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    (toast.success?.('프로필이 추가되었습니다.') ?? toast('프로필이 추가되었습니다.'));
  };

  return (
    <div className="space-y-8">
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500" aria-hidden/>새 프로필 추가</h2>
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
            <Btn as="button" type="submit" variant="primary">추가하기</Btn>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pageItems.map(p => (
            <ProfileCard key={p.id}
              profile={p}
              onUpdate={onUpdate} onDelete={onDelete}
              accessCode={accessCode} onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
            />
          ))}
        </div>

        <nav className="mt-6 flex items-center justify-center gap-1">
          <button onClick={()=>setCurrentPage(1)} disabled={currentPage===1}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">≪</button>
          <button onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={currentPage===1}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">〈</button>

          <div className="flex items-center gap-1 overflow-x-auto max-w-[70vw]">
            {pages.map(n => (
              <button key={n} onClick={()=>setCurrentPage(n)}
                className={`px-3 py-1 rounded-md border text-sm ${currentPage===n?'bg-yellow-400 text-white border-yellow-400':'bg-white hover:bg-gray-50'}`}>
                {n}
              </button>
            ))}
          </div>

          <button onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={currentPage===totalPages}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">〉</button>
          <button onClick={()=>setCurrentPage(totalPages)} disabled={currentPage===totalPages}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">≫</button>
        </nav>
      </section>
    </div>
  );
};

/* === 관리자 버튼 (개선본) === */
function AdminOnlyButton({ activeMain, setActiveMain, setFunctionsOpen }) {
  const { isAdmin, isLoading } = useIsAdmin();
  if (isLoading || !isAdmin) return null;
  return (
    <button
      onClick={() => { setActiveMain('admin'); setFunctionsOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
        activeMain === 'admin' ? 'bg-yellow-400 text-white' : 'hover:bg-gray-100'
      }`}
    >
      <Users size={16}/> 사용자 관리
    </button>
  );
}

// ============ App ============
export default function App() {
  // --- 상태들 ---
  const [accessCode, setAccessCode] = useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [profiles, setProfiles]     = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMain, setActiveMain]   = useState('alerts');
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [functionsSub, setFunctionsSub] = useState('rec');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarBase, setSimilarBase] = useState(null);
  const [similarList, setSimilarList] = useState([]);

  const [gapiClient, setGapiClient]   = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleApiReady, setGoogleApiReady]     = useState(null);
  const [googleError, setGoogleError]           = useState('');

  const [activeColRef, setActiveColRef] = useState(null);
  const [dataReady, setDataReady] = useState(false);

  const [dataError, setDataError] = useState('');
  const [resolvedPath, setResolvedPath] = useState('');

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProfile, setDetailProfile] = useState(null);

  // ✅ 관리자 여부 probe
  const adminProbe = useIsAdmin();
  const isAdmin = adminProbe.isAdmin;

  const openProfileDetailById = (id) => {
    const p = profiles.find((x) => x.id === id);
    if (p) {
      setDetailProfile(p);
      setDetailOpen(true);
    }
  };

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

  // Auth 상태
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthStatus(user ? 'authenticated' : 'unauthenticated');
    });
    return () => unsub();
  }, []);

  // 데이터 로드
  useEffect(() => {
    let unsub = null; let cancelled = false;
    (async () => {
      setDataReady(false);
      setActiveColRef(null);
      setDataError('');
      setResolvedPath('');

      if (!accessCode) { setProfiles([]); setDataReady(true); return; }

      try {
        const candidates = buildPathCandidates(accessCode, appId);
        let chosen = null;
        let chosenPathStr = '';

        for (const path of candidates) {
          try {
            const colRef = collection(db, ...path);
            const snap = await getDocs(query(colRef, limit(1)));
            if (!snap.empty) {
              chosen = colRef;
              chosenPathStr = path.join(' / ');
              break;
            }
          } catch (e) { /* next */ }
        }

        if (!chosen) {
          const fallbackPath = candidates[0];
          chosen = collection(db, ...fallbackPath);
          chosenPathStr = fallbackPath.join(' / ');
        }

        if (cancelled) return;
        setActiveColRef(chosen);
        setResolvedPath(chosenPathStr);

        unsub = onSnapshot(
          query(chosen),
          (qs) => {
            if (cancelled) return;
            const data = qs.docs.map(d => ({ ...d.data(), id: d.id }));
            setProfiles(data);
            setDataReady(true);
            setDataError(data.length === 0 ? '선택된 경로에 문서가 없습니다.' : '');
          },
          (err) => {
            console.error('profiles onSnapshot error:', err);
            setProfiles([]);
            setDataReady(true);
            setDataError(err?.code ? `${err.code}: ${err.message}` : '알 수 없는 오류로 데이터를 불러오지 못했습니다.');
          }
        );
      } catch (e) {
        console.error('profiles collection resolve error:', e);
        setProfiles([]);
        setDataReady(true);
        setDataError(e?.message || '데이터 경로를 해석하는 중 오류가 발생했습니다.');
      }
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [accessCode]);

  // --- Handlers ---
  const handleLogin = (code) => {
    setAccessCode(code);
    if (typeof window !== 'undefined') localStorage.setItem('profileDbAccessCode', code);
  };

  const handleFirebaseLogout = async () => {
    try { await signOut(auth); } catch (e) { /* noop */ }
    if (window.gapi?.client) window.gapi.client.setToken(null);
    setIsGoogleSignedIn(false);
  };

  const handleAddOne = async (payload) => {
    if (!activeColRef) return;
    const parsed = parseDateTimeFromRecord(payload.meetingRecord);
    const eventDate = parsed ? parsed.date.toISOString() : null;
    const profileData = {
      name: payload.name,
      career: payload.career,
      age: payload.age ?? null,
      otherInfo: payload.otherInfo || '',
      expertise: payload.expertise || '',
      priority: payload.priority || '',
      meetingRecord: payload.meetingRecord || '',
      eventDate,
      starred: false
    };
    await addDoc(activeColRef, profileData);
  };

  const handleBulkAdd = async (newProfiles) => {
    if (!activeColRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const snap = await getDocs(query(activeColRef));
    const nameToId = new Map(snap.docs.map(d => [d.data().name, d.id]));
    const batch = writeBatch(db);
    let updated=0, added=0;
    newProfiles.forEach(p => {
      const id = nameToId.get(p.name);
      const payload = { starred:false, ...p };
      if (id) { batch.set(doc(activeColRef, id), payload, { merge: true }); updated++; }
      else { batch.set(doc(activeColRef), payload); added++; }
    });
    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const handleUpdate = async (profileId, updatedData) => {
    if (!activeColRef) return;
    await updateDoc(doc(activeColRef, profileId), updatedData);
  };

  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId && activeColRef) await deleteDoc(doc(activeColRef, showDeleteConfirm.profileId));
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
    (toast.success?.('삭제되었습니다.') ?? toast('삭제되었습니다.'));
  };

  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 20);
    setSimilarBase(base); setSimilarList(sorted); setSimilarOpen(true);
  };

  const ensureGoogleAuth = () => {
    return new Promise((resolve, reject) => {
      const token = gapiClient?.client?.getToken?.();
      if (token?.access_token) { setIsGoogleSignedIn(true); resolve(true); return; }
      if (!tokenClient) { reject(new Error('Google API 초기화 전입니다. 잠시 후 다시 시도해주세요.')); return; }
      tokenClient.callback = (resp) => {
        if (resp && resp.access_token) { gapiClient.client.setToken({ access_token: resp.access_token }); setIsGoogleSignedIn(true); resolve(true); }
        else { reject(new Error('Google 토큰을 발급받지 못했습니다.')); }
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  };

  const handleSyncOneToCalendar = async (profile) => {
    if (!googleApiReady) { (toast.error?.('Google API가 준비되지 않았습니다.') ?? toast('Google API가 준비되지 않았습니다.')); return; }
    try { await ensureGoogleAuth(); }
    catch (e) { (toast.error?.(e.message || 'Google 인증에 실패했습니다.') ?? toast(e.message || 'Google 인증에 실패했습니다.')); return; }

    let parsed = parseDateTimeFromRecord(profile.meetingRecord);
    if (!parsed && profile.eventDate) parsed = { date: new Date(profile.eventDate), hadTime: true };
    if (!parsed) { (toast.error?.('날짜/시간을 인식할 수 없습니다. "미팅기록"을 확인하세요.') ?? toast('날짜/시간을 인식할 수 없습니다. "미팅기록"을 확인하세요.')); return; }

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
      if (!activeColRef) throw new Error('컬렉션 참조가 없습니다.');
      await updateDoc(doc(activeColRef, profile.id), {
        gcalEventId: ev.id || profile.gcalEventId || null,
        gcalHtmlLink: ev.htmlLink || profile.gcalHtmlLink || null,
        gcalLastSyncAt: new Date().toISOString(),
      });
      (toast.success?.(profile.gcalEventId ? '캘린더 일정이 수정되었습니다.' : '캘린더 일정이 등록되었습니다.') ??
        toast(profile.gcalEventId ? '캘린더 일정이 수정되었습니다.' : '캘린더 일정이 등록되었습니다.'));
    } catch (e) {
      console.error('Google Calendar 동기화 실패:', e);
      (toast.error?.('캘린더 동기화에 실패했습니다. 콘솔을 확인하세요.') ?? toast('캘린더 동기화에 실패했습니다. 콘솔을 확인하세요.'));
    }
  };

  // URL 파라미터
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  const profilesWithHelpers = useMemo(() => profiles, [profiles]);

  // 파생값
  const totalCount = profiles.length;
  const meetingCount = useMemo(
    () => profiles.filter(p => !!p.eventDate).length,
    [profiles]
  );

  // 상세보기 (공유 링크로 접근 시)
  function ProfileDetailView({ profileId, accessCode }) {
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
  }

  if (profileIdFromUrl && accessCodeFromUrl) {
    return <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />;
  }
  if (!accessCode) {
    return <LoginScreen onLogin={handleLogin} onLogout={handleFirebaseLogout} isAuthed={authStatus==='authenticated'} />;
  }

  // 메인 콘텐츠 스위치
  const MainContent = () => {
    if (activeMain === 'alerts') {
      return (
        <AlertsPage
          profiles={profilesWithHelpers}
          onUpdate={handleUpdate} onDelete={handleDeleteRequest}
          accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
          onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
        />
      );
    }
    if (activeMain === 'search') {
      return (
        <SearchPage
          profiles={profilesWithHelpers}
          onUpdate={handleUpdate} onDelete={handleDeleteRequest}
          accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
          onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
        />
      );
    }
    if (activeMain === 'starred') {
      return (
        <StarredPage
          profiles={profilesWithHelpers}
          onUpdate={handleUpdate} onDelete={handleDeleteRequest}
          accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
          onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
        />
      );
    }
    if (activeMain === 'meetings') {
      return <MeetingsPage profiles={profilesWithHelpers} onOpenDetail={openProfileDetailById} />;
    }
    if (activeMain === 'manage') {
      return (
        <ManagePage
          profiles={profilesWithHelpers}
          onUpdate={handleUpdate} onDelete={handleDeleteRequest}
          onAddOne={handleAddOne} handleBulkAdd={handleBulkAdd}
          accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
          onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
        />
      );
    }
    if (activeMain === 'admin') {
      const probe = { from: 'App', isAdmin, ts: new Date().toISOString() };
      if (!isAdmin) {
        return <div className="text-sm text-red-600">권한이 없습니다. (App gate)</div>;
      }
      return <UserAdmin isAdminOverride={isAdmin} probe={probe} />;
    }

    return (
      <FunctionsPage
        activeSub={functionsSub} setActiveSub={setFunctionsSub}
        profiles={profilesWithHelpers}
        onUpdate={handleUpdate} onDelete={handleDeleteRequest}
        accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
        onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
      />
    );
  };

  return (
    <AuthGate>
      {profileIdFromUrl && accessCodeFromUrl ? (
        <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />
      ) : !accessCode ? (
        <LoginScreen onLogin={handleLogin} onLogout={handleFirebaseLogout} isAuthed={authStatus==='authenticated'} />
      ) : (
        <div className="bg-gray-50 min-h-screen font-sans">
          {showDeleteConfirm.show && (
            <ConfirmationModal
              message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
              onConfirm={confirmDelete}
              onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
            />
          )}

          {/* 상단 헤더 */}
          <header className="px-4 sm:px-6 py-3 border-b bg-white sticky top-0 z-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button className="md:hidden p-2 rounded-md border bg-white" onClick={()=>setSidebarOpen(s=>!s)} aria-label="사이드바 토글">
                  <Menu size={18}/>
                </button>
                <Users className="text-yellow-500 w-7 h-7" aria-hidden />
                <h1 className="text-xl font-bold text-gray-800">프로필 대시보드</h1>
                <span className="text-xs sm:text-sm bg-gray-200 px-2 sm:px-3 py-1 rounded-full font-mono">{accessCode}</span>
              </div>
              <div className="hidden md:flex items-center gap-4">
                {googleApiReady === false && (
                  <span className="text-xs text-red-500">
                    Google Calendar 연동 비활성화됨{googleError ? ` (${googleError})` : ' (초기화 실패)'}
                  </span>
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
                <button
                  onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }}
                  className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center"
                >
                  <LogOut className="w-4 h-4 mr-1.5" /> 로그아웃
                </button>
              </div>
            </div>

            {/* 디버그 배너 */}
            {(resolvedPath || dataError) && (
              <div className="mt-2 text-xs">
                {resolvedPath && (
                  <div className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 mr-2">
                    현재 읽는 경로: <span className="font-mono">{resolvedPath}</span>
                  </div>
                )}
                {dataError && (
                  <div className="inline-block bg-red-50 text-red-700 border border-red-200 rounded px-2 py-1">
                    데이터 로드 오류: {dataError}
                  </div>
                )}
              </div>
            )}

            {/* 카운트 박스 */}
            <div className="mt-3 flex items-center gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <h3 className="text-base font-medium text-gray-500">총 등록된 프로필</h3>
                <p className="text-3xl font-bold text-yellow-500 mt-1">{totalCount}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <h3 className="text-base font-medium text-gray-500">미팅 진행 프로필</h3>
                <p className="text-3xl font-bold text-yellow-500 mt-1">{meetingCount}</p>
              </div>
            </div>
          </header>

          <div className="flex">
            {/* 사이드바 */}
            <aside className={`fixed md:static top-[180px] z-30 md:z-auto left-0 h-[calc(100vh-180px)] md:h-auto w-64 bg-white border-r transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
              <nav className="p-3 space-y-1 overflow-y-auto h-full">
                <button onClick={()=>{ setActiveMain('alerts'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='alerts'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <BellRing size={16}/> 알림
                </button>
                <button onClick={()=>{ setActiveMain('search'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='search'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <SearchIcon size={16}/> 검색
                </button>
                <button onClick={()=>{ setActiveMain('starred'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='starred'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <Star size={16}/> 주목 중인 프로필들
                </button>
                <button onClick={()=>{ setActiveMain('meetings'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='meetings'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <Calendar size={16}/> 미팅 데이터
                </button>

                {/* Functions 토글 */}
                <button onClick={()=>{ setActiveMain('functions'); setFunctionsOpen(v=>!v); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm ${activeMain==='functions'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <span className="flex items-center gap-2"><Sparkles size={16}/> Functions</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${functionsOpen ? 'rotate-180' : ''}`} />
                </button>

                {functionsOpen && (
                  <div className="pl-4 space-y-1">
                    <button onClick={()=>{ setActiveMain('functions'); setFunctionsSub('rec'); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='functions'&&functionsSub==='rec'?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                      <Sparkles size={16}/> 추천
                    </button>
                    <button onClick={()=>{ setActiveMain('functions'); setFunctionsSub('long'); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='functions'&&functionsSub==='long'?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                      <Clock size={16}/> 장기관리
                    </button>
                    <button onClick={()=>{ setActiveMain('functions'); setFunctionsSub('graphs'); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='functions'&&functionsSub==='graphs'?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                      <LineChartIcon size={16}/> 그래프&필터
                    </button>
                  </div>
                )}

                {/* 관리자 전용 */}
                <AdminOnlyButton
                  activeMain={activeMain}
                  setActiveMain={setActiveMain}
                  setFunctionsOpen={setFunctionsOpen}
                />

                {/* ✅ 항상 제일 아래: 프로필 관리 */}
                <button
                  onClick={() => { setActiveMain('manage'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                    activeMain==='manage' ? 'bg-yellow-400 text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  <UserPlus size={16}/> 프로필 관리
                </button>
              </nav>
            </aside>

            {/* 본문 */}
            <main className="flex-1 p-4 sm:p-6 md:ml-0 ml-0 mt-3 md:mt-4">
              {!dataReady ? (
                <div className="max-w-[1200px] mx-auto space-y-3">
                  {/* 스켈레톤 로딩 */}
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : (
                <div className="max-w-[1200px] mx-auto">
                  <MainContent />
                </div>
              )}
            </main>
          </div>

          {/* 상세 모달 */}
          {detailOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => setDetailOpen(false)} />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-800">
                    {detailProfile?.name || '프로필'}
                  </h3>
                  <button onClick={() => setDetailOpen(false)} className="text-gray-500 hover:text-gray-800" aria-label="닫기">
                    <X size={20} />
                  </button>
                </div>
                {detailProfile && (
                  <ProfileCard
                    profile={detailProfile}
                    onUpdate={handleUpdate}
                    onDelete={handleDeleteRequest}
                    accessCode={accessCode}
                    onSyncOne={handleSyncOneToCalendar}
                    onShowSimilar={openSimilarModal}
                    onToggleStar={(id, val) => handleUpdate(id, { starred: !!val })}
                  />
                )}
              </div>
            </div>
          )}

          {/* 유사도 모달 */}
          {similarOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black bg-opacity-40" onClick={()=>setSimilarOpen(false)} />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-800">
                    유사 프로필 — <span className="text-yellow-600">{similarBase?.name}</span>
                  </h3>
                  <button onClick={()=>setSimilarOpen(false)} className="text-gray-500 hover:text-gray-800" aria-label="닫기"><X size={20} /></button>
                </div>
                <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
                  {similarList.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {similarList.map(({ profile }) => (
                        <ProfileCard
                          key={profile.id}
                          profile={profile}
                          onUpdate={handleUpdate}
                          onDelete={handleDeleteRequest}
                          accessCode={accessCode}
                          onSyncOne={handleSyncOneToCalendar}
                          onShowSimilar={openSimilarModal}
                          onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AuthGate>
  );
}
