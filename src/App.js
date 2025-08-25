import React, { useMemo, useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  setLogLevel, updateDoc, writeBatch
} from 'firebase/firestore';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2,
  ShieldAlert, X, Save, UploadCloud, BellRing, Info
} from 'lucide-react';

// --- Google Calendar API Integration ---
// 사용자로부터 전달받은 키를 적용했습니다.
const GOOGLE_API_KEY = "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY";
const GOOGLE_CLIENT_ID = "9275853060-01csg1l9qr9bq7ddrkn61up6vpop3tid.apps.googleusercontent.com";

let tokenClient = null;
let gapiInited = false;
let gisInited = false;

const initGoogle = async () => {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID) {
        console.warn("Google API Key 또는 Client ID가 설정되지 않았습니다. 캘린더 기능이 비활성화됩니다.");
        return resolve();
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
          });
          gapiInited = true;
          if (gisInited) resolve();
        } catch (e) {
          reject(e);
        }
      });
    };
    script.onerror = reject;
    document.body.appendChild(script);

    const script2 = document.createElement("script");
    script2.src = "https://accounts.google.com/gsi/client";
    script2.onload = () => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.events',
            callback: '', // 콜백은 Promise로 처리됩니다.
        });
        gisInited = true;
        if (gapiInited) resolve();
    };
    script2.onerror = reject;
    document.body.appendChild(script2);
  });
};

