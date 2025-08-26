import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query, setLogLevel, updateDoc, writeBatch, getDoc
} from 'firebase/firestore';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'firebase/storage';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2, ShieldAlert, X, Save, UploadCloud,
  BellRing, Share2, CalendarPlus, UserCircle2
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
const storage = getStorage(app);
setLogLevel('debug');

const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

const TAB_PAGE = { DASHBOARD: 'dashboard', MANAGE: 'manage' };

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
// 공유 보기
// ===============================
const ProfileDetailView = ({ profileId, accessCode }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const refPath = doc(db, 'artifacts', appId, 'public', 'data', accessCode, profileId);
        const snap = await getDoc(refPath);
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
          <div className="flex items-center space-x-4">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <UserCircle2 className="w-20 h-20 text-gray-300" />
            )}
            <div>
              <h1 className="text-3xl font-bold text-yellow-600">{profile.name}</h1>
              <span className="text-xl text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
            </div>
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
// 확인 모달
// ===============================
const ConfirmationModal = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
      <div className="text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">삭제 확인</h3>
        <div className="mt-2 text-sm text-gray-500"><p>{message}</p></div>
      </div>
      <div className="mt-6 flex justify-center gap-4">
        <button onClick={onCancel} className="px-6 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300">취소</button>
        <button onClick={onConfirm} className="px-6 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">삭제</button>
      </div>
    </div>
  </div>
);

// ===============================
// 프로필 카드 (사진 편집/저장 포함)
// ===============================
const ProfileCard = ({ profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm, accessCode, onSyncOne }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(profile.photoURL || null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setEditedProfile(profile);
    setPhotoPreview(profile.photoURL || null);
    setPhotoFile(null);
  }, [profile]);

  const priorityColors = {
    '3': 'bg-red-100 text-red-800',
    '2': 'bg-yellow-100 text-yellow-800',
    '1': 'bg-green-100 text-green-800',
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const parsed = parseDateTimeFromRecord(editedProfile.meetingRecord);
    const eventDate = parsed ? new Date(parsed.date).toISOString() : null;
    try {
      await onUpdate(profile.id, { ...editedProfile, eventDate }, photoFile);
      setIsEditing(false);
      setPhotoFile(null);
    } catch (e) {
      console.error('프로필 저장 실패:', e);
      alert('프로필 수정 중 오류가 발생했습니다.');
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
      <div className="bg-white p-4 rounded-lg shadow-lg border-l-4 border-yellow-400 relative space-y-3">
        <div className="flex items-center space-x-4">
          {photoPreview ? (
            <img src={photoPreview} alt="preview" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <UserCircle2 className="w-16 h-16 text-gray-300" />
          )}
          <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-sm" />
        </div>
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
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow relative group">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          {profile.photoURL ? (
            <img src={profile.photoURL} alt={profile.name} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <UserCircle2 className="w-12 h-12 text-gray-300" />
          )}
          <div>
            <h3 className="font-bold text-yellow-600">{profile.name}</h3>
            <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
          </div>
        </div>
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

      <div className="mt-3 flex items-center justify-between">
        {profile.gcalEventId ? (
          <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Google Calendar에서 보기</a>
        ) : <span className="text-xs text-gray-400">캘린더 미연동</span>}

        <button onClick={handleSyncClick} disabled={syncing} className="text-xs bg-blue-500 text-white font-semibold px-3 py-1 rounded-full hover:bg-blue-600 disabled:bg-blue-300 flex items-center">
          {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CalendarPlus className="w-3 h-3 mr-1" />}
          {profile.gcalEventId ? '캘린더 수정' : '캘린더 등록'}
        </button>
      </div>

      <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleShare} className="text-gray-500 hover:text-gray-800" title="공유 링크 복사"><Share2 size={14} /></button>
        <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:text-blue-700" title="수정"><Edit size={14} /></button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="text-red-500 hover:text-red-700" title="삭제"><Trash2 size={14} /></button>
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
// 필터링 섹션 / 대시보드 탭
// ===============================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, onSyncOne }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile, index) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${index * 50}ms` }}>
            <ProfileCard profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

