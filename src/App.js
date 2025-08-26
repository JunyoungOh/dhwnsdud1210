// App.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  setLogLevel, updateDoc, writeBatch, getDoc
} from 'firebase/firestore';
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL
} from 'firebase/storage';

import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';

import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2,
  ShieldAlert, X, Save, UploadCloud, BellRing, Share2, RefreshCw,
  Image as ImageIcon, CalendarPlus
} from 'lucide-react';

// =========================
// 환경변수 (.env / Netlify)
// =========================
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// =========================
const appId = 'profile-db-app-junyoungoh';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
setLogLevel('debug');

const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

const TAB_PAGE = {
  DASHBOARD: 'dashboard',
  MANAGE: 'manage'
};

// =========================
// 유틸 & 헬퍼
// =========================
const parseDateFromRecord = (recordText) => {
  if (!recordText) return null;
  // 반드시 글로벌 플래그 /g 사용 (matchAll 요구사항)
  const regex = /\((\d{2})\.(\d{2})\.(\d{2})\)(?:\s*(AM|PM)\s*(\d{1,2})시\s*(\d{1,2})분)?/gi;
  const matches = recordText.matchAll(regex);
  let latestDate = null;

  for (const match of matches) {
    const year = 2000 + parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const ampm = match[4];
    let hour = match[5] ? parseInt(match[5], 10) : 0;
    const minute = match[6] ? parseInt(match[6], 10) : 0;

    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const currentDate = new Date(year, month, day, hour, minute);
    if (!latestDate || currentDate > latestDate) latestDate = currentDate;
  }
  return latestDate ? latestDate.toISOString() : null;
};

const sanitizeKey = (str) => (str || '')
  .toString()
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, '') // 확장자 제거
  .replace(/[\s_\-()]+/g, '')
  .trim();

// 업로드 중 정체(0% 고정) 가드를 둔 프로필 사진 업로드
const uploadAvatarWithGuard = (file, path) =>
  new Promise((resolve, reject) => {
    const sRef = storageRef(storage, path);
    const meta = { contentType: file.type || 'application/octet-stream' };
    const task = uploadBytesResumable(sRef, file, meta);

    let last = { bytes: 0, ts: Date.now() };
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (task.snapshot && task.snapshot.bytesTransferred > last.bytes) {
        last = { bytes: task.snapshot.bytesTransferred, ts: now };
      } else if (now - last.ts > 15000) { // 15초 무진행
        clearInterval(watchdog);
        try { task.cancel(); } catch {}
        reject(new Error('업로드가 15초 이상 진행되지 않아 중단되었습니다.'));
      }
    }, 3000);

    task.on('state_changed',
      () => {},
      (err) => {
        clearInterval(watchdog);
        reject(err);
      },
      async () => {
        clearInterval(watchdog);
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
    );
  });

