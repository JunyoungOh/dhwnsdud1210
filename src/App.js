// src/App.js 리트라이
import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  setLogLevel, updateDoc, writeBatch
} from 'firebase/firestore';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search, Calendar as CalendarIcon, Zap, UserPlus, KeyRound, Loader2,
  ShieldAlert, X, Save, UploadCloud, BellRing
} from 'lucide-react';

// ✅ Google Calendar 유틸
import {
  ensureGoogleApisLoaded, initGapi, initGis, requestCalendarAccess,
  createAllDayEvent, updateAllDayEvent
} from './googleCalendar';

// -------------------- Firebase --------------------
const firebaseConfig = {
  apiKey: "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY",
  authDomain: "dhwnsdud1210-bf233.firebaseapp.com",
  projectId: "dhwnsdud1210-bf233",
  storageBucket: "dhwnsdud1210-bf233.appspot.com",
  appId: "1:9275853060:web:e5ccfa323da3493312a851",
  messagingSenderId: "9275853060",
  measurementId: "G-XS3VFNW6Y3"
};

const appId = 'profile-db-app-junyoungoh';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

// -------------------- Consts --------------------
const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];
const TAB_PAGE = { DASHBOARD: 'dashboard', MANAGE: 'manage' };
const APP_BASE_URL = 'https://harmonious-dango-511e5b.netlify.app/';

// -------------------- Utils --------------------
// "(25.08.22)" 같은 패턴에서 가장 최근 날짜를 ISO로 파싱 (UTC 기준 종일 이벤트 의도)
const parseDateFromRecord = (recordText) => {
  if (!recordText) return null;
  const matches = recordText.matchAll(/\((\d{2})\.(\d{2})\.(\d{2})\)/g);
  let latestDate = null;
  for (const match of matches) {
    const year = 2000 + parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!latestDate || d > latestDate) latestDate = d;
  }
  return latestDate ? latestDate.toISOString() : null;
};