const createCalendarEvent = async ({ summary, description, startISO, endISO }) => {
    return new Promise((resolve, reject) => {
        if (!gapiInited || !gisInited) {
            return reject(new Error("Google API가 초기화되지 않았거나, API Key/Client ID가 필요합니다."));
        }

        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) {
                return reject(resp);
            }
            try {
                const event = {
                    'summary': summary,
                    'description': description,
                    'start': { 'dateTime': startISO, 'timeZone': 'Asia/Seoul' },
                    'end': { 'dateTime': endISO, 'timeZone': 'Asia/Seoul' },
                    'reminders': {
                        'useDefault': false,
                        'overrides': [{ 'method': 'popup', 'minutes': 10 }],
                    },
                };

                const request = window.gapi.client.calendar.events.insert({
                    'calendarId': 'primary',
                    'resource': event,
                });

                request.execute((event) => {
                    resolve(event);
                });
            } catch (err) {
                reject(err);
            }
        };
        
        if (window.gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

const extractLatestKSTEventISOFromRecord = (recordText) => {
  if (!recordText) return null;
  const latestDate = parseDateFromRecordForSort(recordText);
  if (!latestDate) return null;

  const kstDate = new Date(latestDate.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  
  const start = new Date(kstDate);
  start.setHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setHours(start.getHours() + 1);

  return { startISO: start.toISOString(), endISO: end.toISOString() };
};

// --- Firebase Setup ---
// 환경 변수에서 Firebase 구성을 가져옵니다.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'profile-db-app-junyoungoh';

let app, db, auth;
if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setLogLevel('debug');
} else {
    console.error("Firebase 구성이 없습니다. 앱이 제대로 작동하지 않을 수 있습니다.");
}


// --- Constants ---
const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];
const TAB_PAGE = { DASHBOARD: 'dashboard', MANAGE: 'manage' };

// --- Utils ---
const parseDateFromRecordForSort = (recordText) => {
  if (!recordText) return null;
  const rx = /\((\d{2})\.(\d{2})\.(\d{2})\)/g;
  let latest = null, m;
  while ((m = rx.exec(recordText)) !== null) {
    const y = 2000 + parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1;
    const dd = parseInt(m[3], 10);
    const d = new Date(y, mm, dd);
    if (!latest || d > latest) latest = d;
  }
  return latest;
};

// --- UI Components ---

const Notification = ({ message, type, onDismiss }) => {
    if (!message) return null;
    const baseClasses = "fixed top-5 right-5 p-4 rounded-lg shadow-lg flex items-center z-50 animate-fade-in";
    const typeClasses = {
        success: "bg-green-100 text-green-800",
        error: "bg-red-100 text-red-800",
        info: "bg-blue-100 text-blue-800",
    };
    return (
        <div className={`${baseClasses} ${typeClasses[type] || typeClasses.info}`}>
            <Info size={20} className="mr-3" />
            <span>{message}</span>
            <button onClick={onDismiss} className="ml-4 text-xl font-bold">&times;</button>
        </div>
    );
};

const LoginScreen = ({ onLogin, authStatus }) => {
  const [codeInput, setCodeInput] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (codeInput.trim()) onLogin(codeInput.trim());
  };
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
            <input
              type="text" placeholder="Access Code"
              className="w-full pl-10 pr-3 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:outline-none"
              value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={authStatus !== 'authenticated'}
              className="w-full flex justify-center py-3 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 transition-colors"
            >
              {authStatus === 'authenticating' && <Loader2 className="animate-spin mr-2" />}
              {authStatus === 'authenticated' ? '데이터 불러오기' : '인증 중...'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

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

const ProfileCard = ({ profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm, onAddToCalendar }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const prColors = { '3': 'bg-red-100 text-red-800', '2': 'bg-yellow-100 text-yellow-800', '1': 'bg-green-100 text-green-800' };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedProfile(p => ({ ...p, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
  };
  const handleSave = () => {
    onUpdate(profile.id, editedProfile);
    setIsEditing(false);
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
        <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.22) 1차 인터뷰)" className="w-full p-2 border rounded text-sm h-20" />
        <div className="flex justify-between items-center">
            <button
                onClick={() => onAddToCalendar?.(editedProfile)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
            >
                캘린더 등록
            </button>
            <div className="flex space-x-2">
                <button onClick={() => setIsEditing(false)} className="p-2 text-gray-500 hover:text-gray-800"><X size={20} /></button>
                <button onClick={handleSave} className="p-2 text-green-600 hover:text-green-800"><Save size={20} /></button>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`profile-card-${profile.id}`} className="bg-white p-4 rounded-lg shadow relative group transition-shadow hover:shadow-xl">
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

      {isAlarmCard && (
        <div className="mt-3 pt-3 border-t flex justify-end space-x-2">
          <button onClick={() => onConfirmAlarm(profile.id)} className="text-xs bg-gray-200 text-gray-700 font-semibold px-3 py-1 rounded-full hover:bg-gray-300">확인</button>
          <button onClick={() => onSnooze(profile.id)} className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full hover:bg-indigo-200">3개월 후 다시 알림</button>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2 items-center">
        <button
          onClick={() => onAddToCalendar?.(profile)}
          className="px-3 py-1.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
        >
          캘린더 등록
        </button>
        <div className="space-x-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity inline-block">
          <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:underline text-xs">수정</button>
          <button onClick={() => onDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button>
        </div>
      </div>
    </div>
  );
};

const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, onAddToCalendar }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in mt-8">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile, i) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${i * 50}ms` }}>
            <ProfileCard profile={profile} onUpdate={onUpdate} onDelete={onDelete} onAddToCalendar={onAddToCalendar} />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

// --- Dashboard Tab ---
const DashboardTab = ({ profiles, onUpdate, onDelete, highlightedProfile, setHighlightedProfile, onAddToCalendar }) => {
  const [activeFilter, setActiveFilter] = useState({ type: null, value: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [showMeetingProfiles, setShowMeetingProfiles] = useState(false);

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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeDaysLater = new Date(todayStart); threeDaysLater.setDate(threeDaysLater.getDate() + 4);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const today = [], upcoming = [], meetings = [], longTerm = [];
    profiles.forEach(p => {
      const ev = p.meetingRecord ? parseDateFromRecordForSort(p.meetingRecord) : (p.eventDate ? new Date(p.eventDate) : null);
      if (ev) {
          meetings.push({ ...p, _ev: ev });
          if (ev >= todayStart && ev < new Date(new Date(todayStart).setDate(todayStart.getDate() + 1))) {
            today.push({ ...p, _ev: ev });
          } else if (ev > now && ev < threeDaysLater) {
            upcoming.push({ ...p, _ev: ev });
          }
      }
      
      const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : ev;
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (lastContact && lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) {
          longTerm.push({ ...p, _ev: lastContact });
      }
    });

    const byTimeAsc = (a,b) => a._ev - b._ev;
    const byTimeDesc = (a,b) => b._ev - a._ev;
    return {
      todayProfiles: today.sort(byTimeAsc),
      upcomingProfiles: upcoming.sort(byTimeAsc),
      meetingProfiles: meetings.sort(byTimeDesc),
      longTermNoContactProfiles: longTerm.sort(byTimeAsc),
    };
  }, [profiles]);

  const handleSnooze = (profileId) => {
    const d = new Date(); d.setMonth(d.getMonth() + 3);
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

  const searchProfiles = (term, sourceProfiles) => {
    if (!term) return [];
    const orConds = term.split(/\s+or\s+/i);
    return sourceProfiles.filter(p => orConds.some(cond => {
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
  };

  const searchedProfiles = useMemo(() => searchProfiles(searchTerm.trim(), profiles), [searchTerm, profiles]);

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
        {searchTerm.trim() && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0
                ? searchedProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onAddToCalendar={onAddToCalendar} />)
                : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      {longTermNoContactProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><BellRing className="mr-2 text-orange-500" />장기 미접촉 알림 (3개월 이상)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {longTermNoContactProfiles.map(p =>
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete}
                isAlarmCard onSnooze={handleSnooze}
                onConfirmAlarm={handleConfirmAlarm}
                onAddToCalendar={onAddToCalendar}
              />)}
          </div>
        </section>
      )}

      {todayProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todayProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onAddToCalendar={onAddToCalendar} />)}
          </div>
        </section>
      )}

      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onAddToCalendar={onAddToCalendar} />)}
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
          onAddToCalendar={onAddToCalendar}
          onClear={() => setShowMeetingProfiles(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label onClick={(d) => handlePieClick('age', d.payload)}>
                {ageData.map((_, i) => <Cell key={`cell-age-${i}`} fill={COLORS[i % COLORS.length]} cursor="pointer" stroke="#fff" />)}
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
              <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label onClick={(d) => handlePieClick('priority', d.payload)}>
                {priorityData.map((_, i) => <Cell key={`cell-priority-${i}`} fill={['#FF4444', '#FFBB28', '#00C49F'][i]} cursor="pointer" stroke="#fff" />)}
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
          onAddToCalendar={onAddToCalendar}
          onClear={() => setActiveFilter({ type: null, value: null })}
        />
      )}

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={keywordData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v) => `${v}명`} />
            <Legend />
            <Bar dataKey="count" fill="#FFBB28" onClick={(d) => handleBarClick('company', d)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {activeFilter.type === 'company' && (
        <FilterResultSection
          title={`"${activeFilter.value}" 경력자 필터 결과`}
          profiles={filteredProfiles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddToCalendar={onAddToCalendar}
          onClear={() => setActiveFilter({ type: null, value: null })}
        />
      )}

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={expertiseData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v) => `${v}명`} />
            <Legend />
            <Bar dataKey="count" fill="#00C49F" onClick={(d) => setActiveFilter({ type: 'expertise', value: d.name })} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {activeFilter.type === 'expertise' && (
        <FilterResultSection
          title={`"${activeFilter.value}" 전문영역 필터 결과`}
          profiles={filteredProfiles}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddToCalendar={onAddToCalendar}
          onClear={() => setActiveFilter({ type: null, value: null })}
        />
      )}
    </>
  );
};

