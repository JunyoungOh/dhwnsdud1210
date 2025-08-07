// 이 코드는 두 개의 탭 페이지로 나뉘어 구성됩니다.
// 1페이지: 오늘 일정, 다가오는 일정, 대시보드
// 2페이지: 검색, 새 프로필 추가, 전체 목록

// 전체 구조 재정비 및 탭 상태 추가

import React, { useMemo, useState, useEffect } from 'react';
// ... (기존 import는 그대로 유지)

// 상단에 추가
const TAB_PAGE = {
  DASHBOARD: 'dashboard',
  MANAGE: 'manage'
};

export default function App() {
  const [editingProfile, setEditingProfile] = useState(null);
  // 기존 상태 외에 탭 상태 추가
  const [activeTab, setActiveTab] = useState(TAB_PAGE.DASHBOARD);

  // ... (기존 상태, Firebase 설정, useEffect, 핸들러 유지)

  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <div className="flex items-center space-x-3">
          <Users className="text-yellow-400" />
          <h1 className="text-2xl font-bold text-gray-800">프로필 대시보드</h1>
          <span className="text-sm bg-gray-200 px-2 py-1 rounded">{accessCode}</span>
        </div>
        <button onClick={() => { setAccessCode(null); localStorage.removeItem('profileDbAccessCode'); }} className="text-sm text-gray-600 hover:text-yellow-600 flex items-center">
          <LogOut className="w-4 h-4 mr-1" /> 로그아웃
        </button>
      </header>

      {/* 탭 메뉴 */}
      <div className="flex justify-center space-x-4 border-b bg-white px-6 py-3">
        <button onClick={() => setActiveTab(TAB_PAGE.DASHBOARD)} className={`px-4 py-2 rounded ${activeTab === TAB_PAGE.DASHBOARD ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-800'}`}>대시보드</button>
        <button onClick={() => setActiveTab(TAB_PAGE.MANAGE)} className={`px-4 py-2 rounded ${activeTab === TAB_PAGE.MANAGE ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-800'}`}>관리</button>
      </div>

      <main className="p-6 space-y-12">
        {activeTab === TAB_PAGE.DASHBOARD && (
          <>
            {/* 오늘의 일정 */}
            {todayProfiles.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2" />오늘의 일정</h2>
                <div className="grid grid-cols-1 gap-4">
                  {todayProfiles.map(profile => (
                    <div key={profile.id} className="bg-white p-4 rounded shadow relative">
  <h3 className="font-bold text-yellow-600">{profile.name}</h3>
  <p>{profile.career}</p>
  <div className="absolute top-2 right-2 space-x-2">
    <button
      onClick={() => {
        setEditingProfile(profile);
        setNewName(profile.name);
        setNewCareer(profile.career);
        setNewAge(profile.age || '');
        setNewOtherInfo(profile.otherInfo || '');
        setNewEventDate(profile.eventDate || '');
      }}
      className="text-blue-500 hover:underline text-sm"
    >수정</button>
    <button
      onClick={async () => {
        if (confirm(`'${profile.name}' 프로필을 삭제할까요?`)) {
          await deleteDoc(doc(profilesCollectionRef, profile.id));
        }
      }}
      className="text-red-500 hover:underline text-sm"
    >삭제</button>
  </div>
</div>
                  ))}
                </div>
              </section>
            )}

            {/* 다가오는 일정 */}
            {upcomingProfiles.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2" />다가오는 일정</h2>
                <div className="grid grid-cols-1 gap-4">
                  {upcomingProfiles.map(profile => (
                    <div key={profile.id} className="bg-white p-4 rounded shadow">
                      <h3 className="font-bold text-yellow-600">{profile.name}</h3>
                      <p>{profile.career}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 대시보드 그래프 */}
            <section>
              <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label>
                    {ageData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={keywordData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#facc15" onClick={(data) => setSelectedCompany(data.name)} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-2">바를 클릭하면 해당 키워드 포함 프로필이 표시됩니다.</p>
            </section>

            {selectedCompany && (
              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4">"{selectedCompany}" 포함 프로필</h2>
                <div className="grid grid-cols-1 gap-4">
                  {filteredProfiles.map(profile => (
                    <div key={profile.id} className="p-4 bg-white rounded shadow">
                      <h3 className="text-lg font-semibold text-yellow-600">{profile.name}</h3>
                      <p className="text-gray-700 whitespace-pre-wrap">{profile.career}</p>
                      <p className="text-sm text-gray-500 mt-1">{profile.age ? `${profile.age}세` : '나이 정보 없음'}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === TAB_PAGE.MANAGE && (
          <>
            {/* 검색 */}
            <section>
              <h2 className="text-xl font-bold mb-4">검색</h2>
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="이름, 경력, 기타 정보로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-3 pl-10 border rounded-xl shadow-sm" />
              </div>
              {searchTerm.trim() && (
                <div className="grid grid-cols-1 gap-4">
                  {searchedProfiles.map(profile => (
                    <div key={profile.id} className="bg-white p-4 rounded shadow">
                      <h3 className="font-bold text-yellow-600">{profile.name}</h3>
                      <p>{profile.career}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 새 프로필 추가 */}
            <section>
  <h2 className="text-xl font-bold mb-4">{editingProfile ? '프로필 수정' : '새 프로필 추가'}</h2>
  <form onSubmit={async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim()) return;

    if (editingProfile) {
      await updateDoc(doc(profilesCollectionRef, editingProfile.id), {
        name: newName,
        career: newCareer,
        age: newAge ? Number(newAge) : null,
        otherInfo: newOtherInfo,
        eventDate: newEventDate || null
      });
      setEditingProfile(null);
    } else {
      await addDoc(profilesCollectionRef, {
        name: newName,
        career: newCareer,
        age: newAge ? Number(newAge) : null,
        otherInfo: newOtherInfo,
        eventDate: newEventDate || null
      });
    }

    setNewName('');
    setNewCareer('');
    setNewAge('');
    setNewOtherInfo('');
    setNewEventDate('');
  }} className="space-y-4">
    <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" />
    <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
    <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded" />
    <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded" />
    <input type="datetime-local" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} className="w-full p-2 border rounded" />
    <div className="flex justify-between">
      <button type="submit" className="bg-yellow-400 text-white px-4 py-2 rounded">
        {editingProfile ? '저장' : '추가'}
      </button>
      {editingProfile && (
        <button
          type="button"
          onClick={() => {
            setEditingProfile(null);
            setNewName('');
            setNewCareer('');
            setNewAge('');
            setNewOtherInfo('');
            setNewEventDate('');
          }}
          className="text-gray-500 hover:underline"
        >취소</button>
      )}
    </div>
  </form>
</section>

            {/* 전체 프로필 */}
            <section>
              <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필</h2>
              <div className="grid grid-cols-1 gap-4">
                {profiles.map(profile => (
                  <div key={profile.id} className="bg-white p-4 rounded shadow">
                    <h3 className="font-bold text-yellow-600">{profile.name}</h3>
                    <p>{profile.career}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
