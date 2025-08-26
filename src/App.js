import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  setLogLevel, updateDoc, writeBatch, getDoc
} from 'firebase/firestore';
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from 'firebase/storage';
import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2,
  Edit, Trash2, ShieldAlert, X, Save, UploadCloud, BellRing, Share2, RefreshCw,
  Image as ImageIcon, FolderArchive
} from 'lucide-react';

/* =========================
   환경변수 (Netlify에 등록 필요)
   ========================= */
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

const appId = 'profile-db-app-junyoungoh';

/* =========================
   Firebase 초기화
   ========================= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
setLogLevel('debug');

/* =========================
   상수/유틸
   ========================= */
const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

const TAB_PAGE = { DASHBOARD: 'dashboard', MANAGE: 'manage' };

/** 미팅기록에서 날짜 파싱: (YY.MM.DD) (AM/PM hh시 mm분) 지원
 *  - matchAll 오류 수정: /g 플래그 추가
 */
const parseDateFromRecord = (recordText) => {
  if (!recordText) return null;
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

/* =========================
   공유 상세 보기
   ========================= */
const ProfileDetailView = ({ profileId, accessCode }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', accessCode, profileId);
        const snap = await getDoc(ref);
        if (snap.exists()) setProfile({ ...snap.data(), id: snap.id });
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
          <img
            src={profile.photoURL}
            alt={`${profile.name}`}
            className="w-24 h-24 rounded-full object-cover border-2 border-yellow-300"
          />
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

/* =========================
   로그인 화면
   ========================= */
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
              type="text"
              placeholder="Access Code"
              className="w-full pl-10 pr-3 py-3 border rounded-lg"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={authStatus !== 'authenticated'}
              className="w-full flex justify-center py-3 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200"
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

/* =========================
   확인 모달
   ========================= */
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

/* =========================
   프로필 카드 (편집 + 사진)
   ========================= */
const ProfileCard = ({
  profile, onUpdate, onDelete, onUploadPhoto,
  isAlarmCard, onSnooze, onConfirmAlarm, accessCode
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

  // 저장: 텍스트/숫자 필드 먼저 저장 -> 사진 업로드는 비차단(best-effort)
  const handleSave = async () => {
    try {
      setSaving(true);
      const eventDate = parseDateFromRecord(editedProfile.meetingRecord);
      await onUpdate(profile.id, { ...editedProfile, eventDate });

      if (photoFile && typeof onUploadPhoto === 'function') {
        const p = onUploadPhoto(profile.id, photoFile);
        // 업로드에 시간이 오래 걸리더라도 화면은 닫아버림(UX 보호)
        Promise.race([
          p,
          new Promise((_, rej) => setTimeout(() => rej(new Error('upload-timeout')), 8000))
        ])
          .then(() => console.log('[photo] upload finished/raced'))
          .catch(err => console.warn('[photo] best-effort upload error:', err));
      }

      setIsEditing(false);
    } catch (err) {
      console.error('프로필 저장 실패:', err);
      alert('프로필 저장에 실패했습니다. 콘솔을 확인해 주세요.');
    } finally {
      setSaving(false);
      setPhotoFile(null);
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => alert('공유 링크가 클립보드에 복사되었습니다.'))
      .catch(() => alert('링크 복사에 실패했습니다.'));
  };

  if (isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border-l-4 border-yellow-400 relative space-y-3">
        {/* 프로필 사진 + 미리보기 */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden border">
            {photoFile ? (
              <img src={URL.createObjectURL(photoFile)} alt="preview" className="w-full h-full object-cover" />
            ) : editedProfile.photoURL ? (
              <img src={editedProfile.photoURL} alt="preview" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <label className="text-xs text-gray-600 inline-flex items-center gap-2 cursor-pointer">
            <ImageIcon size={16} />
            <span>사진 업로드</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
        </div>

        <input name="name" value={editedProfile.name} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
        <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
        <textarea name="career" value={editedProfile.career} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-20" />
        <div className="grid grid-cols-2 gap-2">
          <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
          <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
        </div>
        <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
        <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) PM 7시 00분)" className="w-full p-2 border rounded text-sm h-20" />
        <div className="flex justify-end space-x-2">
          <button onClick={() => setIsEditing(false)} className="p-2 text-gray-500 hover:text-gray-800" title="닫기"><X size={20} /></button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`p-2 ${saving ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:text-green-800'}`}
            title={saving ? '저장 중...' : '저장'}
          >
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow relative group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden border">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-yellow-600">{profile.name}</h3>
              <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
            </div>
            {profile.expertise && <p className="text-sm font-semibold text-gray-600">{profile.expertise}</p>}
          </div>
        </div>

        {profile.priority && (
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${priorityColors[profile.priority] || 'bg-gray-100 text-gray-800'}`}>
            {profile.priority}
          </span>
        )}
      </div>

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

      <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleShare} className="text-gray-500 hover:text-gray-800" title="공유 링크 복사"><Share2 size={14} /></button>
        <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:text-blue-700" title="수정"><Edit size={14} /></button>
        <button onClick={() => onDelete(profile.id, profile.name)} className="text-red-500 hover:text-red-700" title="삭제"><Trash2 size={14} /></button>
      </div>
    </div>
  );
};

/* =========================
   필터링 섹션
   ========================= */
const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onUploadPhoto, onClear, accessCode }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">필터 해제</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile, index) => (
          <div key={profile.id} className="animate-cascade" style={{ animationDelay: `${index * 50}ms` }}>
            <ProfileCard profile={profile} onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto} accessCode={accessCode} />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

/* =========================
   대시보드 탭
   ========================= */
const DashboardTab = ({ profiles, onUpdate, onDelete, onUploadPhoto, accessCode }) => {
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

  const termFilter = (term, p) => {
    const fieldMap = { '이름': 'name', '경력': 'career', '나이': 'age', '전문영역': 'expertise', '기타': 'otherInfo', '우선순위': 'priority' };
    const fieldMatch = term.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
    if (fieldMatch) {
      const fieldName = fieldMap[fieldMatch[1]];
      const fieldValue = fieldMatch[2].toLowerCase();
      const profileValue = p[fieldName] ? String(p[fieldName]).toLowerCase() : '';
      return profileValue.includes(fieldValue);
    }
    const ageGroupMatch = term.match(/^(\d{1,2})대$/);
    if (ageGroupMatch) {
      const decadeStart = parseInt(ageGroupMatch[1], 10);
      if (decadeStart >= 10) {
        const minAge = decadeStart;
        const maxAge = decadeStart + 9;
        return p.age && p.age >= minAge && p.age <= maxAge;
      }
    }
    const profileText = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
    return profileText.includes(term.toLowerCase());
  };

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const ors = term.split(/\s+or\s+/i);
    return profiles.filter(p =>
      ors.some(cond => cond.split(/\s+and\s+/i).filter(Boolean).every(k => termFilter(k, p)))
    );
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
              <ProfileCard
                key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete}
                onUploadPhoto={onUploadPhoto} isAlarmCard={true}
                onSnooze={(id)=>onUpdate(id,{snoozeUntil:new Date(Date.now()+90*24*60*60*1000).toISOString()})}
                onConfirmAlarm={(id)=>onUpdate(id,{lastReviewedDate:new Date().toISOString()})}
                accessCode={accessCode}
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
              <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto} accessCode={accessCode} />
            ))}
          </div>
        </section>
      )}

      {upcomingProfiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingProfiles.map(profile => (
              <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto} accessCode={accessCode} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="검색... (예: 경력:네이버 AND 20대)"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border rounded-xl shadow-sm"
          />
        </div>
        {searchTerm.trim() && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto} accessCode={accessCode} />
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
        <div
          className="bg-white p-4 rounded-xl shadow-md cursor-pointer hover:bg-gray-50"
          onClick={() => setShowMeetingProfiles(!showMeetingProfiles)}
        >
          <h3 className="text-base font-medium text-gray-500">미팅 진행 프로필</h3>
          <p className="text-3xl font-bold text-yellow-500 mt-1">{meetingProfiles.length}</p>
        </div>
      </section>

      {showMeetingProfiles && (
        <FilterResultSection
          title="미팅 진행 프로필 (최신순)" profiles={meetingProfiles}
          onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto}
          onClear={() => setShowMeetingProfiles(false)} accessCode={accessCode}
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
        <FilterResultSection
          title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles}
          onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto}
          onClear={() => setActiveFilter({ type: null, value: null })} accessCode={accessCode}
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
    </>
  );
};

/* =========================
   페이지네이션
   ========================= */
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

/* =========================
   엑셀 업로더
   ========================= */
const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
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
          name: row[2] || '',
          career: row[3] || '',
          age: row[5] ? Number(row[5]) : null,
          expertise: row[7] || '',
          priority: row[9] ? String(row[9]) : '',
          meetingRecord: row[11] || '',
          otherInfo: row[13] || '',
          eventDate: parseDateFromRecord(row[11] || ''),
        })).filter(p => p.name && p.career);

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
        <p className="text-sm text-gray-600">정해진 양식의 엑셀 파일을 업로드하여 여러 프로필을 한 번에 추가할 수 있습니다.</p>
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내:</p>
          <p>2행부터 각 행을 한 프로필로 읽습니다.</p>
          <p>각 열의 C=이름, D=경력, F=나이, H=전문영역, J=우선순위, L=미팅기록, N=기타정보 로 입력됩니다.</p>
          <p className="font-bold mt-1">※ 기존 프로필과 이름이 겹칠 경우, 덮어쓰기됩니다.</p>
        </div>
        <input type="file" accept=".xlsx, .xls" onChange={handleFileChange}
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

/* =========================
   사진 벌크 업로더 (단일/ZIP)
   ========================= */
const PhotoBulkUploader = ({ onUploadByName }) => {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setMsg('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        if (!window.JSZip) throw new Error('JSZip 로드 실패');
        const zip = await window.JSZip.loadAsync(file);
        let total = 0, success = 0, fail = 0;
        for (const name of Object.keys(zip.files)) {
          const entry = zip.files[name];
          if (entry.dir) continue;
          const lower = name.toLowerCase();
          if (!(/\.(png|jpe?g|webp|gif)$/i.test(lower))) continue;
          total += 1;
          try {
            const blob = await entry.async('blob');
            const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''); // 파일명(확장자 제외)
            await onUploadByName(base, new File([blob], name, { type: blob.type || 'image/*' }));
            success += 1;
          } catch (e) {
            console.warn('[zip] fail', name, e);
            fail += 1;
          }
        }
        setMsg(`ZIP 처리 완료: 총 ${total}개, 성공 ${success}, 실패 ${fail}`);
      } else {
        const base = file.name.replace(/\.[^.]+$/, '');
        await onUploadByName(base, file);
        setMsg(`사진 1건 처리 완료: ${file.name}`);
      }
    } catch (e) {
      console.error('사진 벌크 업로드 오류:', e);
      setMsg(`오류: ${e.message || e}`);
    } finally {
      setBusy(false);
      setFile(null);
    }
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center"><FolderArchive className="mr-2 text-yellow-500"/>사진 등록</h2>
      <div className="space-y-3 text-sm text-gray-600">
        <p>파일 이름과 동일한 프로필 <b>이름</b>을 찾아 사진을 연결합니다. (예: <code>홍길동.jpg</code> → 이름이 “홍길동”인 프로필)</p>
        <p>여러 장은 ZIP으로 묶어 올릴 수 있습니다. PNG/JPG/JPEG/WEBP/GIF 지원.</p>
      </div>
      <div className="mt-4 space-y-3">
        <input type="file" accept=".zip,image/*" onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
        <button onClick={handleUpload} disabled={!file || busy}
          className="w-full flex justify-center items-center py-2 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
          {busy ? <Loader2 className="animate-spin" /> : '업로드 시작'}
        </button>
        {msg && <p className="text-sm text-center text-gray-600">{msg}</p>}
      </div>
    </section>
  );
};

/* =========================
   관리 탭
   ========================= */
const ManageTab = ({
  profiles, onUpdate, onDelete, onUploadPhoto, onUploadByName,
  handleFormSubmit, handleBulkAdd, formState, setFormState, accessCode
}) => {
  const {
    newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord, newPhotoFile
  } = formState;
  const {
    setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate,
    setNewExpertise, setNewPriority, setNewMeetingRecord, setNewPhotoFile
  } = setFormState;

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PROFILES_PER_PAGE = 9;

  const termFilter = (term, p) => {
    const fieldMap = { '이름': 'name', '경력': 'career', '나이': 'age', '전문영역': 'expertise', '기타': 'otherInfo', '우선순위': 'priority' };
    const fieldMatch = term.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
    if (fieldMatch) {
      const fieldName = fieldMap[fieldMatch[1]];
      const fieldValue = fieldMatch[2].toLowerCase();
      const profileValue = p[fieldName] ? String(p[fieldName]).toLowerCase() : '';
      return profileValue.includes(fieldValue);
    }
    const ageGroupMatch = term.match(/^(\d{1,2})대$/);
    if (ageGroupMatch) {
      const decadeStart = parseInt(ageGroupMatch[1], 10);
      if (decadeStart >= 10) {
        const minAge = decadeStart;
        const maxAge = decadeStart + 9;
        return p.age && p.age >= minAge && p.age <= maxAge;
      }
    }
    const profileText = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
    return profileText.includes(term.toLowerCase());
  };

  const searchedProfiles = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const ors = term.split(/\s+or\s+/i);
    return profiles.filter(p =>
      ors.some(cond => cond.split(/\s+and\s+/i).filter(Boolean).every(k => termFilter(k, p)))
    );
  }, [searchTerm, profiles]);

  const { currentProfiles, totalPages } = useMemo(() => {
    const sorted = [...profiles].sort((a,b) => a.name.localeCompare(b.name));
    const last = currentPage * PROFILES_PER_PAGE;
    const first = last - PROFILES_PER_PAGE;
    return { currentProfiles: sorted.slice(first, last), totalPages: Math.ceil(sorted.length / PROFILES_PER_PAGE) };
  }, [currentPage, profiles]);

  useEffect(() => setCurrentPage(1), [searchTerm]);

  return (
    <>
      <section>
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="검색... (예: 경력:네이버 AND 20대)" value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
        </div>
        {searchTerm.trim() && (
          <div>
            <h2 className="text-xl font-bold mb-4">검색 결과</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto} accessCode={accessCode} />
              )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500"/>새 프로필 추가</h2>
        <form onSubmit={(e)=>handleFormSubmit(e)} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden border">
              {newPhotoFile ? (
                <img src={URL.createObjectURL(newPhotoFile)} alt="preview" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <label className="text-xs text-gray-600 inline-flex items-center gap-2 cursor-pointer">
              <ImageIcon size={16} />
              <span>사진파일 업로드</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e)=>setNewPhotoFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" />
            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.14) PM 7시 00분)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />

          <div className="flex justify-end">
            <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">추가하기</button>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />
      <PhotoBulkUploader onUploadByName={onUploadByName} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentProfiles.map(profile => (
            <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} onUploadPhoto={onUploadPhoto} accessCode={accessCode} />
          ))}
        </div>
        {totalPages > 1 && (
          <Pagination totalPages={totalPages} currentPage={currentPage} setCurrentPage={setCurrentPage}/>
        )}
      </section>
    </>
  );
};

/* =========================
   App
   ========================= */
export default function App() {
  const [accessCode, setAccessCode] = useState(
    typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null
  );
  const [profiles, setProfiles] = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  // Google API(GIS) 상태
  const [gapiClient, setGapiClient] = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [googleApiReady, setGoogleApiReady] = useState(null);
  const [googleError, setGoogleError] = useState('');

  // 새 프로필 추가용 상태
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');
  const [newPhotoFile, setNewPhotoFile] = useState(null);

  // 공유 링크 모드
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  /* 외부 스크립트 로드 (SheetJS, JSZip, GAPI, GIS) */
  useEffect(() => {
    const addScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = res; s.onerror = rej;
      document.body.appendChild(s);
    });

    (async () => {
      try {
        // SheetJS + JSZip
        await addScript("https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js");
        await addScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");

        // GAPI + GIS (선택적, 실패해도 앱은 동작)
        await addScript("https://apis.google.com/js/api.js");
        await addScript("https://accounts.google.com/gsi/client");

        if (window.gapi?.load) {
          window.gapi.load('client', async () => {
            try {
              await window.gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
              setGapiClient(window.gapi);
              const tc = window.google?.accounts?.oauth2?.initTokenClient?.({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: (resp) => {
                  if (resp && resp.access_token) {
                    window.gapi.client.setToken({ access_token: resp.access_token });
                    setIsGoogleSignedIn(true);
                  }
                },
              });
              setTokenClient(tc || null);
              setGoogleApiReady(true);
            } catch (err) {
              console.warn('Google API 초기화 실패:', err);
              setGoogleError(err?.error || err?.details || '초기화 실패');
              setGoogleApiReady(false);
            }
          });
        }
      } catch (e) {
        console.warn('외부 스크립트 로드 실패(필수 아님):', e);
      }
    })();

    return () => {};
  }, []);

  /* Firebase 익명 인증 */
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
    if (!profilesCollectionRef) { setProfiles([]); return; }
    const q = query(profilesCollectionRef);
    const unsubscribe = onSnapshot(q, (qs) => {
      const data = qs.docs.map(d => ({ ...d.data(), id: d.id }));
      setProfiles(data);
    });
    return () => unsubscribe();
  }, [profilesCollectionRef]);

  const handleLogin = (code) => {
    setAccessCode(code);
    if (typeof window !== 'undefined') localStorage.setItem('profileDbAccessCode', code);
  };

  /* 새 프로필 추가 (사진은 비차단으로 별도 업로드) */
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
      const docRef = await addDoc(profilesCollectionRef, profileData);

      // 사진이 있다면 비차단 업로드
      if (newPhotoFile) {
        handleUploadPhoto(docRef.id, newPhotoFile)
          .catch(err => console.warn('[newProfile photo] best-effort error:', err));
      }

      // 폼 초기화
      setNewName(''); setNewCareer(''); setNewAge('');
      setNewOtherInfo(''); setNewEventDate(''); setNewExpertise('');
      setNewPriority(''); setNewMeetingRecord(''); setNewPhotoFile(null);
    } catch (err) {
      console.error("프로필 저장 오류: ", err);
      alert('프로필 저장 중 오류가 발생했습니다.');
    }
  };

  /* 엑셀 벌크 추가 */
  const handleBulkAdd = async (newProfiles) => {
    if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const existing = new Map(profiles.map(p => [p.name, p.id]));
    const batch = writeBatch(db);
    let updated = 0, added = 0;

    newProfiles.forEach(profile => {
      const existingId = existing.get(profile.name);
      if (existingId) {
        const ref = doc(profilesCollectionRef, existingId);
        batch.set(ref, profile);
        updated++;
      } else {
        const ref = doc(profilesCollectionRef);
        batch.set(ref, profile);
        added++;
      }
    });

    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  /* 프로필 업데이트 (텍스트/숫자) */
  const handleUpdate = async (profileId, updatedData) => {
    if (!profilesCollectionRef) return;
    const { id, ...data } = updatedData;
    const ref = doc(profilesCollectionRef, profileId);
    await updateDoc(ref, data);
  };

  /* 개별 사진 업로드 */
  const handleUploadPhoto = async (profileId, file) => {
    if (!profilesCollectionRef) throw new Error('컬렉션 미초기화');
    const path = `artifacts/${appId}/public/data/${accessCode}/${profileId}/${file.name}`;
    const ref = storageRef(storage, path);

    const task = uploadBytesResumable(ref, file, { contentType: file.type || 'image/*' });
    await new Promise((resolve, reject) => {
      task.on('state_changed',
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          // console.log(`[photo] ${pct}%`);
        },
        (err) => reject(err),
        () => resolve()
      );
    });

    const url = await getDownloadURL(ref);
    await updateDoc(doc(profilesCollectionRef, profileId), { photoURL: url, photoPath: path });
    return url;
  };

  /* 파일명으로 프로필 찾아 업로드 (벌크/ZIP용) */
  const handleUploadByName = async (baseName, file) => {
    if (!profilesCollectionRef) throw new Error('컬렉션 미초기화');
    // 정확히 이름 일치
    const target = profiles.find(p => p.name === baseName);
    if (!target) throw new Error(`일치하는 프로필 이름이 없습니다: ${baseName}`);
    return handleUploadPhoto(target.id, file);
  };

  /* 삭제 확인 */
  const handleDeleteRequest = (profileId, profileName) => {
    setShowDeleteConfirm({ show: true, profileId, profileName });
  };
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId && profilesCollectionRef) {
      // 사진 파일도 함께 정리(선택): photoPath 있으면 삭제
      const p = profiles.find(x => x.id === showDeleteConfirm.profileId);
      if (p?.photoPath) {
        try { await deleteObject(storageRef(storage, p.photoPath)); } catch (e) { /* ignore */ }
      }
      await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
    }
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  /* Google Calendar 동기화 (전체) – 유지 */
  const handleSyncToCalendar = async () => {
    if (!isGoogleSignedIn || !gapiClient) {
      alert('Google 계정에 먼저 로그인해주세요.');
      return;
    }
    setIsSyncing(true);
    let successCount = 0, failCount = 0;

    const profilesWithMeetings = profiles.filter(p => p.eventDate);
    for (const profile of profilesWithMeetings) {
      const startTime = new Date(profile.eventDate);
      const endTime = new Date(startTime.getTime() + 90 * 60000);
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
        end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Seoul' },
        reminders: { useDefault: false, overrides: reminders },
      };

      try {
        await gapiClient.client.calendar.events.insert({ calendarId: 'primary', resource: event });
        successCount++;
      } catch (error) {
        console.error(`Error creating event for ${profile.name}:`, error);
        failCount++;
      }
    }
    setIsSyncing(false);
    alert(`캘린더 동기화 완료!\n성공: ${successCount}건, 실패: ${failCount}건`);
  };

  const formState = {
    newName, newCareer, newAge, newOtherInfo, newEventDate,
    newExpertise, newPriority, newMeetingRecord, newPhotoFile
  };
  const setFormState = {
    setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate,
    setNewExpertise, setNewPriority, setNewMeetingRecord, setNewPhotoFile
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
              <>
                <button onClick={handleSyncToCalendar} disabled={isSyncing}
                        className="text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-md flex items-center disabled:bg-blue-300">
                  {isSyncing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                  캘린더 동기화
                </button>
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
          <button
            onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }}
            className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center"
          >
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
            onUploadPhoto={handleUploadPhoto}
            accessCode={accessCode}
          />
        )}
        {activeTab === TAB_PAGE.MANAGE && (
          <ManageTab
            profiles={profiles}
            onUpdate={handleUpdate}
            onDelete={handleDeleteRequest}
            onUploadPhoto={handleUploadPhoto}
            onUploadByName={handleUploadByName}
            handleFormSubmit={handleFormSubmit}
            handleBulkAdd={handleBulkAdd}
            formState={formState}
            setFormState={setFormState}
            accessCode={accessCode}
          />
        )}
      </main>
    </div>
  );
}