// --- Manage Tab ---
const ManageTab = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState, onAddToCalendar }) => {
  const { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PROFILES_PER_PAGE = 9;

  const searchProfiles = (term, sourceProfiles) => {
    if (!term) return [];
    const orConds = term.split(/\s+or\s+/i);
    return sourceProfiles.filter(p => orConds.some(cond => {
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
  };
  
  const searchedProfiles = useMemo(() => searchProfiles(searchTerm.trim(), profiles), [searchTerm, profiles]);

  const { currentProfiles, totalPages } = useMemo(() => {
    const source = searchTerm.trim() ? searchedProfiles : profiles;
    const sorted = [...source].sort((a, b) => a.name.localeCompare(b.name));
    const last = currentPage * PROFILES_PER_PAGE;
    const first = last - PROFILES_PER_PAGE;
    return { currentProfiles: sorted.slice(first, last), totalPages: Math.ceil(sorted.length / PROFILES_PER_PAGE) };
  }, [currentPage, profiles, searchTerm, searchedProfiles]);

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
      </section>

      {/* 새 프로필 추가 */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500" />새 프로필 추가</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" required/>
            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" required/>
          <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.22) 1차 인터뷰)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
          <div className="flex justify-end">
            <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">추가하기</button>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">프로필 목록</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentProfiles.map(p => <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete} onAddToCalendar={onAddToCalendar} />)}
        </div>
        {totalPages > 1 && (
          <Pagination totalPages={totalPages} currentPage={currentPage} setCurrentPage={setCurrentPage} />
        )}
      </section>
    </>
  );
};

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

