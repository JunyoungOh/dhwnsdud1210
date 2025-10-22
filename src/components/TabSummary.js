import React from 'react';

function fallbackFormat(value) {
  if (!value) return '';
  try {
    return typeof value === 'string' ? value : value.toString();
  } catch (err) {
    return '';
  }
}

const TabSummary = ({
  activeMain,
  alertsSummary,
  starredSummary,
  meetingSummary,
  idealSummary,
  manageSummary,
  formatDisplayDate,
}) => {
  const formatDate = formatDisplayDate || fallbackFormat;

  const renderNameChips = (list) => {
    if (!Array.isArray(list) || list.length === 0) {
      return <p className="mt-2 text-xs text-slate-500">없음</p>;
    }
    const visible = list.slice(0, 8);
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((item, idx) => (
          <span
            key={item?.id || `${item?.name || 'unknown'}-${idx}`}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
          >
            {item?.name || '이름 미상'}
          </span>
        ))}
        {list.length > visible.length && (
          <span className="text-xs text-slate-500">
            +{list.length - visible.length}명 더
          </span>
        )}
      </div>
    );
  };

  if (activeMain === 'alerts') {
    const waiting = alertsSummary?.waitingCount || 0;
    const today = alertsSummary?.today || [];
    const upcoming = alertsSummary?.upcoming || [];
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">알림 요약</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">미팅 일정 현황</h2>
            <p className="text-sm text-slate-600">오늘과 가까운 일정들을 한눈에 확인하세요.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">미팅 일정 대기 중</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{waiting}명</p>
            <p className="mt-1 text-xs text-slate-500">오늘 이후로 예정된 미팅 수</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">오늘의 일정</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{today.length}명</p>
            {renderNameChips(today)}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">다가오는 일정</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{upcoming.length}명</p>
            {renderNameChips(upcoming)}
          </div>
        </div>
      </section>
    );
  }

  if (activeMain === 'search') {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">검색 가이드</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">검색 탭 활용법</h2>
        <p className="mt-2 text-sm text-slate-600">
          자연어부터 고급 필터까지, 다양한 검색 식을 빠르게 참고하세요.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>
            <span className="font-semibold text-slate-800">자연어 검색</span>: “네이버 경력 백엔드 30대 리더”처럼 문장으로 입력하면
            의미 기반 매칭을 수행합니다.
          </li>
          <li>
            <span className="font-semibold text-slate-800">고급 필드 검색</span>: <code className="rounded bg-slate-100 px-1">이름:홍길동</code>,
            <code className="ml-1 rounded bg-slate-100 px-1">전문영역:데이터</code>처럼 조합하여 정확도를 높일 수 있습니다.
          </li>
          <li>
            <span className="font-semibold text-slate-800">불린 연산자</span>: <code className="rounded bg-slate-100 px-1">AND</code>,
            <code className="ml-1 rounded bg-slate-100 px-1">OR</code>를 활용해 조건을 세분화하세요.
          </li>
          <li>
            <span className="font-semibold text-slate-800">이상형게임 연동</span>: 검색 결과가 2명 이상이면 즉시 이상형게임으로
            연결해 빠르게 우승자를 추릴 수 있습니다.
          </li>
        </ul>
      </section>
    );
  }

  if (activeMain === 'starred') {
    const priorityCounts = starredSummary?.priorityCounts || {};
    const priorityList = ['3', '2', '1'].map((key) => ({
      key,
      count: priorityCounts[key] ?? 0,
    }));
    const otherCount = priorityCounts.other ?? 0;
    const expertiseList = (starredSummary?.topExpertise || []).map((item, idx) => ({
      key: item?.key || item?.name || `분류-${idx + 1}`,
      count: item?.count ?? 0,
    }));
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">주목 중인 프로필</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">우선순위 &amp; 직군 분포</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">우선순위 요약</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {priorityList.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="font-semibold text-slate-900">P{item.key}</span>
                  <span className="text-sm font-semibold text-slate-900">{item.count}명</span>
                </li>
              ))}
              {otherCount > 0 && (
                <li className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">기타</span>
                  <span className="font-semibold text-slate-800">{otherCount}명</span>
                </li>
              )}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">직군 분포</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {expertiseList.length === 0 ? (
                <li className="text-xs text-slate-500">집계된 직군 데이터가 없습니다.</li>
              ) : (
                expertiseList.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="truncate pr-2" title={item.key}>{item.key}</span>
                    <span className="text-sm font-semibold text-slate-900">{item.count}명</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  if (activeMain === 'meetings') {
    const latest = meetingSummary?.latest || null;
    const busiestList = Array.isArray(meetingSummary?.busiest) ? meetingSummary.busiest : [];
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">미팅 데이터</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">최근 미팅 현황</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">가장 최근 미팅</p>
            {latest ? (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p className="text-base font-semibold text-slate-900">{latest.name}</p>
                <p>
                  {latest.type}
                  {latest.label ? ` · ${latest.label}` : ''}
                  {latest.date ? ` (${formatDate(latest.date)})` : ''}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">최근 미팅 기록이 없습니다.</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">최근 3개월 최다 히스토리</p>
            {busiestList.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">최근 3개월 내 기록이 충분하지 않습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {busiestList.map((entry, idx) => (
                  <li
                    key={`${entry.name}-${entry.latest?.toISOString?.() || idx}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900">#{idx + 1} {entry.name}</span>
                      <span className="text-xs text-slate-500">
                        최근 {entry.latest ? formatDate(entry.latest) : '기록 없음'}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{entry.count}회</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (activeMain === 'functions') {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Functions 안내</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">세부 기능 살펴보기</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <h3 className="text-base font-semibold text-slate-900">추천</h3>
            <p className="mt-2 leading-relaxed">전문영역/우선순위 기반으로 샘플링하여 신규 제안 후보를 탐색합니다.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <h3 className="text-base font-semibold text-slate-900">장기관리</h3>
            <p className="mt-2 leading-relaxed">시간 경과에 따라 접촉이 끊긴 인재를 다시 리마인드할 수 있도록 정리합니다.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <h3 className="text-base font-semibold text-slate-900">그래프 &amp; 필터</h3>
            <p className="mt-2 leading-relaxed">전체 풀의 분포를 시각화하고 필터 조합으로 세부 세그먼트를 파악합니다.</p>
          </div>
        </div>
      </section>
    );
  }

  if (activeMain === 'ideal') {
    const winners = idealSummary?.list || [];
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">이상형게임 기록</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">우승 현황</h2>
        {winners.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">아직 우승 기록이 없습니다. 게임을 시작해 최종 우승자를 쌓아보세요.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {winners.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  {item.expertise ? <p className="text-xs text-slate-500">{item.expertise}</p> : null}
                </div>
                <span className="text-sm font-semibold text-slate-900">{item.count}승</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (activeMain === 'manage') {
    const recent = manageSummary?.recent || [];
    const bulkList = manageSummary?.bulkList || [];
    return (
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">프로필 관리 요약</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">최근 추가 &amp; 벌크 업로드</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">최근 1개월 내 추가된 프로필</h3>
            {recent.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">최근 한 달 내에 새로 추가된 프로필이 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {recent.map((item) => (
                  <li key={item.id || item.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="text-xs text-slate-500">{formatDate(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">엑셀 벌크 추가 현황</h3>
            {bulkList.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">엑셀 업로드 출처 정보가 아직 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {bulkList.map((item) => (
                  <li key={item.source} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="truncate pr-2" title={item.source}>{item.source}</span>
                    <span className="text-sm font-semibold text-slate-900">{item.count}명</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }

  return null;
};

export default TabSummary;