const DashboardTab = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne }) => {
  const [activeFilter, setActiveFilter] = useState({ type: null, value: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [showMeetingProfiles, setShowMeetingProfiles] = useState(false);

  const { todayProfiles, upcomingProfiles, meetingProfiles, longTermNoContactProfiles } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeDaysLater = new Date(todayStart); threeDaysLater.setDate(threeDaysLater.getDate() + 4);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const today = [], upcoming = [], meetings = [], longTerm = [];
    profiles.forEach(p => {
      if (p.eventDate) {
        meetings.push(p);
        const eventDate = new Date(p.eventDate);
        if (eventDate >= todayStart && eventDate < new Date(new Date(todayStart).setDate(todayStart.getDate() + 1))) {
          today.push(p);
        } else if (eventDate > now && eventDate < threeDaysLater) {
          upcoming.push(p);
        }
      }
      const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil  = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (lastContact && lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) longTerm.push(p);
    });

    return {
      todayProfiles: today.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      upcomingProfiles: upcoming.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      meetingProfiles: meetings.sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate)),
      longTermNoContactProfiles: longTerm.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
    };
  }, [profiles]);

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
    <>
      {longTermNoContactProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><BellRing className="mr-2 text-orange-500" />장기 미접촉 알림 (3개월 이상)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {longTermNoContactProfiles.map(profile => <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} isAlarmCard={true} onSnooze={(id)=>onUpdate(id,{snoozeUntil:new Date(new Date().setMonth(new Date().getMonth()+3)).toISOString()})} onConfirmAlarm={(id)=>onUpdate(id,{lastReviewedDate:new Date().toISOString()})} accessCode={accessCode} onSyncOne={onSyncOne} />)}
          </div>
        </section>
      )}

      {todayProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todayProfiles.map(profile => <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} />)}
          </div>
        </section>
      )}

      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingProfiles.map(profile => <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} />)}
          </div>
        </section>
      )}

      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} />
              )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="mb-8 flex space-x-4">
        <div className="bg-white p-4 rounded-xl shadow-md">
          <h3 className="text-base font-medium text-gray-500">총 등록된 프로필</h3>
          <p className="text-3xl font-bold text-yellow-500 mt-1">{profiles.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-md cursor-pointer hover:bg-gray-50" onClick={() => setShowMeetingProfiles(!showMeetingProfiles)}>
          <h3 className="text-base font-medium text-gray-500">미팅 진행 프로필</h3>
          <p className="text-3xl font-bold text-yellow-500 mt-1">{meetingProfiles.length}</p>
        </div>
      </section>

      {showMeetingProfiles && (
        <FilterResultSection title="미팅 진행 프로필 (최신순)" profiles={meetingProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setShowMeetingProfiles(false)} accessCode={accessCode} onSyncOne={onSyncOne} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
              <Pie
                data={useMemo(()=>{const g={'10대':0,'20대':0,'30대':0,'40대':0,'50대 이상':0}; 
                  profiles.forEach(({age})=>{if(!age)return; if(age<20)g['10대']++; else if(age<30)g['20대']++; else if(age<40)g['30대']++; else if(age<50)g['40대']++; else g['50대 이상']++;});
                  return Object.entries(g).map(([name,value])=>({name,value})).filter(d=>d.value>0);},[profiles])}
                cx="50%" cy="50%" outerRadius={100} dataKey="value" label
              >
                {useMemo(()=>{const g={'10대':0,'20대':0,'30대':0,'40대':0,'50대 이상':0}; 
                  profiles.forEach(({age})=>{if(!age)return; if(age<20)g['10대']++; else if(age<30)g['20대']++; else if(age<40)g['30대']++; else if(age<50)g['40대']++; else g['50대 이상']++;});
                  return Object.entries(g).map(([_ ,v],i)=><Cell key={`cell-age-${i}`} fill={`url(#g-age-${i})`} stroke="#fff" />);},[profiles])}
              </Pie>
              <Tooltip formatter={(v) => `${v}명`} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-bold text-gray-800 mb-4">우선순위별 분포</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <defs>
                <radialGradient id="gp-0"><stop offset="0%" stopColor="#FF4444" stopOpacity={0.7} /><stop offset="100%" stopColor="#FF4444" stopOpacity={1} /></radialGradient>
                <radialGradient id="gp-1"><stop offset="0%" stopColor="#FFBB28" stopOpacity={0.7} /><stop offset="100%" stopColor="#FFBB28" stopOpacity={1} /></radialGradient>
                <radialGradient id="gp-2"><stop offset="0%" stopColor="#00C49F" stopOpacity={0.7} /><stop offset="100%" stopColor="#00C49F" stopOpacity={1} /></radialGradient>
              </defs>
              <Pie
                data={useMemo(()=>{const p={'3 (상)':0,'2 (중)':0,'1 (하)':0};
                  profiles.forEach(x=>{if(x.priority==='3')p['3 (상)']++; else if(x.priority==='2')p['2 (중)']++; else if(x.priority==='1')p['1 (하)']++;});
                  return Object.entries(p).map(([name,value])=>({name,value})).filter(d=>d.value>0);},[profiles])}
                cx="50%" cy="50%" outerRadius={100} dataKey="value" label
              >
                {useMemo(()=>[{},{},{}].map((_,i)=><Cell key={`cell-p-${i}`} fill={`url(#gp-${i})`} stroke="#fff" />),[])}
              </Pie>
              <Tooltip formatter={(v) => `${v}명`} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      {(activeFilter.type === 'age' || activeFilter.type === 'priority') && (
        <FilterResultSection title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setActiveFilter({ type: null, value: null })} accessCode={accessCode} onSyncOne={onSyncOne} />
      )}

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={TARGET_KEYWORDS.map(k=>({name:k, count: profiles.filter(p=>p.career?.includes(k)).length}))} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8}/><stop offset="95%" stopColor="#FF8042" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/><Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-company)" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={useMemo(()=>{const c={}; profiles.forEach(p=>{if(p.expertise) c[p.expertise]=(c[p.expertise]||0)+1;}); return Object.entries(c).map(([name,count])=>({name,count}));},[profiles])}
            margin={{ top: 20, right: 30, left: 0, bottom: 50 }}
          >
            <defs>
              <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/><Tooltip formatter={(v)=>`${v}명`} /><Legend />
            <Bar dataKey="count" fill="url(#gradient-expertise)" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {activeFilter.type === 'expertise' && (
        <FilterResultSection title={`"${activeFilter.value}" 전문영역 필터 결과`} profiles={filteredProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setActiveFilter({ type: null, value: null })} accessCode={accessCode} onSyncOne={onSyncOne} />
      )}
    </>
  );
};