const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const handleFileChange = (e) => { setFile(e.target.files[0]); setMessage(''); };
  const handleUpload = async () => {
    if (!file) { setMessage('파일을 먼저 선택해주세요.'); return; }
    if (typeof window.XLSX === 'undefined') {
        setMessage('엑셀 라이브러리를 로딩 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }
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
          name: row[2] || '',           // C
          career: row[3] || '',         // D
          age: row[5] ? Number(row[5]) : null, // F
          expertise: row[7] || '',      // H
          priority: row[9] ? String(row[9]) : '', // J
          meetingRecord: row[11] || '', // L
          otherInfo: row[13] || '',     // N
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

// --- Main App Component ---
export default function App() {
  const [accessCode, setAccessCode] = useState(localStorage.getItem('profileDbAccessCode') || null);
  const [profiles, setProfiles] = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });
  const [highlightedProfile, setHighlightedProfile] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: 'info' });

  // Form states
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type });
    setTimeout(() => {
        setNotification({ message: '', type: 'info' });
    }, duration);
  };

  useEffect(() => {
    initGoogle().catch(e => {
        console.error("Google API 초기화 실패", e);
        // Check if the error is the specific permission denied error
        if (e && e.error && e.error.status === 'PERMISSION_DENIED') {
            showNotification("Google API 오류: 현재 앱 주소가 Google Cloud Console에 등록되지 않았습니다. 설정을 확인해주세요.", "error", 10000); // 10초간 표시
        } else {
            showNotification("Google API 초기화에 실패했습니다.", "error");
        }
    });
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthStatus('authenticated');
      } else {
        try {
          if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
          setAuthStatus('authenticated');
        } catch (e) {
          console.error("Firebase 로그인 오류:", e);
          setAuthStatus('error');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const profilesCollectionRef = useMemo(() => {
    if (!accessCode || !db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  useEffect(() => {
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const qy = query(profilesCollectionRef);
    const unsubscribe = onSnapshot(qy, (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setProfiles(list);
    }, (error) => {
        console.error("Firestore 구독 오류:", error);
        showNotification("데이터를 불러오는 데 실패했습니다.", "error");
    });
    return () => unsubscribe();
  }, [profilesCollectionRef]);

  const handleLogin = (code) => { setAccessCode(code); localStorage.setItem('profileDbAccessCode', code); };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
    const profileData = {
      name: newName,
      career: newCareer,
      age: newAge ? Number(newAge) : null,
      otherInfo: newOtherInfo,
      expertise: newExpertise || null,
      priority: newPriority || null,
      meetingRecord: newMeetingRecord || null,
      eventDate: parseDateFromRecordForSort(newMeetingRecord)?.toISOString() || null,
      lastReviewedDate: new Date().toISOString(),
    };
    try {
      await addDoc(profilesCollectionRef, profileData);
      showNotification(`${newName}님 프로필이 추가되었습니다.`, 'success');
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo('');
      setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    } catch (err) { 
        console.error("프로필 저장 오류: ", err);
        showNotification("프로필 저장에 실패했습니다.", "error");
    }
  };

  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const existing = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updated = 0, added = 0;

    newProfiles.forEach(p => {
      const existId = existing.get(p.name);
      const profileData = {
          ...p,
          eventDate: parseDateFromRecordForSort(p.meetingRecord)?.toISOString() || null,
          lastReviewedDate: new Date().toISOString(),
      };
      if (existId) { batch.set(doc(profilesCollectionRef, existId), profileData); updated++; }
      else { batch.set(doc(collection(profilesCollectionRef)), profileData); added++; }
    });

    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const handleUpdate = async (profileId, updatedData) => {
    const patch = { ...updatedData };
    if (typeof updatedData.meetingRecord === 'string') {
      patch.eventDate = parseDateFromRecordForSort(updatedData.meetingRecord)?.toISOString() || null;
    }
    await updateDoc(doc(profilesCollectionRef, profileId), patch);
    showNotification("프로필이 업데이트되었습니다.", "success");
  };
  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId) await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    showNotification("프로필이 삭제되었습니다.", "success");
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  const handleAddToCalendar = async (profile) => {
    try {
      if (!profile?.meetingRecord) {
        showNotification('미팅기록에 (YY.MM.DD) 날짜가 있어야 캘린더 등록이 가능합니다.', 'error');
        return;
      }
      const t = extractLatestKSTEventISOFromRecord(profile.meetingRecord);
      if (!t) {
        showNotification('미팅기록에서 유효한 (YY.MM.DD) 날짜를 찾지 못했습니다.', 'error');
        return;
      }
      const summary = `${profile.name} 미팅`;
      const description = [
        profile.career ? `경력: ${profile.career}` : '',
        profile.expertise ? `전문영역: ${profile.expertise}` : '',
        profile.otherInfo ? `기타: ${profile.otherInfo}` : '',
      ].filter(Boolean).join('\n');

      await createCalendarEvent({
        summary,
        description,
        startISO: t.startISO,
        endISO: t.endISO,
      });

      showNotification('구글 캘린더에 등록했습니다.', 'success');
    } catch (e) {
      console.error(e);
      showNotification(e.userMessage || e.message || '캘린더 등록에 실패했습니다.', 'error');
    }
  };

  const formState = { newName, newCareer, newAge, newOtherInfo, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewExpertise, setNewPriority, setNewMeetingRecord };

  if (!accessCode) return <LoginScreen onLogin={handleLogin} authStatus={authStatus} />;

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <style>{`
        @keyframes highlight-animation {
          0% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.7); }
          70% { box-shadow: 0 0 20px 10px rgba(251, 191, 36, 0); }
          100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
        }
        .highlight { animation: highlight-animation 2.5s ease-out; }
        @keyframes slide-down-fade-in { from { opacity: 0; transform: translateY(-15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: slide-down-fade-in 0.5s ease-out forwards; }
        .animate-cascade { animation: slide-down-fade-in 0.5s ease-out forwards; opacity: 0; }
      `}</style>
      
      <Notification 
        message={notification.message} 
        type={notification.type} 
        onDismiss={() => setNotification({ message: '', type: 'info' })} 
      />

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
            onAddToCalendar={handleAddToCalendar}
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
            onAddToCalendar={handleAddToCalendar}
          />
        )}
      </main>
    </div>
  );
}
