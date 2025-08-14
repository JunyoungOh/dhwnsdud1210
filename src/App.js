import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query, setLogLevel, updateDoc, writeBatch } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2, ShieldAlert, X, Save, UploadCloud } from 'lucide-react';

// Firebase 구성 정보
const firebaseConfig = {
  apiKey: "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY",
  authDomain: "dhwnsdud1210-bf233.firebaseapp.com",
  projectId: "dhwnsdud1210-bf233",
  storageBucket: "dhwnsdud1210-bf233.appspot.com",
  messagingSenderId: "9275853060",
  appId: "1:9275853060:web:e5ccfa323da3493312a851",
  measurementId: "G-XS3VFNW6Y3"
};

const appId = 'profile-db-app-junyoungoh';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

const TAB_PAGE = {
  DASHBOARD: 'dashboard',
  MANAGE: 'manage'
};

// 헬퍼 함수: 미팅 기록에서 날짜 파싱
const parseDateFromRecord = (recordText) => {
    if (!recordText) return null;
    const match = recordText.match(/\((\d{2})\.(\d{2})\.(\d{2})\)/);
    if (match) {
        const year = 2000 + parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
        const day = parseInt(match[3], 10);
        return new Date(year, month, day).toISOString();
    }
    return null;
};


// 로그인 화면 컴포넌트
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

// 확인 모달 컴포넌트
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

// 프로필 카드 컴포넌트 (수정 기능 내장)
const ProfileCard = ({ profile, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState(profile);
    
    const priorityColors = {
      '3': 'bg-red-100 text-red-800',
      '2': 'bg-yellow-100 text-yellow-800',
      '1': 'bg-green-100 text-green-800',
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedProfile(prev => ({ ...prev, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
    };

    const handleSave = () => {
        const eventDate = parseDateFromRecord(editedProfile.meetingRecord);
        onUpdate(profile.id, { ...editedProfile, eventDate });
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
                <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 1차 인터뷰)" className="w-full p-2 border rounded text-sm h-20" />
                <div className="flex justify-end space-x-2">
                    <button onClick={() => setIsEditing(false)} className="p-2 text-gray-500 hover:text-gray-800"><X size={20} /></button>
                    <button onClick={handleSave} className="p-2 text-green-600 hover:text-green-800"><Save size={20} /></button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-white p-4 rounded-lg shadow relative group">
            <div className="flex items-center justify-between">
                <div className="flex items-baseline space-x-2">
                    <h3 className="font-bold text-yellow-600">{profile.name}</h3>
                    <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
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
            <div className="absolute top-2 right-2 space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:underline text-xs">수정</button>
                <button onClick={() => onDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button>
            </div>
        </div>
    );
};


// 대시보드 탭 컴포넌트
const DashboardTab = ({ profiles, onUpdate, onDelete }) => {
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

    const { todayProfiles, upcomingProfiles, meetingProfiles } = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const threeDaysLater = new Date(todayStart);
        threeDaysLater.setDate(threeDaysLater.getDate() + 4);

        const today = [];
        const upcoming = [];
        const meetings = [];

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
        });
        return {
            todayProfiles: today.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
            upcomingProfiles: upcoming.sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate)),
            meetingProfiles: meetings.sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate)), //최신순
        };
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
        
        const ageGroupMatch = term.match(/^(\d{1,2})대$/);
        if (ageGroupMatch) {
            const decadeStart = parseInt(ageGroupMatch[1], 10);
            if (decadeStart >= 10) {
                const minAge = decadeStart;
                const maxAge = decadeStart + 9;
                return profiles.filter(p => p.age && p.age >= minAge && p.age <= maxAge);
            }
        }
        
        const lowercasedTerm = term.toLowerCase();
        return profiles.filter(p =>
            (p.name && p.name.toLowerCase().includes(lowercasedTerm)) ||
            (p.career && p.career.toLowerCase().includes(lowercasedTerm)) ||
            (p.otherInfo && p.otherInfo.toLowerCase().includes(lowercasedTerm)) ||
            (p.age && p.age.toString().includes(lowercasedTerm)) ||
            (p.expertise && p.expertise.toLowerCase().includes(lowercasedTerm))
        );
    }, [searchTerm, profiles]);

    const filteredProfiles = useMemo(() => {
        if (!activeFilter.type) return [];
        switch (activeFilter.type) {
            case 'age':
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
            case 'priority':
                const priorityValue = activeFilter.value.split(' ')[0];
                return profiles.filter(p => p.priority === priorityValue);
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
            <section>
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="대시보드 내 프로필 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
                </div>
                {searchTerm.trim() && (
                    <div className="mb-8">
                        <h2 className="text-xl font-bold mb-4">검색 결과</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} />
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
                 <FilterResultSection title="미팅 진행 프로필 (최신순)" profiles={meetingProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setShowMeetingProfiles(false)} />
            )}

            {todayProfiles.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {todayProfiles.map(profile => <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} />)}
                </div>
              </section>
            )}

            {upcomingProfiles.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {upcomingProfiles.map(profile => <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} />)}
                </div>
              </section>
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
                <FilterResultSection title={`"${activeFilter.value}" 필터 결과`} profiles={filteredProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setActiveFilter({ type: null, value: null })} />
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
             {activeFilter.type === 'company' && (
                <FilterResultSection title={`"${activeFilter.value}" 경력자 필터 결과`} profiles={filteredProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setActiveFilter({ type: null, value: null })} />
            )}
            
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
            {activeFilter.type === 'expertise' && (
                <FilterResultSection title={`"${activeFilter.value}" 전문영역 필터 결과`} profiles={filteredProfiles} onUpdate={onUpdate} onDelete={onDelete} onClear={() => setActiveFilter({ type: null, value: null })} />
            )}
        </>
    );
};

