import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    deleteDoc,
    query,
    setLogLevel,
    updateDoc
} from 'firebase/firestore';
import { Search, UserPlus, Trash2, LogOut, Users, KeyRound, Loader2, Edit, Save, X, ShieldAlert } from 'lucide-react';

// Firebase 구성 정보
const firebaseConfig = {
  apiKey: "AIzaSyBue2ZMWEQ45L61s7ieFZM9DcQViQ-0_OY",
  authDomain: "dhwnsdud1210-bf233.firebaseapp.com",
  projectId: "dhwnsdud1210-bf233",
  storageBucket: "dhwnsdud1210-bf233.firebasestorage.app",
  messagingSenderId: "9275853060",
  appId: "1:9275853060:web:e5ccfa323da3493312a851",
  measurementId: "G-XS3VFNW6Y3"
};

// 앱의 고유 ID를 환경에 상관없이 상수로 고정
const appId = 'profile-db-app-junyoungoh';

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

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

// 프로필 카드 컴포넌트
const ProfileCard = ({ profile, onDelete, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState(profile);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleEditToggle = () => {
        setIsEditing(!isEditing);
        if (isEditing) setEditedProfile(profile);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedProfile(prev => ({ ...prev, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
    };

    const handleSave = () => {
        onUpdate(profile.id, editedProfile);
        setIsEditing(false);
    };
    
    const handleDeleteRequest = () => setShowDeleteConfirm(true);
    const confirmDelete = () => {
        onDelete(profile.id);
        setShowDeleteConfirm(false);
    };

    if (isEditing) {
        return (
            <div className="bg-white rounded-xl shadow-lg p-6 ring-2 ring-indigo-500">
                <div className="space-y-4">
                    <input name="name" value={editedProfile.name} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded-lg text-lg font-semibold" />
                    <textarea name="career" value={editedProfile.career} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded-lg h-20"></textarea>
                    <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded-lg" />
                    <textarea name="otherInfo" value={editedProfile.otherInfo} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded-lg h-20"></textarea>
                </div>
                <div className="mt-4 flex justify-end space-x-2">
                    <button onClick={handleEditToggle} className="p-2 text-gray-500 hover:text-gray-800"><X size={20} /></button>
                    <button onClick={handleSave} className="p-2 text-green-600 hover:text-green-800"><Save size={20} /></button>
                </div>
            </div>
        );
    }

    return (
        <>
            {showDeleteConfirm && <ConfirmationModal message={`'${profile.name}' 프로필을 정말로 삭제하시겠습니까?`} onConfirm={confirmDelete} onCancel={() => setShowDeleteConfirm(false)} />}
            <div className="bg-white rounded-xl shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 relative group">
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="uppercase tracking-wide text-sm text-indigo-500 font-semibold">{profile.name}</div>
                            <p className="block mt-1 text-lg leading-tight font-medium text-black whitespace-pre-wrap">{profile.career}</p>
                        </div>
                        <div className="text-gray-500 text-sm font-bold">{profile.age ? `${profile.age}세` : '나이 미입력'}</div>
                    </div>
                    <p className="mt-4 text-gray-600 whitespace-pre-wrap">{profile.otherInfo}</p>
                </div>
                <div className="absolute top-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={handleEditToggle} className="text-gray-400 hover:text-blue-500"><Edit size={18} /></button>
                    <button onClick={handleDeleteRequest} className="text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
                </div>
            </div>
        </>
    );
};

// 로그인 화면 컴포넌트
const LoginScreen = ({ onLogin, authStatus, error }) => {
    const [accessCode, setAccessCode] = useState('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (accessCode.trim()) onLogin(accessCode.trim());
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="w-full max-w-md">
                <div className="bg-white border rounded-2xl shadow-lg p-8">
                    <div className="text-center">
                        <Users className="mx-auto h-12 w-auto text-indigo-600" />
                        <h2 className="mt-6 text-3xl font-extrabold text-gray-900">프로필 데이터베이스</h2>
                        <p className="mt-2 text-sm text-gray-600">팀원들과 공유할 액세스 코드를 입력하세요.</p>
                    </div>
                    {error && <div className="mt-6 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded"><p className="font-bold">오류 발생</p><p>{error}</p></div>}
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input id="access-code" type="text" required className="w-full pl-10 pr-3 py-3 border rounded-lg" placeholder="액세스 코드" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
                        </div>
                        <div>
                            <button type="submit" disabled={authStatus !== 'authenticated'} className="w-full flex justify-center py-3 px-4 border rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300">
                                {authStatus === 'authenticating' && <Loader2 className="animate-spin mr-2" />}
                                {authStatus === 'authenticated' ? '접속하기' : '인증 중...'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// 메인 애플리케이션 컴포넌트
export default function App() {
    const [accessCode, setAccessCode] = useState(localStorage.getItem('profileDbAccessCode') || null);
    const [profiles, setProfiles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [authStatus, setAuthStatus] = useState('authenticating');

    const [newName, setNewName] = useState('');
    const [newCareer, setNewCareer] = useState('');
    const [newAge, setNewAge] = useState('');
    const [newOtherInfo, setNewOtherInfo] = useState('');
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (e) {
                    console.error("Firebase 익명 로그인 오류:", e);
                    setError("인증에 실패했습니다. Firebase 설정을 확인해주세요.");
                    setAuthStatus('error');
                }
            }
            setAuthStatus('authenticated');
        });
        return () => unsubscribe();
    }, []);

    const profilesCollectionRef = useMemo(() => {
        if (!accessCode) return null;
        return collection(db, 'artifacts', appId, 'public', 'data', accessCode);
    }, [accessCode]);

    useEffect(() => {
        if (authStatus !== 'authenticated' || !profilesCollectionRef) {
            setIsLoading(false);
            setProfiles([]);
            return;
        }

        setIsLoading(true);
        setError('');
        
        const q = query(profilesCollectionRef);
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const profilesData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            profilesData.sort((a, b) => a.name.localeCompare(b.name));
            setProfiles(profilesData);
            setIsLoading(false);
        }, (err) => {
            console.error("Firestore 구독 오류: ", err);
            setError("데이터를 불러오는 데 실패했습니다. 액세스 코드와 권한을 확인해주세요.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profilesCollectionRef, authStatus]);
    
    const handleLogin = (code) => {
        setAccessCode(code);
        localStorage.setItem('profileDbAccessCode', code);
    };

    const handleLogout = () => {
        setAccessCode(null);
        localStorage.removeItem('profileDbAccessCode');
    };

    const handleAddProfile = async (e) => {
        e.preventDefault();
        if (!newName.trim() || !newCareer.trim() || !profilesCollectionRef) return;
        
        try {
            await addDoc(profilesCollectionRef, { name: newName, career: newCareer, age: newAge ? Number(newAge) : null, otherInfo: newOtherInfo });
            setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo('');
        } catch (err) {
            console.error("프로필 추가 오류: ", err);
            setError("프로필 추가에 실패했습니다.");
        }
    };

    const handleDeleteProfile = async (id) => {
        if (!profilesCollectionRef) return;
        try {
            await deleteDoc(doc(profilesCollectionRef, id));
        } catch (err) {
            console.error("프로필 삭제 오류: ", err);
            setError("프로필 삭제에 실패했습니다.");
        }
    };
    
    const handleUpdateProfile = async (id, updatedData) => {
        if (!profilesCollectionRef) return;
        const { id: profileId, ...dataToUpdate } = updatedData;
        try {
            await updateDoc(doc(profilesCollectionRef, id), dataToUpdate);
        } catch (err) {
            console.error("프로필 업데이트 오류: ", err);
            setError("프로필 업데이트에 실패했습니다.");
        }
    };

    const filteredProfiles = useMemo(() => {
        const term = searchTerm.trim();
        if (!term) return profiles;

        // "20대", "30대" 등 연령대 검색 기능 추가
        const ageGroupMatch = term.match(/^(\d{1,2})대$/);
        if (ageGroupMatch) {
            const decadeStart = parseInt(ageGroupMatch[1], 10);
            if (decadeStart >= 10) { // 10대 이상만 처리
                const minAge = decadeStart;
                const maxAge = decadeStart + 9;
                return profiles.filter(profile => 
                    profile.age && profile.age >= minAge && profile.age <= maxAge
                );
            }
        }

        // 기존의 텍스트 검색 기능
        const lowercasedTerm = term.toLowerCase();
        return profiles.filter(p =>
            (p.name && p.name.toLowerCase().includes(lowercasedTerm)) ||
            (p.career && p.career.toLowerCase().includes(lowercasedTerm)) ||
            (p.age && p.age.toString().includes(lowercasedTerm)) ||
            (p.otherInfo && p.otherInfo.toLowerCase().includes(lowercasedTerm))
        );
    }, [profiles, searchTerm]);

    if (!accessCode) {
        return <LoginScreen onLogin={handleLogin} authStatus={authStatus} error={error} />;
    }

    return (
        <div className="bg-gray-100 min-h-screen font-sans">
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <Users className="h-8 w-8 text-indigo-600" />
                        <h1 className="text-2xl font-bold text-gray-800">프로필 데이터베이스</h1>
                        <span className="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-md font-mono">{accessCode}</span>
                    </div>
                    <button onClick={handleLogout} className="flex items-center space-x-2 text-sm text-gray-600 hover:text-indigo-600">
                        <LogOut size={16} /><span>로그아웃</span>
                    </button>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-white p-6 rounded-xl shadow-md mb-8">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                        <UserPlus size={24} className="mr-2 text-indigo-500" />새 프로필 추가
                    </h2>
                    <form onSubmit={handleAddProfile} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <input type="text" placeholder="이름 (필수)" value={newName} onChange={e => setNewName(e.target.value)} required className="p-3 border rounded-lg" />
                            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="p-3 border rounded-lg" />
                        </div>
                        <div><textarea placeholder="경력 (필수)" value={newCareer} onChange={e => setNewCareer(e.target.value)} required className="w-full p-3 border rounded-lg h-24"></textarea></div>
                        <div><textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-3 border rounded-lg h-24"></textarea></div>
                        <div className="text-right"><button type="submit" className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700">추가하기</button></div>
                    </form>
                </div>
                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded" role="alert"><p>{error}</p></div>}
                <div>
                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="이름, 경력, 기타 정보로 검색... (예: 20대)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 border rounded-xl shadow-sm" />
                    </div>
                    {isLoading ? (
                        <div className="flex justify-center items-center py-20"><Loader2 className="animate-spin text-indigo-500" size={48} /><p className="ml-4 text-gray-600">프로필을 불러오는 중...</p></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredProfiles.map(profile => <ProfileCard key={profile.id} profile={profile} onDelete={handleDeleteProfile} onUpdate={handleUpdateProfile} />)}
                            {profiles.length > 0 && filteredProfiles.length === 0 && <div className="col-span-full text-center py-12 text-gray-500"><p>"{searchTerm}"에 대한 검색 결과가 없습니다.</p></div>}
                            {profiles.length === 0 && !isLoading && <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl shadow-md"><p>데이터베이스가 비어 있습니다.</p></div>}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
