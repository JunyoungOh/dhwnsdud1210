import React, { useCallback, useMemo, useState } from 'react';
import {
  UploadCloud,
  Folder as FolderIcon,
  FileText,
  Filter as FilterIcon,
  ChevronRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from 'recharts';

import Btn from './ui/Btn';
import Badge from './ui/Badge';
import { toast } from './ui/Toast';

const DEFAULT_GROUPS = [
  '삼성',
  'SK',
  'CJ',
  '현대자동차',
  'LG',
  '롯데',
  'GS',
  '네이버',
  '신세계',
  'KT',
];

const GROUP_KEYWORDS = {
  삼성: ['삼성', 'samsung', '삼성전자', '삼성생명', '삼성물산'],
  SK: ['sk', '에스케이', 'SK하이닉스', 'SK이노베이션', 'SK텔레콤'],
  CJ: ['cj', '씨제이', 'CJ제일제당', 'CJ대한통운'],
  현대자동차: ['현대자동차', '현대차', 'Hyundai Motor', '현대모비스', '기아'],
  LG: ['lg', '엘지', 'LG전자', 'LG화학', 'LG생활건강'],
  롯데: ['롯데', 'lotte', '롯데케미칼', '롯데쇼핑'],
  GS: ['gs', 'GS칼텍스', 'GS리테일'],
  네이버: ['네이버', 'naver', '라인', 'NAVER'],
  신세계: ['신세계', '이마트', 'SSG'],
  KT: ['kt', '케이티', 'KT&G'],
};

const SECTION_STOP_WORDS = [
  '요약',
  '기타',
  '보고서',
  '위원회',
  '평가',
  '보수',
  '성과',
  '인원 현황',
  '보수 총액',
  '이사회',
];

const MAIN_SECTION_LABELS = [
  '임원및직원등의현황',
  '임원및직원등에관한사항',
  ['임원및직원', '현황'],
  ['임원및직원', '사항'],
];

const REGISTERED_SECTION_LABELS = [
  '등기임원현황',
  '등기임원에관한사항',
  '등기임원',
];

const UNREGISTERED_SECTION_LABELS = [
  '미등기임원현황',
  '미등기임원에관한사항',
  '미등기임원',
];

const normalizeText = (value) =>
  (value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

const matchesLabel = (normalizedLine, label) => {
  if (!normalizedLine) return false;
  if (Array.isArray(label)) {
    return label.every((keyword) => normalizedLine.includes(normalizeText(keyword)));
  }
  return normalizedLine.includes(normalizeText(label));
};

const guessFolderFromCompany = (companyName) => {
  if (!companyName) return null;
  const normalized = companyName.replace(/\s+/g, '').toLowerCase();
  for (const [folder, keywords] of Object.entries(GROUP_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword.replace(/\s+/g, '').toLowerCase()))) {
      return folder;
    }
  }
  return null;
};

const extractCompanyNameFromFilename = (fileName) => {
  if (!fileName) return '';
  const match = fileName.match(/^\(([^)]+)\)/);
  if (match) {
    return match[1].trim();
  }
  return fileName.replace(/\.[^.]+$/, '').trim();
};

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });

const cleanLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const extractSectionByLabels = (text, labels, { stopLabels = [], includeHeading = true } = {}) => {
  if (!text) return '';
  const lines = cleanLines(text);
  let capturing = false;
  const section = [];

  lines.forEach((line) => {
    const normalized = line.replace(/\s+/g, '');
    const normalizedCompact = normalizeText(line);
    if (!capturing && labels.some((label) => matchesLabel(normalizedCompact, label))) {
      capturing = true;
      if (includeHeading) {
        section.push(line);
      }
      return;
    }
    if (capturing) {
      if (stopLabels.some((label) => matchesLabel(normalizedCompact, label))) {
        capturing = false;
        return;
      }
      const isStopLine = SECTION_STOP_WORDS.some((word) => normalized.includes(word.replace(/\s+/g, '')));
      const looksLikeHeader = /현황|보고|요약|사항/.test(line) && line.length <= 25;
      if (isStopLine && section.length > 1) {
        capturing = false;
        return;
      }
      if (looksLikeHeader && !labels.some((label) => matchesLabel(normalizedCompact, label))) {
        capturing = false;
        return;
      }
      section.push(line);
    }
  });

  return section.join('\n');
};

const KEYWORD_CHECKS = ['성명', '직위', '담당', '경력', '재직', '출생', '성별', '등기', '상근'];

