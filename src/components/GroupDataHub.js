import React, { useCallback, useMemo, useState } from 'react';
import {
  Download,
  Save,
  RefreshCw,
  Folder as FolderIcon,
  Layers,
  Search,
  FileText,
  ChevronRight,
  Archive,
} from 'lucide-react';

import Btn from './ui/Btn';
import Badge from './ui/Badge';
import { toast } from './ui/Toast';
import {
  fetchCorpCodeMap,
  findBestCorpMatch,
  fetchExecutiveStatus,
  REPORT_CODE_OPTIONS,
  getReportLabel,
} from '../utils/opendart';

const KNOWN_GROUP_KEYWORDS = {
  삼성: ['삼성', 'samsung'],
  SK: ['sk', '에스케이'],
  현대자동차: ['현대자동차', '현대차', 'hyundai motor'],
  현대중공업: ['현대중공업', 'hyundai heavy'],
  LG: ['lg', '엘지'],
  롯데: ['롯데', 'lotte'],
  CJ: ['cj', '씨제이'],
  한화: ['한화', 'hanwha'],
  두산: ['두산', 'doosan'],
  신세계: ['신세계', '이마트', 'emart', 'ssg'],
  네이버: ['네이버', 'naver', '라인', 'line'],
  카카오: ['카카오', 'kakao'],
  GS: ['gs'],
  KT: ['kt', '케이티'],
  포스코: ['포스코', 'posco'],
};

const FALLBACK_FOLDER = '기타';

const normalize = (value = '') => value.replace(/\s+/g, '').toLowerCase();

const deriveFolderName = (companyName = '') => {
  if (!companyName) return FALLBACK_FOLDER;
  const normalized = normalize(companyName);

  for (const [folder, keywords] of Object.entries(KNOWN_GROUP_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(normalize(keyword)))) {
      return folder;
    }
  }

  const tokens = companyName
    .split(/[\s·&(),/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return FALLBACK_FOLDER;
  }
  const firstToken = tokens[0];
  if (/^[A-Za-z]{2,}$/.test(firstToken)) {
    return firstToken.toUpperCase();
  }
  if (/^[A-Za-z]+$/.test(firstToken)) {
    return firstToken.toUpperCase();
  }
  if (firstToken.length <= 4) {
    return firstToken;
  }
  return firstToken.slice(0, 4);
};