// -------------------- UI: Login --------------------
const LoginScreen = ({ onLogin, authStatus }) => {
  const [codeInput, setCodeInput] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); if (codeInput.trim()) onLogin(codeInput.trim()); };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <Users className="mx-auto text-yellow-400 w-12 h-12" />
          <h2 className="mt-4 text-2xl font-bold text-gray-800">프로필 대시보드 접속</h2>
          <p className="mt-2 text-sm text-gray-500">접속 코드를 입력하세요.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input type="text" placeholder="Access Code" className="w-full pl-10 pr-3 py-3 border rounded-lg"
              value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
          </div>
          <div>
            <button type="submit" disabled={authStatus !== 'authenticated'}
              className="w-full flex justify-center py-3 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
              {authStatus === 'authenticating' && <Loader2 className="animate-spin mr-2" />}
              {authStatus === 'authenticated' ? '데이터 불러오기' : '인증 중...'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------- UI: Confirm --------------------
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

// -------------------- UI: ProfileCard --------------------
const ProfileCard = ({ profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm, onSyncCalendar }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const prColors = { '3': 'bg-red-100 text-red-800', '2': 'bg-yellow-100 text-yellow-800', '1': 'bg-green-100 text-green-800' };

  useEffect(() => { setEditedProfile(profile); }, [profile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedProfile(p => ({ ...p, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const eventDate = parseDateFromRecord(editedProfile.meetingRecord);
      await onUpdate(profile.id, { ...editedProfile, eventDate });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border-l-4 border-yellow-400 relative space-y-3">
        <input name="name" value={editedProfile.name} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
        <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
        <textarea name="career" value={editedProfile.career} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-20" />
        <div className="grid grid-cols-2 gap-2">
          <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
          <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
        <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 1차 인터뷰)" className="w-full p-2 border rounded text-sm h-20" />
        <div className="flex justify-end space-x-2">
          <button onClick={() => setIsEditing(false)} className="p-2 text-gray-500 hover:text-gray-800" disabled={saving}><X size={20} /></button>
          <button onClick={handleSave} className="p-2 text-green-600 hover:text-green-800" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={`profile-card-${profile.id}`} className="bg-white p-4 rounded-lg shadow relative group">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline space-x-2">
          <h3 className="font-bold text-yellow-600">{profile.name}</h3>
          <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
        </div>
        {profile.priority && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${prColors[profile.priority] || 'bg-gray-100 text-gray-800'}`}>{profile.priority}</span>}
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

      {/* 캘린더 등록/업데이트 버튼 */}
      <div className="mt-3 pt-3 border-t flex justify-end space-x-2">
        <button
          onClick={() => onSyncCalendar(profile)}
          className="text-xs bg-blue-100 text-blue-700 font-semibold px-3 py-1 rounded-full hover:bg-blue-200">
          {profile.calendarEventId ? '캘린더 업데이트' : '캘린더 등록'}
        </button>
        {isAlarmCard && (
          <>
            <button onClick={() => onConfirmAlarm(profile.id)} className="text-xs bg-gray-200 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-300">확인</button>
            <button onClick={() => onSnooze(profile.id)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">3개월 후 다시 알림</button>
          </>
        )}
      </div>

      <div className="absolute top-2 right-2 space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:underline text-xs">수정</button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button>
      </div>
    </div>
  );
};

// -------------------- UI: FilterResult --------------------
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, onSyncCalendar }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile, i) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${i * 50}ms` }}>
            <ProfileCard profile={profile} onUpdate={onUpdate} onDelete={onDelete} onSyncCalendar={onSyncCalendar} />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

// -------------------- Tab: Dashboard --------------------
const DashboardTab = ({ profiles, onUpdate, onDelete, highlightedProfile, setHighlightedProfile, onSyncCalendar, onBulkSync }) => {
  const [activeFilter, setActiveFilter] = useState({ type: null, value: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [showMeetingProfiles, setShowMeetingProfiles] = useState(false);

  // 알림/딥링크로 넘어온 profileId 하이라이트 (캘린더만 남겨두더라도 UX 유지)
  useEffect(() => {
    if (highlightedProfile) {
      const el = document.getElementById(`profile-card-${highlightedProfile}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight');
        setTimeout(() => {
          el.classList.remove('highlight');
          setHighlightedProfile(null);
        }, 2500);
      } else {
        setHighlightedProfile(null);
      }
    }
  }, [highlightedProfile, setHighlightedProfile, profiles]);

  const handlePieClick = (type, data) => {
    if (data.value === 0) return;
    setActiveFilter({ type, value: data.name });
  };
  const handleBarClick = (type, data) => {
    const value = data.name;
    const count = data.count || data.value;
    if (count === 0) return;
    setActiveFilter({ type, value });
  };

  const { todayProfiles, upcomingProfiles, meetingProfiles, longTermNoContactProfiles } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const threeDaysLater = new Date(todayStart);
    threeDaysLater.setUTCDate(threeDaysLater.getUTCDate() + 4);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const today = [], upcoming = [], meetings = [], longTerm = [];
    profiles.forEach(p => {
      if (p.eventDate) {
        meetings.push(p);
        const eventDate = new Date(p.eventDate);
        if (eventDate >= todayStart && eventDate < new Date(new Date(todayStart).setUTCDate(todayStart.getUTCDate() + 1))) {
          today.push(p);
        } else if (eventDate > now && eventDate < threeDaysLater) {
          upcoming.push(p);
        }
        const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : eventDate;
        const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
        if (lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) longTerm.push(p);
      }
    });

    return {
      todayProfiles: today.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      upcomingProfiles: upcoming.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
      meetingProfiles: meetings.sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate)),
      longTermNoContactProfiles: longTerm.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
    };
  }, [profiles]);

  const handleSnooze = (profileId) => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    onUpdate(profileId, { snoozeUntil: d.toISOString() });
  };
  const handleConfirmAlarm = (profileId) => onUpdate(profileId, { lastReviewedDate: new Date().toISOString() });

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

  const keywordData = useMemo(() => TARGET_KEYWORDS.map(k => ({
    name: k, count: profiles.filter(p => p.career?.includes(k)).length
  })), [profiles]);

  const expertiseData = useMemo(() => {
    const cnt = {};
    profiles.forEach(p => { if (p.expertise) cnt[p.expertise] = (cnt[p.expertise] || 0) + 1; });
    return Object.entries(cnt).map(([name, count]) => ({ name, count }));
  }, [profiles]);

  const priorityData = useMemo(() => {
    const pr = { '3 (상)': 0, '2 (중)': 0, '1 (하)': 0 };
    profiles.forEach(p => {
      if (p.priority === '3') pr['3 (상)']++;
      else if (p.priority === '2') pr['2 (중)']++;
      else if (p.priority === '1') pr['1 (하)']++;
    });
    return Object.entries(pr).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [profiles]);

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const orConds = term.split(/\s+or\s+/i);
    return profiles.filter(p => orConds.some(cond => {
      const ands = cond.split(/\s+and\s+/i).filter(Boolean);
      return ands.every(keyword => {
        const fieldMap = { '이름': 'name', '경력': 'career', '나이': 'age', '전문영역': 'expertise', '기타': 'otherInfo', '우선순위': 'priority' };
        const match = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
        if (match) {
          const field = fieldMap[match[1]];
          const v = match[2].toLowerCase();
          const pv = p[field] ? String(p[field]).toLowerCase() : '';
          return pv.includes(v);
        }
        const ag = keyword.match(/^(\d{1,2})대$/);
        if (ag) {
          const start = parseInt(ag[1], 10);
          if (start >= 10) {
            const min = start, max = start + 9;
            return p.age && p.age >= min && p.age <= max;
          }
        }
        const text = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
        return text.includes(keyword.toLowerCase());
      });
    }));
  }, [searchTerm, profiles]);

  const filteredProfiles = useMemo(() => {
    if (!activeFilter.type) return [];
    switch (activeFilter.type) {
      case 'age': {
        const g = activeFilter.value;
        return profiles.filter(p => p.age && (
          (g === '10대' && p.age < 20) ||
          (g === '20대' && p.age >= 20 && p.age < 30) ||
          (g === '30대' && p.age >= 30 && p.age < 40) ||
          (g === '40대' && p.age >= 40 && p.age < 50) ||
          (g === '50대 이상' && p.age >= 50)
        ));
      }
      case 'priority': {
        const v = activeFilter.value.split(' ')[0];
        return profiles.filter(p => p.priority === v);
      }
      case 'company': return profiles.filter(p => p.career?.includes(activeFilter.value));
      case 'expertise': return profiles.filter(p => p.expertise === activeFilter.value);
      default: return [];
    }
  }, [profiles, activeFilter]);

  return (
    <>
      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="검색... (예: 경력:네이버 AND 20대)"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border rounded-xl shadow-sm"
          />
        </div>

        {/* 캘린더 일괄 등록 버튼 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => onBulkSync('today')}
            className="px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 flex items-center">
            <CalendarIcon size={16} className="mr-1" /> 오늘 일정 전체 캘린더 등록/업데이트
          </button>
          <button
            onClick={() => onBulkSync('upcoming')}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center">
            <Zap size={16} className="mr-1" /> 다가오는 일정(D-3) 전체 캘린더 등록/업데이트
          </button>
        </div>

        {searchTerm.trim() && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0
                ? searchedProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onSyncCalendar={onSyncCalendar} />)
                : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      {longTermNoContactProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><BellRing className="mr-2 text-orange-500" />장기 미접촉 (3개월+)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {longTermNoContactProfiles.map(p =>
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete}
                isAlarmCard onSnooze={(id)=>onUpdate(id,{snoozeUntil:new Date(Date.now()+1000).toISOString()})}
                onConfirmAlarm={(id)=>onUpdate(id,{lastReviewedDate:new Date().toISOString()})}
                onSyncCalendar={onSyncCalendar} />)}
          </div>
        </section>
      )}

      {/* 오늘/다가오는 일정 섹션 */}
      {todayProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><CalendarIcon className="mr-2 text-red-500" />오늘의 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todayProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onSyncCalendar={onSyncCalendar} />)}
          </div>
        </section>
      )}

      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정 (D-3)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onSyncCalendar={onSyncCalendar} />)}
          </div>
        </section>
      )}

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
        <FilterResultSection
          title="미팅 진행 프로필 (최신순)"
          profiles={meetingProfiles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSyncCalendar={onSyncCalendar}
          onClear={() => setShowMeetingProfiles(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <defs>
                {COLORS.map((c, i) => (
                  <radialGradient key={`gradient-age-${i}`} id={`gradient-age-${i}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stopColor={c} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={c} stopOpacity={1} />
                  </radialGradient>
                ))}
              </defs>
              <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label onClick={(d) => handlePieClick('age', d.payload)}>
                {ageData.map((_, i) => <Cell key={`cell-age-${i}`} fill={`url(#gradient-age-${i})`} cursor="pointer" stroke="#fff" />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}명`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-bold text-gray-800 mb-4">우선순위별 분포</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <defs>
                <radialGradient id="gradient-priority-0"><stop offset="0%" stopColor="#FF4444" stopOpacity={0.7} /><stop offset="100%" stopColor="#FF4444" stopOpacity={1} /></radialGradient>
                <radialGradient id="gradient-priority-1"><stop offset="0%" stopColor="#FFBB28" stopOpacity={0.7} /><stop offset="100%" stopColor="#FFBB28" stopOpacity={1} /></radialGradient>
                <radialGradient id="gradient-priority-2"><stop offset="0%" stopColor="#00C49F" stopOpacity={0.7} /><stop offset="100%" stopColor="#00C49F" stopOpacity={1} /></radialGradient>
              </defs>
              <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label onClick={(d) => handlePieClick('priority', d.payload)}>
                {priorityData.map((_, i) => <Cell key={`cell-priority-${i}`} fill={`url(#gradient-priority-${i})`} cursor="pointer" stroke="#fff" />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}명`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      {(activeFilter.type === 'age' || activeFilter.type === 'priority') && (
        <FilterResultSection
          title={`"${activeFilter.value}" 필터 결과`}
          profiles={filteredProfiles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSyncCalendar={onSyncCalendar}
          onClear={() => setActiveFilter({ type: null, value: null })}
        />
      )}

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={keywordData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#FF8042" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v) => `${v}명`} />
            <Legend />
            <Bar dataKey="count" fill="url(#gradient-company)" onClick={(d) => handleBarClick('company', d)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {activeFilter.type === 'company' && (
        <FilterResultSection
          title={`"${activeFilter.value}" 경력자 필터 결과`}
          profiles={filteredProfiles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSyncCalendar={onSyncCalendar}
          onClear={() => setActiveFilter({ type: null, value: null })}
        />
      )}

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={useMemo(() => {
            const cnt = {};
            profiles.forEach(p => { if (p.expertise) cnt[p.expertise] = (cnt[p.expertise] || 0) + 1; });
            return Object.entries(cnt).map(([name, count]) => ({ name, count }));
          }, [profiles])} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00C49F" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#82ca9d" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v) => `${v}명`} />
            <Legend />
            <Bar dataKey="count" fill="url(#gradient-expertise)" onClick={(d) => handleBarClick('expertise', d)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {activeFilter.type === 'expertise' && (
        <FilterResultSection
          title={`"${activeFilter.value}" 전문영역 필터 결과`}
          profiles={filteredProfiles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSyncCalendar={onSyncCalendar}
          onClear={() => setActiveFilter({ type: null, value: null })}
        />
      )}
    </>
  );
};

// -------------------- Tab: Manage --------------------
const ManageTab = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, onSyncCalendar }) => {
  const { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PROFILES_PER_PAGE = 9;

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const orConds = term.split(/\s+or\s+/i);
    return profiles.filter(p => orConds.some(cond => {
      const ands = cond.split(/\s+and\s+/i).filter(Boolean);
      return ands.every(keyword => {
        const fieldMap = { '이름': 'name', '경력': 'career', '나이': 'age', '전문영역': 'expertise', '기타': 'otherInfo', '우선순위': 'priority' };
        const match = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
        if (match) {
          const field = fieldMap[match[1]];
          const v = match[2].toLowerCase();
          const pv = p[field] ? String(p[field]).toLowerCase() : '';
          return pv.includes(v);
        }
        const ag = keyword.match(/^(\d{1,2})대$/);
        if (ag) {
          const start = parseInt(ag[1], 10);
          if (start >= 10) {
            const min = start, max = start + 9;
            return p.age && p.age >= min && p.age <= max;
          }
        }
        const text = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
        return text.includes(keyword.toLowerCase());
      });
    }));
  }, [searchTerm, profiles]);

  const { currentProfiles, totalPages } = useMemo(() => {
    const sorted = [...profiles].sort((a,b) => a.name.localeCompare(b.name));
    const last = currentPage * PROFILES_PER_PAGE;
    const first = last - PROFILES_PER_PAGE;
    return { currentProfiles: sorted.slice(first, last), totalPages: Math.ceil(sorted.length / PROFILES_PER_PAGE) };
  }, [currentPage, profiles]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  return (
    <>
      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="검색... (예: 경력:네이버 AND 20대)"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border rounded-xl shadow-sm"
          />
        </div>
        {searchTerm.trim() && (
          <div>
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0
                ? searchedProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onSyncCalendar={onSyncCalendar} />)
                : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      {/* 새 프로필 추가 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500" />새 프로필 추가</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" />
            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.14) 1차 인터뷰)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
          <div className="flex justify-end">
            <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">추가하기</button>
          </div>
        </form>
      </section>

      {/* 엑셀 업로더 (CDN SheetJS 사용) */}
      <ExcelUploader onBulkAdd={handleBulkAdd} />

      {/* 전체 목록 + 페이지네이션 */}
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onSyncCalendar={onSyncCalendar} />)}
        </div>
        {totalPages > 1 && (
          <Pagination totalPages={totalPages} currentPage={currentPage} setCurrentPage={setCurrentPage} />
        )}
      </section>
    </>
  );
};

// -------------------- Pagination --------------------
const Pagination = ({ totalPages, currentPage, setCurrentPage }) => {
  if (totalPages <= 1) return null;
  const nums = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <nav className="mt-8 flex justify-center">
      <ul className="inline-flex items-center -space-x-px">
        {nums.map(n => (
          <li key={n}>
            <button
              onClick={() => setCurrentPage(n)}
              className={`py-2 px-4 leading-tight border border-gray-300 ${currentPage === n ? 'bg-yellow-400 text-white border-yellow-400' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              {n}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

// -------------------- Excel Uploader --------------------
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

        if (json.length < 2) {
          setMessage('엑셀 파일에 데이터가 없습니다 (2행부터 읽습니다).');
          setIsUploading(false);
          return;
        }

        const newProfiles = json.slice(1).map(row => ({
          name: row[2] || '',             // C
          career: row[3] || '',           // D
          age: row[5] ? Number(row[5]) : null, // F
          expertise: row[7] || '',        // H
          priority: row[9] ? String(row[9]) : '', // J
          meetingRecord: row[11] || '',   // L
          otherInfo: row[13] || '',       // N
          eventDate: parseDateFromRecord(row[11] || ''),
        })).filter(p => p.name && p.career);

        const resultMsg = await onBulkAdd(newProfiles);
        setMessage(resultMsg); setFile(null);
      } catch (err) {
        console.error("엑셀 처리 오류:", err);
        setMessage('엑셀 파일을 처리하는 중 오류가 발생했습니다.');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center"><UploadCloud className="mr-2 text-yellow-500" />엑셀로 일괄 등록</h2>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">2행부터 각 행을 하나의 프로필로 읽어 C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보 로 매핑합니다.</p>
        <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">※ 기존 이름과 겹치면 덮어쓰기(업데이트) 됩니다.</p>
        <input type="file" accept=".xlsx, .xls" onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100" />
        <button onClick={handleUpload} disabled={!file || isUploading}
          className="w-full flex justify-center items-center py-2 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
          {isUploading ? <Loader2 className="animate-spin" /> : '업로드 및 추가'}
        </button>
        {message && <p className="text-sm text-center text-gray-600">{message}</p>}
      </div>
    </section>
  );
};

// -------------------- App --------------------
export default function App() {
  const [accessCode, setAccessCode] = useState(localStorage.getItem('profileDbAccessCode') || null);
  const [profiles, setProfiles] = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });
  const [highlightedProfile, setHighlightedProfile] = useState(null);
  const [calendarReady, setCalendarReady] = useState(false);
  const [showMeetingProfiles, setShowMeetingProfiles] = useState(false);

  // form states
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  // SheetJS CDN 로드
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Firebase Auth (익명)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) setAuthStatus('authenticated');
      else {
        try { await signInAnonymously(auth); setAuthStatus('authenticated'); }
        catch (e) { console.error("Firebase 익명 로그인 오류:", e); setAuthStatus('error'); }
      }
    });
    return () => unsubscribe();
  }, []);

  // Google Calendar 준비 (gapi/GIS 초기화 + 최초 권한 팝업은 동작 시 요청)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ensureGoogleApisLoaded();
        await initGapi();
        initGis();
        if (mounted) setCalendarReady(true);
      } catch (e) {
        console.error('Google API 초기화 실패:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 딥링크 (혹시 있을 경우 하이라이트)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const profileId = urlParams.get('profileId');
    if (profileId) {
      setActiveTab(TAB_PAGE.DASHBOARD);
      setHighlightedProfile(profileId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Firestore ref
  const profilesCollectionRef = useMemo(() => {
    if (!accessCode) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  // 실시간 프로필 구독
  useEffect(() => {
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const qy = query(profilesCollectionRef);
    const unsubscribe = onSnapshot(qy, (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setProfiles(list);
    });
    return () => unsubscribe();
  }, [profilesCollectionRef]);

  // 로그인 코드 저장
  const handleLogin = (code) => { setAccessCode(code); localStorage.setItem('profileDbAccessCode', code); };

  // 새 프로필 추가
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
    const eventDate = parseDateFromRecord(newMeetingRecord);
    const profileData = {
      name: newName,
      career: newCareer,
      age: newAge ? Number(newAge) : null,
      otherInfo: newOtherInfo,
      eventDate,
      expertise: newExpertise || null,
      priority: newPriority || null,
      meetingRecord: newMeetingRecord || null
    };
    try {
      await addDoc(profilesCollectionRef, profileData);
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo('');
      setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    } catch (err) { console.error("프로필 저장 오류: ", err); }
  };

  // 엑셀 일괄 추가/업데이트
  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const existing = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updated = 0, added = 0;

    newProfiles.forEach(p => {
      const existId = existing.get(p.name);
      if (existId) { batch.set(doc(profilesCollectionRef, existId), p); updated++; }
      else { batch.set(doc(profilesCollectionRef), p); added++; }
    });

    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  // 업데이트/삭제
  const handleUpdate = async (profileId, updatedData) => {
    const { id, ...dataToUpdate } = updatedData;
    await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
  };
  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId) await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  // ✅ 단일 프로필 캘린더 동기화
  const onSyncCalendar = async (profile) => {
    if (!calendarReady) { alert('Google API 초기화 중입니다. 잠시 후 다시 시도해주세요.'); return; }
    if (!profile.eventDate) { alert('이 프로필에는 이벤트 날짜가 없습니다. (미팅기록에 (YY.MM.DD) 형식 입력)'); return; }

    try {
      await requestCalendarAccess(); // 최초 1회 팝업
      const summary = `미팅: ${profile.name}`;
      const description = [
        profile.expertise ? `전문영역: ${profile.expertise}` : '',
        profile.career ? `경력: ${profile.career}` : '',
        profile.otherInfo ? `기타: ${profile.otherInfo}` : '',
      ].filter(Boolean).join('\n');
      const linkUrl = `${APP_BASE_URL}?profileId=${profile.id}`;

      let result;
      if (profile.calendarEventId) {
        result = await updateAllDayEvent(profile.calendarEventId, { summary, description, dateISO: profile.eventDate, linkUrl });
      } else {
        result = await createAllDayEvent({ summary, description, dateISO: profile.eventDate, linkUrl });
        // 이벤트 ID 저장
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', accessCode, profile.id), {
          calendarEventId: result.id
        });
      }
      alert('구글 캘린더 동기화가 완료되었습니다.');
      if (result?.htmlLink) window.open(result.htmlLink, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error('캘린더 동기화 실패:', e);
      alert('캘린더 동기화에 실패했습니다. (콘솔 확인)');
    }
  };

  // ✅ 오늘/다가오는 일정 일괄 동기화
  const onBulkSync = async (type) => {
    if (!calendarReady) { alert('Google API 초기화 중입니다. 잠시 후 다시 시도해주세요.'); return; }
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const threeDaysLater = new Date(todayStart); threeDaysLater.setUTCDate(threeDaysLater.getUTCDate() + 3);

    const pick = profiles.filter(p => p.eventDate).filter(p => {
      const d = new Date(p.eventDate);
      if (type === 'today') return d >= todayStart && d < todayEnd;
      if (type === 'upcoming') return d >= threeDaysLater && d < new Date(Date.UTC(threeDaysLater.getUTCFullYear(), threeDaysLater.getUTCMonth(), threeDaysLater.getUTCDate() + 1));
      return false;
    });

    if (pick.length === 0) { alert('대상 프로필이 없습니다.'); return; }

    try {
      await requestCalendarAccess();
      let ok = 0, fail = 0;
      for (const p of pick) {
        try {
          await onSyncCalendar(p);
          ok++;
        } catch {
          fail++;
        }
      }
      alert(`캘린더 일괄 동기화 완료: ${ok}건 성공${fail ? `, ${fail}건 실패` : ''}`);
    } catch (e) {
      console.error(e);
      alert('권한 요청 또는 동기화 중 오류가 발생했습니다.');
    }
  };

  const formState = { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord };

  if (!accessCode) return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <style>{`
        @keyframes highlight-animation { 0% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.7); } 70% { box-shadow: 0 0 20px 10px rgba(251, 191, 36, 0); } 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); } }
        .highlight { animation: highlight-animation 2.5s ease-out; }
        @keyframes slide-down-fade-in { from { opacity: 0; transform: translateY(-15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: slide-down-fade-in 0.5s ease-out forwards; }
        .animate-cascade { animation: slide-down-fade-in 0.5s ease-out forwards; opacity: 0; }
      `}</style>

      {showDeleteConfirm.show && (
        <ConfirmationModal
          message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
        />
      )}

      <header className="flex justify-between items-center p-6 border-b bg-white">
        <div className="flex items-center space-x-3">
          <Users className="text-yellow-500 w-8 h-8" />
          <h1 className="text-2xl font-bold text-gray-800">프로필 대시보드</h1>
          <span className="text-sm bg-gray-200 px-3 py-1 rounded-full font-mono">{accessCode}</span>
        </div>
        <button
          onClick={() => { setAccessCode(null); localStorage.removeItem('profileDbAccessCode'); }}
          className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center"
        >
          <LogOut className="w-4 h-4 mr-1.5" /> 로그아웃
        </button>
      </header>

      <div className="flex justify-center space-x-2 border-b bg-white px-6 py-2 sticky top-0 z-10">
        <button onClick={() => setActiveTab(TAB_PAGE.DASHBOARD)}
          className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === TAB_PAGE.DASHBOARD ? 'bg-yellow-400 text-white' : 'text-gray-600 hover:bg-yellow-100'}`}>
          대시보드
        </button>
        <button onClick={() => setActiveTab(TAB_PAGE.MANAGE)}
          className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === TAB_PAGE.MANAGE ? 'bg-yellow-400 text-white' : 'text-gray-600 hover:bg-yellow-100'}`}>
          프로필 관리
        </button>
      </div>

      <main className="p-6 space-y-12">
        {activeTab === TAB_PAGE.DASHBOARD && (
          <DashboardTab
            profiles={profiles}
            onUpdate={handleUpdate}
            onDelete={handleDeleteRequest}
            highlightedProfile={highlightedProfile}
            setHighlightedProfile={setHighlightedProfile}
            onSyncCalendar={onSyncCalendar}
            onBulkSync={onBulkSync}
          />
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
            onSyncCalendar={onSyncCalendar}
          />
        )}
      </main>
    </div>
  );
}