// ===============================
// 관리 탭 (사진 업로드 포함)
// ===============================
const ManageTab = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, accessCode, onSyncOne }) => {
  const { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord, newPhoto } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord, setNewPhoto } = setFormState;

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PROFILES_PER_PAGE = 9;

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} />
              )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500" />새 프로필 추가</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" required />
            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" required />
          <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">프로필 사진</label>
            <input
              type="file" accept="image/*"
              onChange={(e) => setNewPhoto(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">추가하기</button>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentProfiles.map(profile => (
            <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} onSyncOne={onSyncOne} />
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
    <nav className="mt-8 flex justify-center">
      <ul className="inline-flex items-center -space-x-px">
        {pages.map(n => (
          <li key={n}>
            <button onClick={() => setCurrentPage(n)} className={`py-2 px-4 leading-tight border border-gray-300 ${currentPage===n?'bg-yellow-400 text-white border-yellow-400':'bg-white text-gray-600 hover:bg-gray-100'}`}>{n}</button>
          </li>
        ))}
      </ul>
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
  const [accessCode, setAccessCode] = useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [profiles, setProfiles]     = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab]   = useState(TAB_PAGE.DASHBOARD);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  // Google API 상태
  const [gapiClient, setGapiClient]   = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleApiReady, setGoogleApiReady]     = useState(null);
  const [googleError, setGoogleError]           = useState('');

  // 신규 입력 폼 상태 (사진 포함)
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');
  const [newPhoto, setNewPhoto] = useState(null);

  // 공유 URL 파라미터
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

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
    // artifacts/{appId}/public/data/{accessCode}/(collection)
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  useEffect(() => {
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

  // 신규 프로필 추가 (사진 처리 포함)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
    const parsed = parseDateTimeFromRecord(newMeetingRecord);
    const eventDate = parsed ? parsed.date.toISOString() : null;
    const profileData = {
      name: newName,
      career: newCareer,
      age: newAge ? Number(newAge) : null,
      otherInfo: newOtherInfo,
      eventDate,
      expertise: newExpertise || null,
      priority: newPriority || null,
      meetingRecord: newMeetingRecord || null,
      photoURL: null
    };

    try {
      const docRef = await addDoc(profilesCollectionRef, profileData);

      // 사진 업로드가 있으면 Storage 업로드 후 URL 업데이트
      if (newPhoto) {
        const photoRef = ref(storage, `profileImages/${accessCode}/${docRef.id}`);
        await uploadBytes(photoRef, newPhoto);
        const photoURL = await getDownloadURL(photoRef);
        await updateDoc(docRef, { photoURL });
      }

      // 폼 리셋
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo('');
      setNewExpertise(''); setNewPriority(''); setNewMeetingRecord(''); setNewPhoto(null);
      e.target.reset();
    } catch (err) {
      console.error("프로필 저장 오류: ", err);
      alert('새 프로필 저장 중 오류가 발생했습니다.');
    }
  };

  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const map = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updated=0, added=0;
    newProfiles.forEach(p => {
      const existingId = map.get(p.name);
      if (existingId) { batch.set(doc(profilesCollectionRef, existingId), p); updated++; }
      else { batch.set(doc(profilesCollectionRef), p); added++; }
    });
    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  // 프로필 업데이트 (사진 교체 포함)
  const handleUpdate = async (profileId, updatedData, photoFile) => {
    if (!profilesCollectionRef) return;
    const { id, ...dataToUpdate } = updatedData;

    try {
      if (photoFile) {
        const photoRef = ref(storage, `profileImages/${accessCode}/${profileId}`);
        await uploadBytes(photoRef, photoFile);
        dataToUpdate.photoURL = await getDownloadURL(photoRef);
      }
      await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
    } catch (err) {
      console.error('프로필 업데이트 오류:', err);
      throw err; // 상위에서 alert 처리
    }
  };

  // 삭제 요청 모달 띄우기
  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });

  // 실제 삭제 (사진 있으면 Storage도 정리)
  const confirmDelete = async () => {
    if (!showDeleteConfirm.profileId || !profilesCollectionRef) {
      setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
      return;
    }
    try {
      // 사진 URL 있으면 삭제 시도
      const target = profiles.find(p => p.id === showDeleteConfirm.profileId);
      if (target?.photoURL) {
        try {
          const photoRef = ref(storage, target.photoURL); // URL로부터 ref 생성 가능
          await deleteObject(photoRef);
        } catch (e) {
          console.warn('사진 삭제 중 문제(무시 가능):', e?.message || e);
        }
      }
      await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    } catch (e) {
      console.error('프로필 삭제 오류:', e);
      alert('프로필 삭제 중 오류가 발생했습니다.');
    } finally {
      setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
    }
  };

  // Google Calendar 인증 헬퍼
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

  // 단건 캘린더 동기화
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
      };
    }

    try {
      let result;
      if (profile.gcalEventId) {
        result = await gapiClient.client.calendar.events.patch({
          calendarId: 'primary',
          eventId: profile.gcalEventId,
          resource: eventResource,
        });
      } else {
        result = await gapiClient.client.calendar.events.insert({
          calendarId: 'primary',
          resource: eventResource,
        });
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

  const formState = { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord, newPhoto };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord, setNewPhoto };

  // 공유 모드
  if (profileIdFromUrl && accessCodeFromUrl) {
    return <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />;
  }
  if (!accessCode) {
    return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;
  }

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      {showDeleteConfirm.show && (
        <ConfirmationModal
          message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
        />
      )}

      <header className="flex flex-wrap justify-between items-center p-4 sm:p-6 border-b bg-white gap-4">
        <div className="flex items-center space-x-3">
          <Users className="text-yellow-500 w-8 h-8" />
          <h1 className="text-2xl font-bold text-gray-800">프로필 대시보드</h1>
          <span className="text-sm bg-gray-200 px-3 py-1 rounded-full font-mono">{accessCode}</span>
        </div>
        <div className="flex items-center space-x-4">
          {googleApiReady === false && (
            <span className="text-xs text-red-500">Google Calendar 연동 비활성화됨{googleError ? ` (${googleError})` : ' (초기화 실패)'}</span>
          )}
          {googleApiReady === true && (
            isGoogleSignedIn ? (
              <>
                <button
                  onClick={() => { if (window.gapi?.client) window.gapi.client.setToken(null); setIsGoogleSignedIn(false); }}
                  className="text-sm font-semibold text-gray-600 hover:text-yellow-600"
                >
                  Google 로그아웃
                </button>
              </>
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

      <div className="flex justify-center space-x-2 border-b bg-white px-6 py-2 sticky top-0 z-10">
        <button onClick={() => setActiveTab(TAB_PAGE.DASHBOARD)} className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === TAB_PAGE.DASHBOARD ? 'bg-yellow-400 text-white' : 'text-gray-600 hover:bg-yellow-100'}`}>대시보드</button>
        <button onClick={() => setActiveTab(TAB_PAGE.MANAGE)} className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === TAB_PAGE.MANAGE ? 'bg-yellow-400 text-white' : 'text-gray-600 hover:bg-yellow-100'}`}>프로필 관리</button>
      </div>

      <main className="p-6 space-y-12">
        {activeTab === TAB_PAGE.DASHBOARD && (
          <DashboardTab profiles={profiles} onUpdate={handleUpdate} onDelete={handleDeleteRequest} accessCode={accessCode} onSyncOne={handleSyncOneToCalendar} />
        )}
        {activeTab === TAB_PAGE.MANAGE && (
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
          />
        )}
      </main>
    </div>
  );
}