// =========================
// 공유 상세 보기
// =========================
const ProfileDetailView = ({ profileId, accessCode }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileDocRef = doc(db, 'artifacts', appId, 'public', 'data', accessCode, profileId);
        const docSnap = await getDoc(profileDocRef);
        if (docSnap.exists()) setProfile({ ...docSnap.data(), id: docSnap.id });
        else setError('프로필을 찾을 수 없습니다.');
      } catch (err) {
        console.error("Error fetching profile:", err);
        setError('프로필을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [profileId, accessCode]);

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="animate-spin h-10 w-10 text-yellow-500" /></div>;
  if (error) return <div className="flex justify-center items-center min-h-screen text-red-500">{error}</div>;
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
        {profile.photoURL && (
          <div className="mb-4">
            <img src={profile.photoURL} alt={`${profile.name} 사진`} className="w-28 h-28 object-cover rounded-full border" />
          </div>
        )}
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

// =========================
// 로그인 화면
// =========================
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

// =========================
// 삭제 확인 모달
// =========================
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

// =========================
// 프로필 카드 (사진/편집/캘린더)
// =========================
const ProfileCard = ({
  profile, onUpdate, onDelete, isAlarmCard, onSnooze, onConfirmAlarm, accessCode,
  onUploadPhoto, googleApiReady, isGoogleSignedIn, onAddToCalendar
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setEditedProfile(profile), [profile]);

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
    setSaving(true);
    try {
      const eventDate = parseDateFromRecord(editedProfile.meetingRecord);
      await onUpdate(profile.id, { ...editedProfile, eventDate });
      if (photoFile) {
        await onUploadPhoto(profile.id, photoFile);
      }
      setIsEditing(false);
    } catch (e) {
      console.error('프로필 저장 실패:', e);
      alert(e?.message || '프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => alert('공유 링크가 클립보드에 복사되었습니다.'),
      () => alert('링크 복사에 실패했습니다.')
    );
  };

  // 아바타 렌더
  const Avatar = () => (
    profile.photoURL ? (
      <img src={profile.photoURL} alt={`${profile.name} 사진`}
           className="w-10 h-10 rounded-full object-cover border" />
    ) : (
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold select-none">
        {profile.name ? profile.name[0] : <ImageIcon size={16} />}
      </div>
    )
  );

  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border-l-4 border-yellow-400 relative space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden border bg-gray-100 flex items-center justify-center">
            {photoFile
              ? <img src={URL.createObjectURL(photoFile)} alt="preview" className="w-full h-full object-cover" />
              : (profile.photoURL
                 ? <img src={profile.photoURL} alt="avatar" className="w-full h-full object-cover" />
                 : <ImageIcon className="text-gray-400" />)}
          </div>
          <label className="text-xs text-gray-600">
            <span className="inline-block mb-1 font-medium">사진 파일 업로드</span>
            <input type="file" accept="image/*"
                   onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                   className="block text-xs" />
          </label>
        </div>

        <input name="name" value={editedProfile.name} onChange={handleInputChange}
               placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
        <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange}
               placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
        <textarea name="career" value={editedProfile.career} onChange={handleInputChange}
                  placeholder="경력" className="w-full p-2 border rounded text-sm h-20" />
        <div className="grid grid-cols-2 gap-2">
          <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange}
                 placeholder="나이" className="w-full p-2 border rounded text-sm" />
          <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange}
                 placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange}
                  placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
        <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange}
                  placeholder="미팅기록 (예: (25.08.14) PM 7시 00분)" className="w-full p-2 border rounded text-sm h-20" />

        <div className="flex justify-end space-x-2">
          <button onClick={() => setIsEditing(false)} className="p-2 text-gray-500 hover:text-gray-800" disabled={saving}>
            <X size={20} />
          </button>
          <button onClick={handleSave} className="p-2 text-green-600 hover:text-green-800" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow relative group">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Avatar />
          <div className="flex items-baseline space-x-2">
            <h3 className="font-bold text-yellow-600">{profile.name}</h3>
            <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile.priority && (
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${priorityColors[profile.priority] || 'bg-gray-100 text-gray-800'}`}>
              {profile.priority}
            </span>
          )}
          {googleApiReady && (
            isGoogleSignedIn ? (
              <button
                title="이 프로필 일정만 캘린더에 추가"
                onClick={() => onAddToCalendar(profile)}
                className="hidden sm:inline-flex text-xs items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-100"
              >
                <CalendarPlus size={14} /> 캘린더에 추가
              </button>
            ) : (
              <span className="text-[11px] text-gray-400">Google 로그인 필요</span>
            )
          )}
        </div>
      </div>

      {profile.expertise && <p className="text-sm font-semibold text-gray-600 mt-1">{profile.expertise}</p>}
      <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>

      {profile.otherInfo && (
        <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>
      )}

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

      <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleShare} className="text-gray-500 hover:text-gray-800" title="공유 링크 복사"><Share2 size={14} /></button>
        <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:text-blue-700" title="수정"><Edit size={14} /></button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="text-red-500 hover:text-red-700" title="삭제"><Trash2 size={14} /></button>
      </div>
    </div>
  );
};

// =========================
// 필터 결과 섹션
// =========================
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, ...rest }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile, index) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${index * 50}ms` }}>
            <ProfileCard profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} {...rest} />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