// 프로필 관리 탭 컴포넌트
const ManageTab = ({ profiles, onUpdate, onDelete, handleFormSubmit, handleBulkAdd, formState, setFormState }) => {
    const { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord } = formState;
    const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord } = setFormState;
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const PROFILES_PER_PAGE = 9;
    
    const searchedProfiles = useMemo(() => {
        const term = searchTerm.trim();
        if (!term) return [];
        
        const ageGroupMatch = term.match(/^(\d{1,2})대$/);
        if (ageGroupMatch) {
            const decadeStart = parseInt(ageGroupMatch[1], 10);
            if (decadeStart >= 10) {
                const minAge = decadeStart;
                const maxAge = decadeStart + 9;
                return profiles.filter(p => p.age && p.age >= minAge && p.age <= maxAge);
            }
        }
        
        const lowercasedTerm = term.toLowerCase();
        return profiles.filter(p =>
            (p.name && p.name.toLowerCase().includes(lowercasedTerm)) ||
            (p.career && p.career.toLowerCase().includes(lowercasedTerm)) ||
            (p.otherInfo && p.otherInfo.toLowerCase().includes(lowercasedTerm)) ||
            (p.age && p.age.toString().includes(lowercasedTerm)) ||
            (p.expertise && p.expertise.toLowerCase().includes(lowercasedTerm))
        );
    }, [searchTerm, profiles]);

    const { currentProfiles, totalPages } = useMemo(() => {
        const sortedProfiles = [...profiles].sort((a,b) => a.name.localeCompare(b.name));
        const indexOfLastProfile = currentPage * PROFILES_PER_PAGE;
        const indexOfFirstProfile = indexOfLastProfile - PROFILES_PER_PAGE;
        const current = sortedProfiles.slice(indexOfFirstProfile, indexOfLastProfile);
        const pages = Math.ceil(sortedProfiles.length / PROFILES_PER_PAGE);
        return { currentProfiles: current, totalPages: pages };
    }, [currentPage, profiles]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    return (
        <>
            <section>
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="이름, 경력, 전문영역 등으로 검색... (예: 20대)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
                </div>
                {searchTerm.trim() && (
                    <div>
                        <h2 className="text-xl font-bold mb-4">검색 결과</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                                <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} />
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
                    <textarea placeholder="미팅기록 (예: (25.08.14) 1차 인터뷰)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
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
                       <ProfileCard key={profile.id} profile={profile} onUpdate={onUpdate} onDelete={onDelete} />
                    ))}
                </div>
                {totalPages > 1 && (
                    <Pagination
                        totalPages={totalPages}
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                    />
                )}
            </section>
        </>
    );
};

const Pagination = ({ totalPages, currentPage, setCurrentPage }) => {
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
    }

    if (totalPages <= 1) {
        return null;
    }

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

                const newProfiles = json.slice(1).map(row => {
                    const meetingRecord = row[11] || ''; // L열
                    const eventDate = parseDateFromRecord(meetingRecord);
                    return {
                        name: row[2] || '',      // C열
                        career: row[3] || '',    // D열
                        age: row[5] ? Number(row[5]) : null, // F열
                        expertise: row[7] || '', // H열
                        priority: row[9] ? String(row[9]) : '',   // J열
                        meetingRecord: meetingRecord, // L열
                        otherInfo: row[13] || '',// N열
                        eventDate: eventDate,
                    };
                }).filter(p => p.name && p.career); // 이름과 경력은 필수

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
                <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
                <button onClick={handleUpload} disabled={!file || isUploading} className="w-full flex justify-center items-center py-2 px-4 border rounded-lg text-white bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-200">
                    {isUploading ? <Loader2 className="animate-spin" /> : '업로드 및 추가'}
                </button>
                {message && <p className="text-sm text-center text-gray-600">{message}</p>}
            </div>
        </section>
    );
};