const splitRow = (line) => {
  if (!line) return [];
  if (line.includes('|')) {
    return line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
  }
  if (/\t/.test(line)) {
    return line
      .split('\t')
      .map((cell) => cell.trim())
      .filter(Boolean);
  }
  if (/\s{2,}/.test(line)) {
    return line
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter(Boolean);
  }
  return [line.trim()].filter(Boolean);
};

const buildHeaderMap = (headers) => {
  const map = {};
  headers.forEach((header, index) => {
    const normalized = normalizeText(header);
    if (/성명|이름/.test(normalized)) {
      map.name = index;
    }
    if (/성별/.test(normalized)) {
      map.gender = index;
    }
    if (/출생|생년|생월|출신|출산/.test(normalized)) {
      map.birth = index;
    }
    if (/직위|직책|직무|현직/.test(normalized)) {
      map.title = index;
    }
    if (/등기임원|등기여부|등기임원여부|등기/.test(normalized)) {
      map.registeredStatus = index;
    }
    if (/상근|겸임|전임|비상근/.test(normalized)) {
      map.fullTime = index;
    }
    if (/담당|업무|책임/.test(normalized)) {
      map.duty = index;
    }
    if (/경력|이력/.test(normalized)) {
      map.career = index;
    }
    if (/재직|임기|재임/.test(normalized)) {
      map.tenure = index;
    }
    if (/비고|특기사항|참고/.test(normalized)) {
      map.notes = index;
    }
    if (!map.registeredStatus && /구분/.test(normalized)) {
      map.registeredStatus = index;
    }
  });
  return map;
};

const parseTableFromSection = (sectionText) => {
  if (!sectionText) return [];
  const lines = cleanLines(sectionText).filter((line) => {
    if (/^[-=]+$/.test(line)) return false;
    return true;
  });

  const rows = [];
  let headerMap = null;
  let lastRow = null;

  lines.forEach((line) => {
    const cells = splitRow(line);
    if (cells.length === 0) {
      return;
    }

    const normalizedCells = cells.map((cell) => normalizeText(cell));
    const keywordMatches = normalizedCells.filter((cell) =>
      KEYWORD_CHECKS.some((keyword) => cell.includes(normalizeText(keyword)))
    ).length;

    if (!headerMap) {
      if (keywordMatches >= 2) {
        headerMap = buildHeaderMap(cells);
      }
      return;
    }

    if (keywordMatches >= 2 && normalizedCells.some((cell) => cell.includes(normalizeText('성명')))) {
      headerMap = buildHeaderMap(cells);
      lastRow = null;
      return;
    }

    if (cells.length === 1) {
      const extra = cells[0];
      if (!extra || !lastRow) return;
      const targetKey = headerMap.career !== undefined ? 'career' : headerMap.duty !== undefined ? 'duty' : 'notes';
      if (targetKey === 'career') {
        lastRow.career = lastRow.career ? `${lastRow.career} ${extra}` : extra;
      } else if (targetKey === 'duty') {
        lastRow.duty = lastRow.duty ? `${lastRow.duty} ${extra}` : extra;
      } else {
        lastRow.notes = lastRow.notes ? `${lastRow.notes} ${extra}` : extra;
      }
      lastRow.raw = `${lastRow.raw}\n${extra}`;
      return;
    }

    const getValue = (key) => {
      const index = headerMap[key];
      if (index === undefined) return '';
      return (cells[index] || '').trim();
    };

    const row = {
      name: getValue('name'),
      gender: getValue('gender'),
      birth: getValue('birth'),
      title: getValue('title'),
      registeredStatus: getValue('registeredStatus'),
      fullTime: getValue('fullTime'),
      duty: getValue('duty'),
      career: getValue('career'),
      tenure: getValue('tenure'),
      notes: getValue('notes'),
      raw: cells.join(' | '),
    };

    rows.push(row);
    lastRow = row;
  });

  return rows;
};

const parseExecutivesFromText = (text) => {
  if (!text) {
    return {
      registered: [],
      unregistered: [],
      raw: '',
    };
  }
  const mainSection = extractSectionByLabels(text, MAIN_SECTION_LABELS);
  const source = mainSection || text;

  const registeredSection = extractSectionByLabels(mainSection || text, REGISTERED_SECTION_LABELS, {
    stopLabels: UNREGISTERED_SECTION_LABELS,
  });
  const unregisteredSection = extractSectionByLabels(mainSection || text, UNREGISTERED_SECTION_LABELS, {
    stopLabels: REGISTERED_SECTION_LABELS,
  });

  return {
    registered: parseTableFromSection(registeredSection),
    unregistered: parseTableFromSection(unregisteredSection),
    raw: source,
  };
};