// =========================
// 대시보드 탭
// =========================
const DashboardTab = ({ profiles, onUpdate, onDelete, accessCode, googleApiReady, isGoogleSignedIn, onAddToCalendar }) => {
  const [activeFilter, setActiveFilter] = useState({ type: null, value: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [showMeetingProfiles, setShowMeetingProfiles] = useState(false);

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
    const threeDaysLater = new Date(todayStart);
    threeDaysLater.setDate(threeDaysLater.getDate() + 4);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const today = [];
    const upcoming = [];
    const meetings = [];
    const longTerm = [];

    profiles.forEach(p => {
      if (p.eventDate) {
        meetings.push(p);
        const eventDate = new Date(p.eventDate);
        if (eventDate >= todayStart && eventDate < new Date(new Date(todayStart).setDate(todayStart.getDate() + 1))) {
          today.push(p);
        } else if (eventDate > now && eventDate < threeDaysLater) {
          upcoming.push(p);
        }

        const lastContact = p.lastReviewedDate ? new Date(p.lastReviewedDate) : eventDate;
        const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;

        if (lastContact < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now)) {
          longTerm.push(p);
        }
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
    const snoozeDate = new Date();
    snoozeDate.setMonth(snoozeDate.getMonth() + 3);
    onUpdate(profileId, { snoozeUntil: snoozeDate.toISOString() });
  };

  const handleConfirmAlarm = (profileId) => {
    onUpdate(profileId, { lastReviewedDate: new Date().toISOString() });
  };

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

  const keywordData = useMemo(() => {
    return TARGET_KEYWORDS.map(keyword => ({
      name: keyword,
      count: profiles.filter(p => p.career?.includes(keyword)).length
    }));
  }, [profiles]);

  const expertiseData = useMemo(() => {
    const expertiseCount = {};
    profiles.forEach(p => {
      if (p.expertise) {
        expertiseCount[p.expertise] = (expertiseCount[p.expertise] || 0) + 1;
      }
    });
    return Object.entries(expertiseCount).map(([name, count]) => ({ name, count }));
  }, [profiles]);

  const priorityData = useMemo(() => {
    const priorities = { '3 (상)': 0, '2 (중)': 0, '1 (하)': 0 };
    profiles.forEach(p => {
      if (p.priority === '3') priorities['3 (상)']++;
      else if (p.priority === '2') priorities['2 (중)']++;
      else if (p.priority === '1') priorities['1 (하)']++;
    });
    return Object.entries(priorities).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [profiles]);

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];

    const orConditions = term.split(/\s+or\s+/i);

    return profiles.filter(p => {
      return orConditions.some(condition => {
        const andKeywords = condition.split(/\s+and\s+/i).filter(k => k);

        return andKeywords.every(keyword => {
          const fieldMap = { '이름': 'name', '경력': 'career', '나이': 'age', '전문영역': 'expertise', '기타': 'otherInfo', '우선순위': 'priority' };
          const fieldMatch = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);

          if (fieldMatch) {
            const fieldName = fieldMap[fieldMatch[1]];
            const fieldValue = fieldMatch[2].toLowerCase();
            const profileValue = p[fieldName] ? String(p[fieldName]).toLowerCase() : '';
            return profileValue.includes(fieldValue);
          }

          const ageGroupMatch = keyword.match(/^(\d{1,2})대$/);
          if (ageGroupMatch) {
            const decadeStart = parseInt(ageGroupMatch[1], 10);
            if (decadeStart >= 10) {
              const minAge = decadeStart;
              const maxAge = decadeStart + 9;
              return p.age && p.age >= minAge && p.age <= maxAge;
            }
          }

          const profileText = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
          return profileText.includes(keyword.toLowerCase());
        });
      });
    });
  }, [searchTerm, profiles]);

  const filteredProfiles = useMemo(() => {
    if (!activeFilter.type) return [];
    switch (activeFilter.type) {
      case 'age': {
        const ageGroup = activeFilter.value;
        return profiles.filter(p => {
          if (!p.age) return false;
          if (ageGroup === '10대') return p.age < 20;
          if (ageGroup === '20대') return p.age >= 20 && p.age < 30;
          if (ageGroup === '30대') return p.age >= 30 && p.age < 40;
          if (ageGroup === '40대') return p.age >= 40 && p.age < 50;
          if (ageGroup === '50대 이상') return p.age >= 50;
          return false;
        });
      }
      case 'priority': {
        const priorityValue = activeFilter.value.split(' ')[0];
        return profiles.filter(p => p.priority === priorityValue);
      }
      case 'company':
        return profiles.filter(p => p.career?.includes(activeFilter.value));
      case 'expertise':
        return profiles.filter(p => p.expertise === activeFilter.value);
      default:
        return [];
    }
  }, [profiles, activeFilter]);

  return (
    <>
      {longTermNoContactProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><BellRing className="mr-2 text-orange-500" />장기 미접촉 알림 (3개월 이상)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {longTermNoContactProfiles.map(profile => (
              <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete}
                           isAlarmCard={true} onSnooze={(id)=>onUpdate(id,{snoozeUntil:new Date(Date.now()+90*24*60*60*1000).toISOString()})}
                           onConfirmAlarm={(id)=>onUpdate(id,{lastReviewedDate:new Date().toISOString()})}
                           accessCode={accessCode}
                           googleApiReady={googleApiReady}
                           isGoogleSignedIn={isGoogleSignedIn}
                           onAddToCalendar={onAddToCalendar}
              />
            ))}
          </div>
        </section>
      )}

      {todayProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todayProfiles.map(profile => (
              <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete}
                           accessCode={accessCode}
                           googleApiReady={googleApiReady}
                           isGoogleSignedIn={isGoogleSignedIn}
                           onAddToCalendar={onAddToCalendar}
              />
            ))}
          </div>
        </section>
      )}

      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingProfiles.map(profile => (
              <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete}
                           accessCode={accessCode}
                           googleApiReady={googleApiReady}
                           isGoogleSignedIn={isGoogleSignedIn}
                           onAddToCalendar={onAddToCalendar}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete}
                             accessCode={accessCode}
                             googleApiReady={googleApiReady}
                             isGoogleSignedIn={isGoogleSignedIn}
                             onAddToCalendar={onAddToCalendar}
                />
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
        <FilterResultSection title="미팅 진행 프로필 (최신순)" profiles={meetingProfiles}
                             onUpdate={onUpdate} onDelete={onDelete}
                             onClear={() => setShowMeetingProfiles(false)} accessCode={accessCode}
                             googleApiReady={googleApiReady}
                             isGoogleSignedIn={isGoogleSignedIn}
                             onAddToCalendar={onAddToCalendar}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <defs>
                {COLORS.map((color, index) => (
                  <radialGradient key={`gradient-age-${index}`} id={`gradient-age-${index}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stopColor={color} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={color} stopOpacity={1} />
                  </radialGradient>
                ))}
              </defs>
              <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label onClick={(data) => handlePieClick('age', data.payload)}>
                {ageData.map((_, index) => <Cell key={`cell-age-${index}`} fill={`url(#gradient-age-${index})`} cursor="pointer" stroke="#fff" />)}
              </Pie>
              <Tooltip formatter={(value) => `${value}명`} />
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
              <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label onClick={(data) => handlePieClick('priority', data.payload)}>
                {priorityData.map((entry, index) => <Cell key={`cell-priority-${index}`} fill={`url(#gradient-priority-${index})`} cursor="pointer" stroke="#fff"/>)}
              </Pie>
              <Tooltip formatter={(value) => `${value}명`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      {(activeFilter.type === 'age' || activeFilter.type === 'priority') && (
        <FilterResultSection title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles} onUpdate={onUpdate} onDelete={onDelete}
                             onClear={() => setActiveFilter({ type: null, value: null })} accessCode={accessCode}
                             googleApiReady={googleApiReady}
                             isGoogleSignedIn={isGoogleSignedIn}
                             onAddToCalendar={onAddToCalendar}
        />
      )}

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={keywordData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#FF8042" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/>
            <Tooltip formatter={(value) => `${value}명`} />
            <Legend />
            <Bar dataKey="count" fill="url(#gradient-company)" onClick={(data) => handleBarClick('company', data)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={expertiseData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
            <defs>
              <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
            <YAxis allowDecimals={false}/>
            <Tooltip formatter={(value) => `${value}명`} />
            <Legend />
            <Bar dataKey="count" fill="url(#gradient-expertise)" onClick={(data) => handleBarClick('expertise', data)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {activeFilter.type === 'company' && (
        <FilterResultSection title={`"${activeFilter.value}" 경력자 필터 결과`} profiles={filteredProfiles}
                             onUpdate={onUpdate} onDelete={onDelete}
                             onClear={() => setActiveFilter({ type: null, value: null })} accessCode={accessCode}
                             googleApiReady={googleApiReady}
                             isGoogleSignedIn={isGoogleSignedIn}
                             onAddToCalendar={onAddToCalendar}
        />
      )}

      {activeFilter.type === 'expertise' && (
        <FilterResultSection title={`"${activeFilter.value}" 전문영역 필터 결과`} profiles={filteredProfiles}
                             onUpdate={onUpdate} onDelete={onDelete}
                             onClear={() => setActiveFilter({ type: null, value: null })} accessCode={accessCode}
                             googleApiReady={googleApiReady}
                             isGoogleSignedIn={isGoogleSignedIn}
                             onAddToCalendar={onAddToCalendar}
        />
      )}
    </>
  );
};

// =========================
// 프로필 관리 탭 (새 프로필 + 검색 + 페이징 + 엑셀 + 사진 벌크)
// =========================
const ManageTab = ({
  profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd,
  formState, setFormState, accessCode, onUploadPhoto, onBulkPhotoUpload
}) => {
  const { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord, newPhotoFile } = formState;
  const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord, setNewPhotoFile } = setFormState;

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PROFILES_PER_PAGE = 9;

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];

    const orConditions = term.split(/\s+or\s+/i);

    return profiles.filter(p => {
      return orConditions.some(condition => {
        const andKeywords = condition.split(/\s+and\s+/i).filter(k => k);

        return andKeywords.every(keyword => {
          const fieldMap = { '이름': 'name', '경력': 'career', '나이': 'age', '전문영역': 'expertise', '기타': 'otherInfo', '우선순위': 'priority' };
          const fieldMatch = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);

          if (fieldMatch) {
            const fieldName = fieldMap[fieldMatch[1]];
            const fieldValue = fieldMatch[2].toLowerCase();
            const profileValue = p[fieldName] ? String(p[fieldName]).toLowerCase() : '';
            return profileValue.includes(fieldValue);
          }

          const ageGroupMatch = keyword.match(/^(\d{1,2})대$/);
          if (ageGroupMatch) {
            const decadeStart = parseInt(ageGroupMatch[1], 10);
            if (decadeStart >= 10) {
              const minAge = decadeStart;
              const maxAge = decadeStart + 9;
              return p.age && p.age >= minAge && p.age <= maxAge;
            }
          }

          const profileText = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
          return profileText.includes(keyword.toLowerCase());
        });
      });
    });
  }, [searchTerm, profiles]);

  const { currentProfiles, totalPages } = useMemo(() => {
    const sortedProfiles = [...profiles].sort((a,b) => a.name.localeCompare(b.name));
    const indexOfLastProfile = currentPage * PROFILES_PER_PAGE;
    const indexOfFirstProfile = indexOfLastProfile - PROFILES_PER_PAGE;
    const current = sortedProfiles.slice(indexOfFirstProfile, indexOfLastProfile);
    const pages = Math.ceil(sortedProfiles.length / PROFILES_PER_PAGE);
    return { currentProfiles: current, totalPages: pages };
  }, [currentPage, profiles]);

  useEffect(() => setCurrentPage(1), [searchTerm]);

  return (
    <>
      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div>
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} accessCode={accessCode} />
              )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500"/>새 프로필 추가</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden border bg-gray-100 flex items-center justify-center">
              {newPhotoFile
                ? <img src={URL.createObjectURL(newPhotoFile)} alt="preview" className="w-full h-full object-cover" />
                : <ImageIcon className="text-gray-400" />}
            </div>
            <label className="text-xs text-gray-600">
              <span className="inline-block mb-1 font-medium">사진 파일 업로드</span>
              <input type="file" accept="image/*"
                     onChange={(e) => setNewPhotoFile(e.target.files?.[0] || null)}
                     className="block text-xs" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={formState.newName} onChange={e => setFormState.setNewName(e.target.value)} className="w-full p-2 border rounded" />
            <input type="number" placeholder="나이" value={formState.newAge} onChange={e => setFormState.setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={formState.newPriority} onChange={e => setFormState.setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={formState.newExpertise} onChange={e => setFormState.setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={formState.newCareer} onChange={e => setFormState.setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="기타 정보" value={formState.newOtherInfo} onChange={e => setFormState.setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.14) PM 7시 00분)" value={formState.newMeetingRecord} onChange={e => setFormState.setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
          <div className="flex justify-end">
            <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">추가하기</button>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />

      <BulkPhotoUploader profiles={profiles} onBulkPhotoUpload={onBulkPhotoUpload} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentProfiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onUploadPhoto={onUploadPhoto}
            />
          ))}
        </div>
        {totalPages > 1 && (
          <Pagination totalPages={totalPages} currentPage={currentPage} setCurrentPage={setCurrentPage} />
        )}
      </section>
    </>
  );
};