const createReportId = (meta) => `${meta.bsnsYear}-${meta.reprtCode}`;

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')} ` +
    `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
};

const buildReportLabel = (meta) => {
  if (!meta) return '';
  const year = meta.bsnsYear;
  const label = getReportLabel(meta.reprtCode);
  return `${year} ${label}`;
};

const computeFolderEntries = (folders) =>
  Object.entries(folders).map(([name, folder]) => {
    const companies = folder?.companies ? Object.values(folder.companies) : [];
    const reportCount = companies.reduce((sum, company) => sum + (company.reports?.length || 0), 0);
    const updatedAt = companies.reduce((latest, company) => {
      const candidate = company.updatedAt || latest;
      if (!latest) return candidate;
      if (!candidate) return latest;
      return new Date(candidate) > new Date(latest) ? candidate : latest;
    }, folder.updatedAt);
    return { name, companyCount: companies.length, reportCount, updatedAt };
  });

export default function GroupDataHub() {
  const [companyQuery, setCompanyQuery] = useState('');
  const [businessYear, setBusinessYear] = useState(String(new Date().getFullYear()));
  const [reportCode, setReportCode] = useState(REPORT_CODE_OPTIONS[0]?.code || '11011');
  const [corpCodes, setCorpCodes] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [dartMatch, setDartMatch] = useState(null);
  const [dartResult, setDartResult] = useState(null);
  const [rawDraft, setRawDraft] = useState('');
  const [error, setError] = useState('');
  const [folders, setFolders] = useState({});
  const [activeFolder, setActiveFolder] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [activeCompany, setActiveCompany] = useState(null);
  const [searchText, setSearchText] = useState('');

  const ensureCorpCodes = useCallback(async () => {
    if (corpCodes.length > 0) return corpCodes;
    const list = await fetchCorpCodeMap();
    setCorpCodes(list);
    return list;
  }, [corpCodes]);

  const handleFetch = useCallback(async () => {
    if (!companyQuery.trim()) {
      (toast.error?.('회사를 입력해 주세요.') ?? toast('회사를 입력해 주세요.'));
      return;
    }
    setIsFetching(true);
    setError('');

    try {
      const list = await ensureCorpCodes();
      const match = findBestCorpMatch(companyQuery, list);

      if (!match) {
        setDartMatch(null);
        setDartResult(null);
        setRawDraft('');
        setError('Open DART에서 회사를 찾지 못했습니다.');
        (toast.error?.('Open DART에서 회사를 찾지 못했습니다.') ?? toast('Open DART에서 회사를 찾지 못했습니다.'));
        return;
      }

      setDartMatch(match);

      const result = await fetchExecutiveStatus({
        corpCode: match.corpCode,
        bsnsYear: businessYear,
        reprtCode: reportCode,
      });

      setDartResult(result);
      setRawDraft(JSON.stringify(result.raw, null, 2));
      setError('');
      (toast.success?.('Open DART에서 데이터를 불러왔습니다.') ?? toast('Open DART에서 데이터를 불러왔습니다.'));
    } catch (fetchError) {
      const message = fetchError?.message || 'Open DART 조회에 실패했습니다.';
      setError(message);
      setDartResult(null);
      setRawDraft('');
      (toast.error?.(message) ?? toast(message));
    } finally {
      setIsFetching(false);
    }
  }, [companyQuery, ensureCorpCodes, businessYear, reportCode]);

  const handleSave = useCallback(() => {
    if (!dartResult) {
      (toast.error?.('저장할 데이터가 없습니다.') ?? toast('저장할 데이터가 없습니다.'));
      return;
    }

    const meta = dartResult.meta || {};
    const corpName = meta.corpName || dartMatch?.corpName || companyQuery.trim();
    const corpCode = meta.corpCode || dartMatch?.corpCode || '';
    const folderName = deriveFolderName(corpName);
    const savedAt = new Date().toISOString();
    const reportId = createReportId(meta);

    const newReport = {
      id: reportId,
      savedAt,
      meta,
      raw: dartResult.raw,
      rawText: rawDraft,
      registered: dartResult.registered || [],
      unregistered: dartResult.unregistered || [],
    };

    setFolders((prev) => {
      const prevFolder = prev[folderName] || { name: folderName, companies: {} };
      const prevCompanies = prevFolder.companies || {};
      const prevCompany = prevCompanies[corpName] || {
        corpName,
        corpCode,
        reports: [],
      };

      const filtered = prevCompany.reports.filter(
        (report) => !(report.meta?.bsnsYear === meta.bsnsYear && report.meta?.reprtCode === meta.reprtCode)
      );

      const reports = [newReport, ...filtered].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

      return {
        ...prev,
        [folderName]: {
          name: folderName,
          updatedAt: savedAt,
          companies: {
            ...prevCompanies,
            [corpName]: {
              ...prevCompany,
              corpName,
              corpCode: prevCompany.corpCode || corpCode,
              reports,
              updatedAt: savedAt,
            },
          },
        },
      };
    });

    setActiveFolder(folderName);
    setActiveCompany(corpName);
    (toast.success?.('데이터를 저장했습니다.') ?? toast('데이터를 저장했습니다.'));
  }, [dartResult, dartMatch, companyQuery, rawDraft]);

  const handleResetSearch = () => {
    setCompanyQuery('');
    setBusinessYear(String(new Date().getFullYear()));
    setReportCode(REPORT_CODE_OPTIONS[0]?.code || '11011');
    setDartMatch(null);
    setDartResult(null);
    setRawDraft('');
    setError('');
  };

  const handleClearStorage = () => {
    setFolders({});
    setActiveFolder(null);
    setActiveCompany(null);
    (toast.success?.('저장된 그룹사 데이터를 모두 삭제했습니다.') ?? toast('저장된 그룹사 데이터를 모두 삭제했습니다.'));
  };

  const folderEntries = useMemo(() => {
    const entries = computeFolderEntries(folders);
    return entries.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return a.name.localeCompare(b.name);
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [folders]);

  const activeFolderData = activeFolder ? folders[activeFolder] : null;

  const companyEntries = useMemo(() => {
    if (!activeFolderData?.companies) return [];
    const entries = Object.entries(activeFolderData.companies).map(([corpName, company]) => ({
      corpName,
      corpCode: company.corpCode,
      reports: company.reports || [],
      updatedAt: company.updatedAt,
    }));
    return entries.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return a.corpName.localeCompare(b.corpName);
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [activeFolderData]);

  const activeCompanyData = activeCompany ? activeFolderData?.companies?.[activeCompany] : null;

  const executiveRows = useMemo(() => {
    if (!activeCompanyData) return [];
    const rows = activeCompanyData.reports.flatMap((report) => {
      const reportLabel = buildReportLabel(report.meta);
      const registeredRows = (report.registered || []).map((entry, index) => ({
        id: `${report.id}-R-${index}`,
        reportLabel,
        savedAt: report.savedAt,
        category: '등기',
        ...entry,
      }));
      const unregisteredRows = (report.unregistered || []).map((entry, index) => ({
        id: `${report.id}-U-${index}`,
        reportLabel,
        savedAt: report.savedAt,
        category: entry.registeredStatus || '미등기',
        ...entry,
      }));
      return [...registeredRows, ...unregisteredRows];
    });

    if (!searchText.trim()) return rows;
    const needle = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = [row.name, row.title, row.duty, row.reportLabel, row.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [activeCompanyData, searchText]);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">그룹사 데이터 허브</h2>
            <p className="mt-1 text-sm text-slate-500">
              Open DART에서 임원 데이터를 불러와 그룹사/계열사 단위로 정리하고 저장하세요.
            </p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={handleResetSearch}>
              <RefreshCw className="mr-2 h-4 w-4" /> 조회 초기화
            </Btn>
            <Btn variant="ghost" size="sm" onClick={handleClearStorage}>
              <Archive className="mr-2 h-4 w-4" /> 저장 데이터 삭제
            </Btn>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-center gap-2 text-slate-700">
              <Download className="h-5 w-5" />
              <span className="text-base font-semibold">Open DART API에서 불러오기</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                회사명 검색
                <input
                  type="text"
                  value={companyQuery}
                  onChange={(event) => setCompanyQuery(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  placeholder="예: SK텔레콤"                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                사업연도
                <input
                  type="number"
                  value={businessYear}
                  onChange={(event) => setBusinessYear(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  min="2000"
                  max="2100"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                보고서 유형
                <select
                  value={reportCode}
                  onChange={(event) => setReportCode(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  {REPORT_CODE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Btn variant="primary" size="sm" onClick={handleFetch} disabled={isFetching}>
                <Download className="mr-2 h-4 w-4" />
                {isFetching ? '불러오는 중...' : 'Open DART 조회'}
              </Btn>
              <Btn variant="secondary" size="sm" onClick={handleSave} disabled={!dartResult}>
                <Save className="mr-2 h-4 w-4" /> 데이터 저장
              </Btn>
              {dartMatch && (
                <Badge tone="info" className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> {dartMatch.corpName}
                </Badge>
              )}
              {dartResult?.meta?.corpCode && (
                <Badge tone="neutral">corp_code: {dartResult.meta.corpCode}</Badge>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-600">불러온 원본 데이터</label>
              <textarea
                value={rawDraft}
                onChange={(event) => setRawDraft(event.target.value)}
                rows={12}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                placeholder="Open DART 응답이 여기에 표시됩니다."
              />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-slate-700">
              <FolderIcon className="h-5 w-5" />
              <span className="text-base font-semibold">저장 미리보기</span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">폴더 대상</p>
              <p className="mt-1 text-xs text-slate-500">
                회사명에 포함된 대표 키워드를 기준으로 같은 계열사/자회사가 하나의 폴더에 정리됩니다. 예: SK텔레콤 → SK 폴더.
              </p>
              {dartResult && (
                <ul className="mt-3 space-y-2 text-xs">
                  <li>
                    <span className="font-semibold text-slate-700">폴더</span>: {deriveFolderName(dartResult.meta?.corpName || dartMatch?.corpName || companyQuery)}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-700">기업명</span>: {dartResult.meta?.corpName || dartMatch?.corpName || companyQuery || '-'}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-700">저장 예정 보고서</span>: {buildReportLabel(dartResult.meta) || '-'}
                  </li>
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-100 bg-white p-4 text-xs text-slate-500">
              <p className="font-medium text-slate-600">저장 시 포함 항목</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Open DART API에서 내려온 원본 JSON 전체</li>
                <li>등기/미등기 임원 구분 및 기본 프로필 정보</li>
                <li>저장 일시와 보고서 유형 메타데이터</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-slate-900">그룹사별 저장 현황</h3>
          <p className="text-sm text-slate-500">
            저장된 데이터를 그룹 폴더 → 회사 → 보고서 순으로 탐색하고 원하는 임원 정보를 검색하세요.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {folderEntries.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">
              아직 저장된 그룹사 데이터가 없습니다. Open DART에서 데이터를 불러와 저장해 보세요.
            </div>
          ) : (
            folderEntries.map((folder) => (
              <button
                key={folder.name}
                type="button"
                onClick={() => {
                  setActiveFolder(folder.name);
                  setActiveCompany(null);
                }}
                className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 ${
                  activeFolder === folder.name ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700">
                    <FolderIcon className="h-5 w-5" />
                    <span className="text-base font-semibold">{folder.name}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone="neutral">기업 {folder.companyCount}</Badge>
                  <Badge tone="info">보고서 {folder.reportCount}</Badge>
                  {folder.updatedAt ? (
                    <Badge tone="warning">업데이트 {formatDateTime(folder.updatedAt)}</Badge>
                  ) : (
                    <Badge tone="neutral">업데이트 정보 없음</Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {activeFolder && (
          <div className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
            <div className="flex flex-col gap-2">
              <h4 className="text-lg font-semibold text-slate-900">{activeFolder} 폴더</h4>
              <p className="text-sm text-slate-500">계열사로 묶인 기업 목록입니다. 회사를 선택하면 저장된 보고서를 확인할 수 있습니다.</p>
            </div>

            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {companyEntries.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                  아직 {activeFolder} 폴더에 저장된 회사가 없습니다.
                </div>
              ) : (
                companyEntries.map((company) => (
                  <button
                    key={company.corpName}
                    type="button"
                    onClick={() => setActiveCompany(company.corpName)}
                    className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white ${
                      activeCompany === company.corpName ? 'border-slate-400 bg-white' : 'border-slate-200 bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-700">
                        <FileText className="h-4 w-4" />
                        <span className="text-sm font-semibold">{company.corpName}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {company.corpCode && <Badge tone="neutral">{company.corpCode}</Badge>}
                      <Badge tone="info">보고서 {company.reports.length}</Badge>
                      {company.updatedAt && <Badge tone="warning">저장 {formatDateTime(company.updatedAt)}</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>

            {activeCompany && (
              <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h5 className="text-lg font-semibold text-slate-900">{activeCompany}</h5>
                    <p className="text-sm text-slate-500">
                      저장된 보고서를 기준으로 임원 데이터를 조회하고 원본 JSON을 확인할 수 있습니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      <Search className="h-4 w-4" />
                      <input
                        type="text"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder="임원 검색"
                        className="bg-transparent text-sm focus:outline-none"
                      />
                    </div>
                    <Btn variant="ghost" size="sm" onClick={() => setSearchText('')}>
                      초기화
                    </Btn>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">보고서</th>
                        <th className="px-3 py-2 text-left font-medium">구분</th>
                        <th className="px-3 py-2 text-left font-medium">성명</th>
                        <th className="px-3 py-2 text-left font-medium">직위</th>
                        <th className="px-3 py-2 text-left font-medium">담당업무</th>
                        <th className="px-3 py-2 text-left font-medium">등기</th>
                        <th className="px-3 py-2 text-left font-medium">상근</th>
                        <th className="px-3 py-2 text-left font-medium">저장일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {executiveRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                            저장된 임원 정보가 없거나 검색 조건과 일치하는 항목이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        executiveRows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700">{row.reportLabel}</td>
                            <td className="px-3 py-2">{row.category}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{row.name || '-'}</td>
                            <td className="px-3 py-2">{row.title || '-'}</td>
                            <td className="px-3 py-2">{row.duty || '-'}</td>
                            <td className="px-3 py-2">{row.registeredStatus || '-'}</td>
                            <td className="px-3 py-2">{row.fullTime || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-400">{formatDateTime(row.savedAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3">
                  <h6 className="text-sm font-semibold text-slate-700">보고서별 원본 데이터</h6>
                  {activeCompanyData?.reports?.map((report) => (
                    <details key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-slate-700">
                        <span>
                          {buildReportLabel(report.meta)} · 저장 {formatDateTime(report.savedAt)} · 등기 {report.registered.length} / 미등기 {report.unregistered.length}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </summary>
                      <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700">
                        {report.rawText || JSON.stringify(report.raw, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