export default function App() {
  const [accessCode, setAccessCode] = useState(localStorage.getItem('profileDbAccessCode') || null);
  const [profiles, setProfiles] = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthStatus('authenticated');
      } else {
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
    };
    const q = query(profilesCollectionRef);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const profilesData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setProfiles(profilesData);
    });
    return () => unsubscribe();
  }, [profilesCollectionRef]);

  const handleLogin = (code) => {
      setAccessCode(code);
      localStorage.setItem('profileDbAccessCode', code);
  };
  
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
    
    const eventDate = parseDateFromRecord(newMeetingRecord);

    const profileData = { name: newName, career: newCareer, age: newAge ? Number(newAge) : null, otherInfo: newOtherInfo, eventDate, expertise: newExpertise || null, priority: newPriority || null, meetingRecord: newMeetingRecord || null };
    try {
        await addDoc(profilesCollectionRef, profileData);
        setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewEventDate(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    } catch (err) {
      console.error("프로필 저장 오류: ", err);
    }
  };

  const handleBulkAdd = async (newProfiles) => {
      if (!profilesCollectionRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
      
      const existingProfilesMap = new Map(profiles.map(p => [p.name, p.id]));
      const batch = writeBatch(db);
      let updatedCount = 0;
      let addedCount = 0;

      newProfiles.forEach(profile => {
          const existingId = existingProfilesMap.get(profile.name);
          if (existingId) {
              const docRef = doc(profilesCollectionRef, existingId);
              batch.set(docRef, profile);
              updatedCount++;
          } else {
              const docRef = doc(profilesCollectionRef);
              batch.set(docRef, profile);
              addedCount++;
          }
      });

      await batch.commit();
      return `${addedCount}건 추가, ${updatedCount}건 업데이트 완료.`;
  };
  
  const handleUpdate = async (profileId, updatedData) => {
    const { id, ...dataToUpdate } = updatedData;
    await updateDoc(doc(profilesCollectionRef, profileId), dataToUpdate);
  };

  const handleDeleteRequest = (profileId, profileName) => {
      setShowDeleteConfirm({ show: true, profileId, profileName });
  };

  const confirmDelete = async () => {
      if (showDeleteConfirm.profileId) {
          await deleteDoc(doc(profilesCollectionRef, showDeleteConfirm.profileId));
      }
      setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
  };

  const formState = { newName, newCareer, newAge, newOtherInfo, newEventDate, newExpertise, newPriority, newMeetingRecord };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, setNewExpertise, setNewPriority, setNewMeetingRecord };

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
      <header className="flex justify-between items-center p-6 border-b bg-white">
        <div className="flex items-center space-x-3">
          <Users className="text-yellow-500 w-8 h-8" />
          <h1 className="text-2xl font-bold text-gray-800">프로필 대시보드</h1>
          <span className="text-sm bg-gray-200 px-3 py-1 rounded-full font-mono">{accessCode}</span>
        </div>
        <button onClick={() => { setAccessCode(null); localStorage.removeItem('profileDbAccessCode'); }} className="text-sm font-semibold text-gray-600 hover:text-yellow-600 flex items-center">
          <LogOut className="w-4 h-4 mr-1.5" /> 로그아웃
        </button>
      </header>
      
      <div className="flex justify-center space-x-2 border-b bg-white px-6 py-2 sticky top-0 z-10">
        <button onClick={() => setActiveTab(TAB_PAGE.DASHBOARD)} className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === TAB_PAGE.DASHBOARD ? 'bg-yellow-400 text-white' : 'text-gray-600 hover:bg-yellow-100'}`}>대시보드</button>
        <button onClick={() => setActiveTab(TAB_PAGE.MANAGE)} className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === TAB_PAGE.MANAGE ? 'bg-yellow-400 text-white' : 'text-gray-600 hover:bg-yellow-100'}`}>프로필 관리</button>
      </div>

      <main className="p-6 space-y-12">
        {activeTab === TAB_PAGE.DASHBOARD && <DashboardTab profiles={profiles} onUpdate={handleUpdate} onDelete={handleDeleteRequest} />}
        {activeTab === TAB_PAGE.MANAGE && <ManageTab profiles={profiles} onUpdate={handleUpdate} onDelete={handleDeleteRequest} handleFormSubmit={handleFormSubmit} handleBulkAdd={handleBulkAdd} formState={formState} setFormState={setFormState} />}
      </main>
    </div>
  );
}