// =========================
// 페이징
// =========================
const Pagination = ({ totalPages, currentPage, setCurrentPage }) => {
  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-8 flex justify-center">
      <ul className="inline-flex items-center -space-x-px">
        {pageNumbers.map(number => (
          <li key={number}>
            <button
              onClick={() => setCurrentPage(number)}
              className={`py-2 px-4 leading-tight border border-gray-300 ${currentPage === number ? 'bg-yellow-400 text-white border-yellow-400' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              {number}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

// =========================
// 엑셀 업로더
// =========================
const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage('');
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('파일을 먼저 선택해주세요.');
      return;
    }
    setIsUploading(true);
    setMessage('파일을 읽는 중...');

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
          name: row[2] || '',     // C열
          career: row[3] || '',   // D열
          age: row[5] ? Number(row[5]) : null, // F열
          expertise: row[7] || '', // H열
          priority: row[9] ? String(row[9]) : '',   // J열
          meetingRecord: row[11] || '', // L열
          otherInfo: row[13] || '',// N열
          eventDate: parseDateFromRecord(row[11] || ''),
        })).filter(p => p.name && p.career); // 이름과 경력은 필수

        const resultMessage = await onBulkAdd(newProfiles);
        setMessage(resultMessage);
        setFile(null);
      } catch (error) {
        console.error("엑셀 처리 오류:", error);
        setMessage('엑셀 파일을 처리하는 중 오류가 발생했습니다.');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center"><UploadCloud className="mr-2 text-yellow-500"/>엑셀로 일괄 등록</h2>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          정해진 양식의 엑셀 파일을 업로드하여 여러 프로필을 한 번에 추가할 수 있습니다.
        </p>
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내:</p>
          <p>2행부터 각 행을 한 프로필로 읽습니다.</p>
          <p>각 열의 C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보 로 입력됩니다.</p>
          <p className="font-bold mt-1">※ 기존 프로필과 이름이 겹칠 경우, 덮어쓰기됩니다.</p>
        </div>
        <input type="file" accept=".xlsx, .xls"
               onChange={handleFileChange}
               className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
        <button onClick={handleUpload} disabled={!file || isUploading}
                className="w-full flex justify-center items-center py-2 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
          {isUploading ? <Loader2 className="animate-spin" /> : '업로드 및 추가'}
        </button>
        {message && <p className="text-sm text-center text-gray-600">{message}</p>}
      </div>
    </section>
  );
};

// =========================
// 사진 벌크 업로더 (zip 또는 여러 이미지 파일)
// =========================
const BulkPhotoUploader = ({ profiles, onBulkPhotoUpload }) => {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-2 flex items-center">
        <ImageIcon className="mr-2 text-yellow-500" /> 사진 등록 (이름 매칭 자동 적용)
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        방법 1) 여러 이미지 파일을 한 번에 선택하여 업로드<br/>
        방법 2) 이미지들을 압축(.zip)하여 한 번에 업로드<br/>
        <span className="text-xs text-gray-500">
          파일명(확장자 제외)이 프로필의 이름과 일치하면 자동으로 해당 프로필에 사진이 적용됩니다. (공백/대소문자/하이픈/언더스코어 무시)
        </span>
      </p>

      <input type="file" multiple accept=".zip,image/*"
             onChange={(e) => setFiles(Array.from(e.target.files || []))}
             className="block w-full text-sm text-gray-500 mb-3" />
      <button
        disabled={busy || files.length === 0}
        onClick={async () => {
          setBusy(true);
          setMsg('파일 준비 중...');
          try {
            await onBulkPhotoUpload(files);
            setMsg('사진 일괄 등록 완료!');
            setFiles([]);
          } catch (e) {
            console.error(e);
            setMsg(e?.message || '업로드 중 오류가 발생했습니다.');
          } finally {
            setBusy(false);
          }
        }}
        className="px-4 py-2 rounded bg-yellow-400 text-white font-semibold hover:bg-yellow-500 disabled:bg-yellow-200"
      >
        {busy ? '업로드 중...' : '사진 일괄 등록'}
      </button>
      {msg && <p className="text-sm text-gray-600 mt-2">{msg}</p>}
    </section>
  );
};

// =========================
// 메인 App
// =========================
export default function App() {
  const [accessCode, setAccessCode] = useState(
    typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null
  );
  const [profiles, setProfiles] = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  // Google API 상태 (GIS)
  const [gapiClient, setGapiClient] = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleApiReady, setGoogleApiReady] = useState(null);
  const [googleError, setGoogleError] = useState('');

  // 새 프로필 작성 상태
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');
  const [newPhotoFile, setNewPhotoFile] = useState(null);

  // 공유 모드 파라미터
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  // 외부 스크립트 로드 (SheetJS, JSZip, GAPI, GIS)
  useEffect(() => {
    const scripts = [];

    const addScript = (src) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
      scripts.push(s);
      return new Promise(res => s.onload = res);
    };

    Promise.all([
      addScript("https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"),
      addScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"),
      addScript("https://apis.google.com/js/api.js"),
      addScript("https://accounts.google.com/gsi/client"),
    ]).then(() => {
      // gapi client 초기화
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
          setGapiClient(window.gapi);
          // GIS token client
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
      scripts.forEach(s => { if (s && document.body.contains(s)) document.body.removeChild(s); });
    };
  }, []);

  // Firebase 익명 인증
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) setAuthStatus('authenticated');
      else {
        try {
          await signInAnonymously(auth);
          setAuthStatus('authenticated');
        } catch (e) {
          console.error("Firebase 익명 로그인 오류:", e);
          setAuthStatus('error');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const profilesCollectionRef = useMemo(() => {
    if (!accessCode) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
  }, [accessCode]);

  useEffect(() => {
    if (!profilesCollectionRef) {
      setProfiles([]);
      return;
    }
    const q = query(profilesCollectionRef);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const profilesData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setProfiles(profilesData);
    });
    return () => unsubscribe();
  }, [profilesCollectionRef]);

  const handleLogin = (code) => {
    setAccessCode(code);
    if (typeof window !== 'undefined') localStorage.setItem('profileDbAccessCode', code);
  };

  // 새 프로필 추가
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;

    const eventDate = parseDateFromRecord(newMeetingRecord);
    const baseData = {
      name: newName, career: newCareer, age: newAge ? Number(newAge) : null,
      otherInfo: newOtherInfo, eventDate, expertise: newExpertise || null,
      priority: newPriority || null, meetingRecord: newMeetingRecord || null
    };

    try {
      const docRef = await addDoc(profilesCollectionRef, baseData);

      // 사진이 있으면 업로드 후 photoURL 업데이트
      if (newPhotoFile) {
        const path = `avatars/${accessCode}/${docRef.id}/${encodeURIComponent(newPhotoFile.name)}`;
        const url = await uploadAvatarWithGuard(newPhotoFile, path);
        await updateDoc(docRef, { photoURL: url, photoUpdatedAt: new Date().toISOString() });
      }

      // 초기화
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo('');
      setNewEventDate(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
      setNewPhotoFile(null);
    } catch (err) {
      console.error("프로필 저장 오류: ", err);
      alert(err?.message || '프로필 저장 중 오류가 발생했습니다.');
    }
  };

  // 엑셀 벌크 추가
  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';

    const existingProfilesMap = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updatedCount = 0;
    let addedCount = 0;

    newProfiles.forEach(profile => {
      const existingId = existingProfilesMap.get(profile.name);
      if (existingId) {
        const dref = doc(profilesCollectionRef, existingId);
        batch.set(dref, profile);
        updatedCount++;
      } else {
        const dref = doc(profilesCollectionRef);
        batch.set(dref, profile);
        addedCount++;
      }
    });

    await batch.commit();
    return `${addedCount}건 추가, ${updatedCount}건 업데이트 완료.`;
  };

  // 단건 업데이트
  const handleUpdate = async (profileId, updatedData) => {
    const { id, ...dataToUpdate } = updatedData || {};
    if (!profilesCollectionRef || !profileId) return;
    const dref = doc(profilesCollectionRef, profileId);
    await updateDoc(dref, dataToUpdate);
  };

  const handleDeleteRequest = (profileId, profileName) => {
    setShowDeleteConfirm({ show: true, profileId, profileName });
  };
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId && profilesCollectionRef) {
      await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    }
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  // 개별 사진 업로드(편집 화면)
  const handleUploadPhoto = async (profileId, file) => {
    if (!profilesCollectionRef) throw new Error('컬렉션 경로가 없습니다.');
    const path = `avatars/${accessCode}/${profileId}/${encodeURIComponent(file.name)}`;
    const url = await uploadAvatarWithGuard(file, path);
    await updateDoc(doc(profilesCollectionRef, profileId), { photoURL: url, photoUpdatedAt: new Date().toISOString() });
    return url;
  };

  // 사진 벌크 업로드 (파일들 혹은 .zip)
  const handleBulkPhotoUpload = async (fileList) => {
    if (!profilesCollectionRef || !fileList?.length) throw new Error('파일이 없습니다.');

    // 프로필 매칭 키 맵
    const nameToId = new Map(profiles.map(p => [sanitizeKey(p.name), p.id]));

    const handleOneFile = async (file) => {
      const base = sanitizeKey(file.name);
      const profileId = nameToId.get(base) || nameToId.get(sanitizeKey(base));
      if (!profileId) return; // 매칭 실패는 그냥 패스
      await handleUploadPhoto(profileId, file);
    };

    // zip 파일 처리 or 이미지들 처리
    const images = [];
    for (const f of fileList) {
      if (f.name.toLowerCase().endsWith('.zip')) {
        const zip = await window.JSZip.loadAsync(f);
        const entries = Object.values(zip.files).filter(z => !z.dir && /\.(png|jpe?g|webp|gif|bmp)$/i.test(z.name));
        for (const entry of entries) {
          const blob = await entry.async('blob');
          const file = new File([blob], entry.name.split('/').pop(), { type: blob.type || 'application/octet-stream' });
          images.push(file);
        }
      } else if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)) {
        images.push(f);
      }
    }

    for (const img of images) {
      try { await handleOneFile(img); }
      catch (e) { console.warn('이미지 처리 실패:', img.name, e); }
    }
  };

  // 개별 캘린더 추가
  const handleAddOneToCalendar = async (profile) => {
    if (!gapiClient || !tokenClient) return alert('Google API 초기화가 안 되었습니다.');
    if (!isGoogleSignedIn) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
      return;
    }
    if (!profile?.eventDate) return alert('이 프로필에 이벤트 날짜(eventDate)가 없습니다.');

    const startTime = new Date(profile.eventDate);
    const endTime = new Date(startTime.getTime() + 90 * 60000); // 1시간 30분
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;

    const reminders = [{ method: 'popup', minutes: 30 }];
    const tenAm = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate(), 10, 0, 0);
    if (startTime > tenAm) {
      const minutesBefore = Math.round((startTime.getTime() - tenAm.getTime()) / 60000);
      reminders.push({ method: 'popup', minutes: minutesBefore });
    }

    const event = {
      summary: `(영입) ${profile.name}님 미팅`,
      description: `${profile.name}님 프로필 보기:\n${shareUrl}`,
      start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Seoul' },
      end:   { dateTime: endTime.toISOString(),   timeZone: 'Asia/Seoul' },
      reminders: { useDefault: false, overrides: reminders },
    };

    try {
      await gapiClient.client.calendar.events.insert({ calendarId: 'primary', resource: event });
      alert('캘린더에 추가되었습니다.');
    } catch (e) {
      console.error('캘린더 추가 실패:', e);
      alert(e?.result?.error?.message || e?.message || '캘린더 추가 중 오류가 발생했습니다.');
    }
  };

  const formState = {
    newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord, newPhotoFile
  };
  const setFormState = {
    setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord, setNewPhotoFile
  };

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
            <span className="text-xs text-red-500">
              Google Calendar 연동 비활성화됨{googleError ? ` (${googleError})` : ' (초기화 실패)'}
            </span>
          )}
          {googleApiReady === true && (
            isGoogleSignedIn ? (
              <button
                onClick={() => {
                  if (window.gapi?.client) window.gapi.client.setToken(null);
                  setIsGoogleSignedIn(false);
                }}
                className="text-sm font-semibold text-gray-600 hover:text-yellow-600"
              >
                Google 로그아웃
              </button>
            ) : (
              <button
                onClick={() => tokenClient && tokenClient.requestAccessToken({ prompt: 'consent' })}
                className="text-sm font-semibold text-gray-600 hover:text-yellow-600"
              >
                Google 로그인
              </button>
            )
          )}
          <button onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }}
                  className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center">
            <LogOut className="w-4 h-4 mr-1.5" /> 로그아웃
          </button>
        </div>
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
            accessCode={accessCode}
            googleApiReady={googleApiReady}
            isGoogleSignedIn={isGoogleSignedIn}
            onAddToCalendar={handleAddOneToCalendar}
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
            accessCode={accessCode}
            onUploadPhoto={handleUploadPhoto}
            onBulkPhotoUpload={handleBulkPhotoUpload}
          />
        )}
      </main>
    </div>
  );
}
