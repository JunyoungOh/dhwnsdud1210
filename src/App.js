import React, { useMemo, useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query, setLogLevel, updateDoc } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Users, LogOut, Search, Calendar, Zap, UserPlus, KeyRound, Loader2, Edit, Trash2, ShieldAlert } from 'lucide-react';

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


// 대시보드 탭 컴포넌트
const DashboardTab = ({ profiles, handleEdit, handleDelete }) => {
    const [selectedCompany, setSelectedCompany] = useState(null);

    const { todayProfiles, upcomingProfiles } = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const threeDaysLater = new Date(todayStart);
        threeDaysLater.setDate(threeDaysLater.getDate() + 4);

        const today = [];
        const upcoming = [];

        profiles.forEach(p => {
            if (p.eventDate) {
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

    const filteredByCompanyProfiles = useMemo(() => {
        if (!selectedCompany) return [];
        return profiles.filter(p => p.career?.includes(selectedCompany));
    }, [profiles, selectedCompany]);

    return (
        <>
            {todayProfiles.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" />오늘의 일정</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {todayProfiles.map(profile => (
                    <div key={profile.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-red-400 relative">
                        <div className="flex items-baseline space-x-2">
                           <h3 className="font-bold text-red-600">{profile.name}</h3>
                           <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
                        </div>
                        <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>
                        {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
                        <div className="absolute top-2 right-2 space-x-2"><button onClick={() => handleEdit(profile)} className="text-blue-500 hover:underline text-xs">수정</button><button onClick={() => handleDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button></div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {upcomingProfiles.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" />다가오는 일정</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {upcomingProfiles.map(profile => (
                    <div key={profile.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-400 relative">
                      <div className="flex items-baseline space-x-2">
                         <h3 className="font-bold text-blue-600">{profile.name}</h3>
                         <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
                      </div>
                      <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>
                      {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
                       <div className="absolute top-2 right-2 space-x-2"><button onClick={() => handleEdit(profile)} className="text-blue-500 hover:underline text-xs">수정</button><button onClick={() => handleDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button></div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="bg-white p-6 rounded-xl shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label>
                    {ageData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => `${value}명`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </section>

            <section className="bg-white p-6 rounded-xl shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={keywordData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false}/>
                  <Tooltip formatter={(value) => `${value}명`} />
                  <Legend />
                  <Bar dataKey="count" fill="#FFBB28" onClick={(data) => setSelectedCompany(data.name)} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-2 text-center">바를 클릭하면 아래에 해당 프로필이 표시됩니다.</p>
            </section>

            {selectedCompany && (
              <section className="bg-white p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold text-gray-800 mb-4">"{selectedCompany}" 경력자</h2>
                <div className="space-y-4">
                  {filteredByCompanyProfiles.map(profile => (
                    <div key={profile.id} className="p-4 bg-gray-50 rounded-lg border relative">
                        <div className="flex items-baseline space-x-2">
                           <h3 className="text-lg font-semibold text-yellow-600">{profile.name}</h3>
                           <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
                        </div>
                        <p className="text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>
                        {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
                       <div className="absolute top-2 right-2 space-x-2"><button onClick={() => handleEdit(profile)} className="text-blue-500 hover:underline text-xs">수정</button><button onClick={() => handleDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button></div>
                    </div>
                  ))}
                </div>
              </section>
            )}
        </>
    );
};

// 프로필 관리 탭 컴포넌트
const ManageTab = ({ profiles, handleEdit, handleDelete, handleFormSubmit, formState, setFormState }) => {
    const { editingProfile, newName, newCareer, newAge, newOtherInfo, newEventDate } = formState;
    const { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, resetForm } = setFormState;
    const [searchTerm, setSearchTerm] = useState('');
    
    const searchedProfiles = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return [];
        return profiles.filter(p =>
            (p.name && p.name.toLowerCase().includes(term)) ||
            (p.career && p.career.toLowerCase().includes(term)) ||
            (p.otherInfo && p.otherInfo.toLowerCase().includes(term)) ||
            (p.age && p.age.toString().includes(term))
        );
    }, [searchTerm, profiles]);

    return (
        <>
            <section>
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="이름, 경력, 기타 정보로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
                </div>
                {searchTerm.trim() && (
                    <div>
                        <h2 className="text-xl font-bold mb-4">검색 결과</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {searchedProfiles.length > 0 ? searchedProfiles.map(profile => (
                                <div key={profile.id} className="bg-white p-4 rounded-lg shadow relative">
                                    <div className="flex items-baseline space-x-2">
                                       <h3 className="font-bold text-yellow-600">{profile.name}</h3>
                                       <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
                                    </div>
                                    <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>
                                    {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
                                    <div className="absolute top-2 right-2 space-x-2"><button onClick={() => handleEdit(profile)} className="text-blue-500 hover:underline text-xs">수정</button><button onClick={() => handleDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button></div>
                                </div>
                            )) : <p className="text-gray-500">검색 결과가 없습니다.</p>}
                        </div>
                    </div>
                 )}
            </section>
            
            <section className="bg-white p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500"/>{editingProfile ? '프로필 수정' : '새 프로필 추가'}</h2>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" />
                        <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" />
                    <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
                    <input type="datetime-local" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} className="w-full p-2 border rounded" />
                    <div className="flex justify-end space-x-4">
                        {editingProfile && (<button type="button" onClick={resetForm} className="text-gray-600">취소</button>)}
                        <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded hover:bg-yellow-500">{editingProfile ? '수정 완료' : '추가하기'}</button>
                    </div>
                </form>
            </section>
            
            <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {profiles.sort((a,b) => a.name.localeCompare(b.name)).map(profile => (
                        <div key={profile.id} className="bg-white p-4 rounded-lg shadow relative">
                            <div className="flex items-baseline space-x-2">
                               <h3 className="font-bold text-yellow-600">{profile.name}</h3>
                               <span className="text-sm text-gray-500 font-medium">{profile.age ? `${profile.age}세` : ''}</span>
                            </div>
                            <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{profile.career}</p>
                            {profile.otherInfo && <p className="text-xs text-gray-500 mt-2 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
                            <div className="absolute top-2 right-2 space-x-2"><button onClick={() => handleEdit(profile)} className="text-blue-500 hover:underline text-xs">수정</button><button onClick={() => handleDelete(profile.id, profile.name)} className="text-red-500 hover:underline text-xs">삭제</button></div>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
};


export default function App() {
  const [accessCode, setAccessCode] = useState(localStorage.getItem('profileDbAccessCode') || null);
  const [profiles, setProfiles] = useState([]);
  const [authStatus, setAuthStatus] = useState('authenticating');
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

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
  
  const resetForm = () => {
      setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewEventDate('');
      setEditingProfile(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
    const profileData = { name: newName, career: newCareer, age: newAge ? Number(newAge) : null, otherInfo: newOtherInfo, eventDate: newEventDate || null };
    try {
        if (editingProfile) {
            await updateDoc(doc(profilesCollectionRef, editingProfile.id), profileData);
        } else {
            await addDoc(profilesCollectionRef, profileData);
        }
        resetForm();
    } catch (err) {
      console.error("프로필 저장 오류: ", err);
    }
  };
  
  const handleEdit = (profile) => {
      setEditingProfile(profile);
      setNewName(profile.name);
      setNewCareer(profile.career);
      setNewAge(profile.age || '');
      setNewOtherInfo(profile.otherInfo || '');
      setNewEventDate(profile.eventDate || '');
      setActiveTab(TAB_PAGE.MANAGE);
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

  const formState = { editingProfile, newName, newCareer, newAge, newOtherInfo, newEventDate };
  const setFormState = { setNewName, setNewCareer, setNewAge, setNewOtherInfo, setNewEventDate, resetForm };

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
        {activeTab === TAB_PAGE.DASHBOARD && <DashboardTab profiles={profiles} handleEdit={handleEdit} handleDelete={handleDeleteRequest} />}
        {activeTab === TAB_PAGE.MANAGE && <ManageTab profiles={profiles} handleEdit={handleEdit} handleDelete={handleDeleteRequest} handleFormSubmit={handleFormSubmit} formState={formState} setFormState={setFormState} />}
      </main>
    </div>
  );
}