const buildInitialFolders = () => {
  const base = {};
  DEFAULT_GROUPS.forEach((group) => {
    base[group] = {
      filings: [],
      createdAt: new Date().toISOString(),
    };
  });
  return base;
};

const formatDate = (iso) => {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
  } catch (error) {
    return '-';
  }
};

const makeExecutiveRecords = (entries, { folder, company, filingId, filingName, uploadedAt, category }) =>
  entries.map((item, index) => ({
    id: `${filingId}-${category}-${index}`,
    folder,
    company,
    category,
    name: item.name,
    gender: item.gender,
    birth: item.birth,
    title: item.title,
    duty: item.duty,
    registeredStatus: item.registeredStatus || (category === '등기임원' ? '등기' : '미등기'),
    fullTime: item.fullTime,
    career: item.career || item.notes,
    tenure: item.tenure || item.term,
    notes: item.notes,
    raw: item.raw,
    filingName,
    uploadedAt,
  }));

export default function GroupDataHub() {
  const [folders, setFolders] = useState(() => buildInitialFolders());
  const [activeFolder, setActiveFolder] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [folderFilters, setFolderFilters] = useState({});
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = useCallback(
    async (files) => {
      if (!files?.length) {
        (toast.info?.('업로드할 파일을 선택해주세요.') ?? toast('업로드할 파일을 선택해주세요.'));
        return;
      }
      setIsUploading(true);
      const updates = [];

      for (const file of files) {
        try {
          const companyName = extractCompanyNameFromFilename(file.name);
          const folder = guessFolderFromCompany(companyName) || companyName || '기타';
          const folderKey = folder.trim().length > 0 ? folder.trim() : '기타';

          // eslint-disable-next-line no-await-in-loop
          const text = await readFileAsText(file);
          const parsed = parseExecutivesFromText(String(text || ''));
          const uploadedAt = new Date().toISOString();
          const filingId = `${file.name}-${uploadedAt}`;

          updates.push({
            folder: folderKey,
            company: companyName,
            filing: {
              id: filingId,
              name: file.name,
              company: companyName,
              uploadedAt,
              registered: parsed.registered,
              unregistered: parsed.unregistered,
              raw: parsed.raw,
            },
          });
        } catch (error) {
          console.error(error);
          (toast.error?.(`${file.name} 처리 중 오류가 발생했습니다.`) ?? toast(`${file.name} 처리 중 오류가 발생했습니다.`));
        }
      }

      if (updates.length === 0) {
        setIsUploading(false);
        return;
      }

      setFolders((prev) => {
        const next = { ...prev };
        updates.forEach(({ folder, filing }) => {
          if (!next[folder]) {
            next[folder] = {
              filings: [],
              createdAt: new Date().toISOString(),
              isDynamic: true,
            };
          }
          next[folder] = {
            ...next[folder],
            filings: [filing, ...(next[folder]?.filings || [])],
            lastUpdatedAt: filing.uploadedAt,
          };
        });
        return next;
      });

      setIsUploading(false);
      (toast.success?.('공시자료를 불러왔습니다.') ?? toast('공시자료를 불러왔습니다.'));
    },
    []
  );

  const folderEntries = useMemo(() => Object.entries(folders).sort(([a], [b]) => a.localeCompare(b)), [folders]);

  const allExecutives = useMemo(() => {
    const aggregated = [];
    folderEntries.forEach(([folder, { filings }]) => {
      filings.forEach((filing) => {
        aggregated.push(
          ...makeExecutiveRecords(filing.registered, {
            folder,
            company: filing.company,
            filingId: filing.id,
            filingName: filing.name,
            uploadedAt: filing.uploadedAt,
            category: '등기임원',
          })
        );
        aggregated.push(
          ...makeExecutiveRecords(filing.unregistered, {
            folder,
            company: filing.company,
            filingId: filing.id,
            filingName: filing.name,
            uploadedAt: filing.uploadedAt,
            category: '미등기임원',
          })
        );
      });
    });
    return aggregated;
  }, [folderEntries]);

  const uniqueJobs = useMemo(() => {
    const set = new Set();
    allExecutives.forEach((item) => {
      if (item.title) set.add(item.title);
      if (item.duty) set.add(item.duty);
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [allExecutives]);

  const filteredExecutives = useMemo(() => {
    if (!globalFilter) return allExecutives;
    const normalized = globalFilter.replace(/\s+/g, '').toLowerCase();
    return allExecutives.filter((item) => {
      const title = (item.title || '').replace(/\s+/g, '').toLowerCase();
      const duty = (item.duty || '').replace(/\s+/g, '').toLowerCase();
      return title.includes(normalized) || duty.includes(normalized);
    });
  }, [allExecutives, globalFilter]);

  const chartData = useMemo(
    () =>
      folderEntries.map(([folder, { filings }]) => {
        const registeredCount = filings.reduce((sum, filing) => sum + (filing.registered?.length || 0), 0);
        const unregisteredCount = filings.reduce((sum, filing) => sum + (filing.unregistered?.length || 0), 0);
        return {
          name: folder,
          등록임원: registeredCount,
          미등기임원: unregisteredCount,
          총계: registeredCount + unregisteredCount,
        };
      }),
    [folderEntries]
  );

  const activeFolderFilter = activeFolder ? folderFilters[activeFolder] || '' : '';

  const activeFolderExecutives = useMemo(() => {
    if (!activeFolder) return [];
    const folder = folders[activeFolder];
    if (!folder) return [];
    const within = [];
    folder.filings.forEach((filing) => {
      within.push(
        ...makeExecutiveRecords(filing.registered, {
          folder: activeFolder,
          company: filing.company,
          filingId: filing.id,
          filingName: filing.name,
          uploadedAt: filing.uploadedAt,
          category: '등기임원',
        })
      );
      within.push(
        ...makeExecutiveRecords(filing.unregistered, {
          folder: activeFolder,
          company: filing.company,
          filingId: filing.id,
          filingName: filing.name,
          uploadedAt: filing.uploadedAt,
          category: '미등기임원',
        })
      );
    });
    if (!activeFolderFilter) return within;
    const normalized = activeFolderFilter.replace(/\s+/g, '').toLowerCase();
    return within.filter((item) => {
      const title = (item.title || '').replace(/\s+/g, '').toLowerCase();
      const duty = (item.duty || '').replace(/\s+/g, '').toLowerCase();
      return title.includes(normalized) || duty.includes(normalized);
    });
  }, [activeFolder, activeFolderFilter, folders]);

  const handleFolderFilterChange = (value) => {
    if (!activeFolder) return;
    setFolderFilters((prev) => ({
      ...prev,
      [activeFolder]: value,
    }));
  };

  const renderExecutiveTable = (rows, emptyLabel) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-600">그룹</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">기업</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">구분</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">성명</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">성별</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">출생년월</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">직위</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">등기임원여부</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">상근여부</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">담당업무</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">주요경력</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">재직기간</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">업데이트</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">출처</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={14} className="px-3 py-6 text-center text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/80">
                <td className="px-3 py-2 text-slate-600">{row.folder}</td>
                <td className="px-3 py-2 text-slate-600">{row.company}</td>
                <td className="px-3 py-2 text-slate-600">{row.category}</td>
                <td className="px-3 py-2 text-slate-900 font-medium">{row.name}</td>
                <td className="px-3 py-2 text-slate-600">{row.gender || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.birth || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.title || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.registeredStatus || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.fullTime || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.duty || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.career || '-'}</td>
                <td className="px-3 py-2 text-slate-600">{row.tenure || '-'}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(row.uploadedAt)}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{row.filingName}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">그룹사 임원 데이터 허브</h2>
            <p className="mt-1 text-sm text-slate-500">
              DART 공시자료를 업로드하면 각 그룹사 폴더에서 임원 데이터를 자동으로 추출하고 정리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">공시자료 업로드</span>
              <input
                type="file"
                accept=".txt,.csv,.pdf,.html,.xlsx,.xls"
                multiple
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(event) => {
                  const fileList = event.target.files;
                  if (!fileList) return;
                  handleFiles(Array.from(fileList));
                  event.target.value = '';
                }}
              />
              <Btn disabled={isUploading} variant="outline" size="sm">
                <UploadCloud className="mr-2 h-4 w-4" />
                {isUploading ? '불러오는 중...' : '공시자료 업로드'}
              </Btn>
            </label>
            <Btn
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                setFolders(buildInitialFolders());
                setActiveFolder(null);
                setGlobalFilter('');
                setFolderFilters({});
              }}
              title="초기화"
            >
              <RefreshCw className="h-4 w-4" />
            </Btn>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-sm font-medium text-slate-500">총 등록 임원</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {allExecutives.filter((item) => item.category === '등기임원').length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-sm font-medium text-slate-500">총 미등기 임원</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {allExecutives.filter((item) => item.category === '미등기임원').length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-sm font-medium text-slate-500">그룹사 수</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{folderEntries.length}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-sm font-medium text-slate-500">최근 업데이트</p>
            <p className="mt-2 text-sm text-slate-700">
              {formatDate(
                folderEntries.reduce((latest, [, value]) => {
                  const candidate = value.lastUpdatedAt;
                  if (!candidate) return latest;
                  if (!latest) return candidate;
                  return new Date(candidate) > new Date(latest) ? candidate : latest;
                }, null)
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">직무별 전체 필터링</h3>
            <p className="mt-1 text-sm text-slate-500">
              상위 10개 그룹사에 업로드된 모든 임원 데이터를 대상으로 원하는 직무를 빠르게 검색하세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterIcon className="h-4 w-4 text-slate-400" />
            <select
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">전체 보기</option>
              {uniqueJobs.map((job) => (
                <option key={job} value={job}>
                  {job}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          {renderExecutiveTable(filteredExecutives, '조건에 맞는 임원 데이터가 없습니다.')}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">그룹사별 업로드 현황</h3>
            <p className="mt-1 text-sm text-slate-500">각 폴더별로 등록된 임원 수를 한눈에 확인하세요.</p>
          </div>
          <Badge tone="info" className="flex items-center gap-1">
            <Info className="h-4 w-4" />
            그래프에 마우스를 올려 세부 정보를 확인하세요.
          </Badge>
        </div>
        <div className="mt-6 h-72 w-full">
          {chartData.every((item) => item.총계 === 0) ? (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
              아직 업로드된 공시자료가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5F5" />
                <XAxis dataKey="name" stroke="#64748B" />
                <YAxis stroke="#64748B" allowDecimals={false} />
                <Tooltip formatter={(value) => `${value}명`} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
                <Legend />
                <Bar dataKey="등록임원" stackId="a" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="미등기임원" stackId="a" fill="#22D3EE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-slate-900">그룹사 폴더</h3>
          <p className="text-sm text-slate-500">
            폴더를 선택하면 해당 그룹사의 공시자료 업로드 및 임원 현황을 관리할 수 있습니다.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {folderEntries.map(([folderName, value]) => {
            const latest = value.filings[0];
            const registeredCount = value.filings.reduce((sum, filing) => sum + (filing.registered?.length || 0), 0);
            const unregisteredCount = value.filings.reduce((sum, filing) => sum + (filing.unregistered?.length || 0), 0);
            return (
              <button
                key={folderName}
                type="button"
                onClick={() => setActiveFolder(folderName)}
                className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 ${
                  activeFolder === folderName ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700">
                    <FolderIcon className="h-5 w-5" />
                    <span className="text-base font-semibold">{folderName}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone="neutral">등록 {registeredCount}</Badge>
                  <Badge tone="info">미등기 {unregisteredCount}</Badge>
                  {latest ? (
                    <Badge tone="warning">최근 {formatDate(latest.uploadedAt)}</Badge>
                  ) : (
                    <Badge tone="neutral">자료 없음</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {activeFolder && (
          <div className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">{activeFolder} 폴더 관리</h4>
                <p className="mt-1 text-sm text-slate-500">
                  공시자료 업로드 시 파일명 첫 괄호 안 기업명을 기준으로 폴더가 자동 분류됩니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative">
                  <span className="sr-only">{activeFolder} 공시자료 업로드</span>
                  <input
                    type="file"
                    accept=".txt,.csv,.pdf,.html,.xlsx,.xls"
                    multiple
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(event) => {
                      const fileList = event.target.files;
                      if (!fileList) return;
                      handleFiles(Array.from(fileList));
                      event.target.value = '';
                    }}
                  />
                  <Btn disabled={isUploading} variant="primary" size="sm">
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {isUploading ? '불러오는 중...' : '자료 추가'}
                  </Btn>
                </label>
                <Btn variant="ghost" size="sm" onClick={() => setActiveFolder(null)}>
                  닫기
                </Btn>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-500">
              파일명 예시: <Badge tone="neutral">(삼성전자)2023사업보고서.pdf</Badge> → 자동으로 <strong>{activeFolder}</strong>{' '}
              폴더에 분류됩니다.
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FileText className="h-4 w-4" />
                총 {folders[activeFolder]?.filings.length || 0}개의 공시자료
              </div>
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-slate-400" />
                <select
                  value={activeFolderFilter}
                  onChange={(event) => handleFolderFilterChange(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="">전체 보기</option>
                  {uniqueJobs.map((job) => (
                    <option key={job} value={job}>
                      {job}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>{renderExecutiveTable(activeFolderExecutives, `${activeFolder} 폴더에 아직 정리된 임원 데이터가 없습니다.`)}</div>
          </div>
        )}
      </section>
    </div>
  );
}
