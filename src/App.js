import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query,
  updateDoc, writeBatch, getDoc, getDocs, setLogLevel, limit, setDoc
} from 'firebase/firestore';

import {
  PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';

import {
  Users, LogOut, Search as SearchIcon, Calendar, Zap, UserPlus, KeyRound, Loader2,
  Edit, Trash2, ShieldAlert, X, Save, UploadCloud, BellRing, Share2,
  CalendarPlus, AlertCircle, Star, Menu,
  Layers, LineChart as LineChartIcon, Clock, Sparkles, ExternalLink,
  ChevronDown, Download
} from 'lucide-react';

import { parseNaturalQuery, matchProfileWithNL } from './utils/nlp';
import { MeetingsPage } from './utils/meetings';

import AuthGate, { useUserCtx } from './auth/AuthGate';
import UserAdmin from './admin/UserAdmin';

/* === 새 UI 컴포넌트들 === */
import Btn from './components/ui/Btn';
import Badge from './components/ui/Badge';
import SkeletonRow from './components/ui/SkeletonRow';
import { toast } from './components/ui/Toast';

// ✅ App.js 상단, import 라인들 바로 아래에 추가
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(err){ return { hasError:true, error:err }; }
  componentDidCatch(err, info){ if (process.env.NODE_ENV !== 'production') console.error(err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{ padding:16, fontSize:14 }}>
          <b>문제가 발생했어요.</b>
          <div style={{ opacity:0.8, marginTop:8 }}>새로고침하거나 잠시 뒤 다시 시도해주세요.</div>
          {process.env.NODE_ENV !== 'production' && (
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12, marginTop:12 }}>
              {String(this.state.error)}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ============ 환경 변수 ============
const GOOGLE_API_KEY   = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const DISCOVERY_DOCS   = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES           = "https://www.googleapis.com/auth/calendar.events";

// ============ Firebase ============
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId:     process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

const appId = 'profile-db-app-junyoungoh';
const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug');

// === DevTools 진단용 전역 노출 (디버그 전용) ===
if (typeof window !== 'undefined') {
  window.__AUTH__ = auth;
  window.__DB__   = db;
  window.__FIRE__ = {
    db,
    auth,
    doc,
    collection,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    updateDoc,
    setDoc,
    addDoc,
    deleteDoc,
    writeBatch,
    limit,
  };
  console.log('[debug] window.__FIRE__ ready =', !!window.__FIRE__);
}

const TZ = 'Asia/Seoul';
const COLORS = ['#FFBB28', '#FF8042', '#00C49F', '#8884D8', '#FF4444', '#82ca9d'];
const TARGET_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];

function useIsAdmin() {
  const ctx = useUserCtx();

  const [uid, setUid] = React.useState(() => ctx?.user?.uid || auth.currentUser?.uid || null);
  const [fireAdmin, setFireAdmin] = React.useState(null);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    if (ctx?.user?.uid) {
      setUid(ctx.user.uid);
      return;
    }
    setUid(auth.currentUser?.uid || null);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
    });
    return () => unsubAuth();
  }, [ctx?.user?.uid]);

  React.useEffect(() => {
    setErr('');
    if (!uid) { setFireAdmin(null); return; }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        // role: 'admin' 또는 isAdmin: true 둘 중 하나만 있어도 관리자
        const v = (data?.isAdmin === true || data?.isAdmin === 'true') ||
                  (data?.role === 'admin');
        setFireAdmin(!!v);
      },
      (e) => {
        setFireAdmin(false);
        setErr(e?.code ? `${e.code}: ${e.message}` : 'users 문서를 읽을 수 없습니다.');
      }
    );
    return () => unsub();
  }, [uid]);

  const ctxAdmin = !!(ctx?.isAdmin || ctx?.profile?.isAdmin);

  const isAdmin = Boolean(ctxAdmin || fireAdmin === true);
  const isLoading = uid === null || (!ctxAdmin && fireAdmin === null);

  return { isAdmin, isLoading, uid, ctxAdmin, fireAdmin, err };
}

// ============ 유틸 ============
function formatRFC3339InTZ(date, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
function formatDateOnlyInTZ(date, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function parseDateTimeFromRecord(recordText) {
  if (!recordText) return null;
  const text = typeof recordText === 'string' ? recordText : String(recordText || '');
  let best = null; let m;
  const reA = /\((\d{2})\.(\d{2})\.(\d{2})\)\s*(?:(AM|PM|오전|오후)?\s*(\d{1,2})(?::(\d{2}))?(?:\s*시)?(?:\s*(\d{1,2})\s*분?)?)?/gi;
  while ((m = reA.exec(text)) !== null) {
    const year  = 2000 + parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day   = parseInt(m[3], 10);
    let hadTime = false, hour = 0, minute = 0;
    if (m[5] || m[6] || m[4]) {
      hadTime = true;
      hour   = m[5] ? parseInt(m[5], 10) : 0;
      minute = m[6] ? parseInt(m[6], 10) : (m[7] ? parseInt(m[7], 10) : 0);
      const ampm = m[4] ? m[4].toUpperCase() : '';
      if (ampm === 'PM' || ampm === '오후') { if (hour !== 12) hour += 12; }
      if (ampm === 'AM' || ampm === '오전') { if (hour === 12) hour = 0; }
    }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }
  const reB = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/g;
  while ((m = reB.exec(text)) !== null) {
    const year  = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day   = parseInt(m[3], 10);
    let hadTime = false, hour = 0, minute = 0;
    if (m[4]) { hadTime = true; hour = parseInt(m[4], 10); minute = parseInt(m[5] || '0', 10); }
    const d = new Date(year, month, day, hour, minute);
    if (!best || d > best.date) best = { date: d, hadTime };
  }
  return best ? best : null;
}
function tokenizeProfile(p) {
  const base = [p.name||'', p.expertise||'', p.career||'', p.otherInfo||''].join(' ').toLowerCase();
  const words = base.replace(/[()\[\],./\\\-:~!@#$%^&*?'"`|]/g, ' ').split(/\s+/).filter(Boolean);
  const extra = [];
  TARGET_KEYWORDS.forEach(k => { if ((p.career||'').includes(k)) extra.push(k); });
  if (p.priority) extra.push(`priority:${p.priority}`);
  if (p.age) {
    const band = p.age < 20 ? '10' : p.age < 30 ? '20' : p.age < 40 ? '30' : p.age < 50 ? '40' : '50+';
    extra.push(`age:${band}`);
  }
  return new Set([...words, ...extra]);
}
function jaccard(aSet, bSet) {
  const inter = new Set([...aSet].filter(x => bSet.has(x)));
  const uni   = new Set([...aSet, ...bSet]);
  return uni.size === 0 ? 0 : inter.size / uni.size;
}
function similarityScore(a, b) {
  const ta = tokenizeProfile(a); const tb = tokenizeProfile(b);
  let score = jaccard(ta, tb) * 100;
  if (a.priority && b.priority && a.priority === b.priority) score += 6;
  const ak = TARGET_KEYWORDS.filter(k => (a.career||'').includes(k));
  const bk = TARGET_KEYWORDS.filter(k => (b.career||'').includes(k)).filter(Boolean);
  score += Math.min(ak.filter(k => bk.includes(k)).length * 6, 18);
  if (a.expertise && b.expertise && a.expertise === b.expertise) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ===== 전문영역 자동 인식 =====
const EXPERTISE_KEYWORDS = {
  // ::가중치 (기본 1). 직함/핵심용어는 3, 강한 시그널은 2 권장
  '재무/투자': [
    '투자::2','investment::2','재무::2','fp&a','finance','금융::2','m&a::3','cfo::3','은행','ib','ipo','valuation','밸류에이션',
    '벤처캐피탈::2','벤처캐피털::2','vc::2','증권','애널리스트','fund','펀드','회계','auditor','회계사','cpa','머지앤드어퀴지션'
  ],
  '전략/BD': [
    'cso::3','전략::2','strategy::2','컨설팅::2','consultant::2','business analyst','mckinsey::3','맥킨지::3','bcg::3','bain::3','베인::3',
    'pe::2','private equity::2','m&a::3','ba','미래전략실','경영전략','corp dev::2','corporate development::2',
    'engagement manager::2','ceo staff::2','chief of staff::2','corporate finance','사업총괄::2','사업전략::2','bd::2','사업개발::2'
  ],
  '테크/프로덕트': [
    '개발자::2','developer::2','software engineer::3','engineer::2','swe::2','frontend','back-end','backend','full stack','infra',
    'pm::2','po::2','product manager::3','product owner::2','cpo::3','cto::3','architect::2','tech lead::2','엔지니어','머신러닝','ml',
    'data engineer','data scientist','ai','devops','sre','qa','테크리드','프로덕트::2','개발::2','프로덕트 매니저::3'
  ],
  '브랜드/마케팅': [
    '브랜딩::2','마케팅::2','마케터','브랜드::2','brand::2','branding::2','marketing::2','performance marketing','growth::2',
    'crm','seo','sem','content marketing','creative director::2','copywriter','미디어플래닝','캠페인','제일기획::2','ae::2','광고대행사'
  ],
  '인사/노무': [
    '인사','노무','hr','hrbp','hrm','hrd','people team','people operations','people ops','chro',
    'talent acquisition','ta','recruiter','채용','교육','평가','보상','c&b','compensation','benefits',
    'employee relations','er','노사','노경','조직문화','경영지원','노무법인','노무사','인사총무','hr operations'
  ],
  'C레벨 Pool': [
    'ceo::3','대표::3','대표이사::3','사장::3','총괄사장::3','창업자::3','founder::3','co-founder::3','지사장::3','총괄::2','cxo::3',
    'chairman::3','vice president::2','svp::2','evp::2','board member::2','이사회::2'
  ],
  '홍보/대관': [
    '홍보::2','pr::2','communications::2','커뮤니케이션::2','gr::2','대관::2','public affairs::2','언론','보도자료','media relations'
  ],
};

// 카테고리별 '부정 키워드'(나오면 감점) — 특히 HR vs IR/PR 혼동 방지
const NEGATIVE_KEYWORDS = {
  '인사/노무': ['investor relations','ir','public relations','pr','media relations'],
};

// 카테고리별 '코어 토큰' — 이게 하나도 없으면 점수 하향 또는 0 처리
const CORE_TOKENS = {
  '인사/노무': ['hr','인사','노무','hrbp','ta','talent acquisition','people team','people operations','employee relations'],
};

// 최근 경력 가중치 계산: 상단 라인 + 최근 연도 + '현재/재직' 마커 감지
function computeLineSlices(rawText) {
  const raw = String(rawText || '');
  const chunks = raw
    .split(/\r?\n+/)                        // 줄바꿈 기준 1차 분할
    .flatMap(l => l.split(/[•·∙・\-–—\u2212]/)) // 불릿/대시 기준 2차 분할
    .map(s => s.trim())
    .filter(Boolean);

  const n = chunks.length || 1;

  // 위치 기반 가중: 상단일수록 커짐 (최소 0.3 보장)
  const base = (idx) => Math.max(0.3, 1.1 - (idx / Math.max(6, n)) * 0.8);

  // 연도 보너스
  const yearRe = /(20\d{2})/g; // 2000년대만
  const nowY = new Date().getFullYear();
  const recBonus = (line) => {
    let m, best = 0;
    const l = line.toLowerCase();
    while ((m = yearRe.exec(l)) !== null) {
      const y = Number(m[1]);
      if (y >= 2000 && y <= nowY + 1) best = Math.max(best, y);
    }
    if (!best) return 0;
    const diff = Math.max(0, nowY - best);
    if (diff <= 1) return 0.5;
    if (diff <= 3) return 0.35;
    if (diff <= 5) return 0.2;
    return 0.1;
  };

  // '현재/재직/Present' 마커 감지
  const currentMarkers = [
    '현재', '재직', '근무중', 'present', 'now', 'current', 'on-going', 'ongoing'
  ];
  // 범용 기간 패턴: "YYYY.MM ~ 현재", "YYYY-MM – Present" 등
  const currentRangeRe =
    /(?:20\d{2}[./-](?:\d{1,2})?)\s*[~\-–—]\s*(?:현재|present|now|current)/i;

  return chunks.map((line, idx) => {
    const low = line.toLowerCase();
    const isCurrent =
      currentMarkers.some(m => low.includes(m)) || currentRangeRe.test(line);
    const isTopRecent = idx < TOP_HEAD_RANGE; // 상단 몇 줄 보너스
    const weight = base(idx) + recBonus(line);
    return { line, idx, isCurrent, isTopRecent, weight };
  });
}

// === 최근/현재 경력 가중치 상수 ===
const CURRENT_MULT = 2.0;       // "현재/재직/Present" 라인 가중
const CURRENT_HR_MULT = 2.5;    // HR 카테고리의 '현재 경력' 가중(오검출 억제 유지하면서 현재면 강하게)
const TOP_HEAD_MULT = 1.4;      // 상단(가장 최근) 몇 줄 보너스
const TOP_HEAD_RANGE = 3;       // 상단 N줄을 '최근 라인'으로 간주

// --- 키워드 매칭 유틸: 단어 경계 + 예외 컨텍스트 ---
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "product"가 'product sales/marketing' 같은 컨텍스트면 테크로 카운트 금지
function isProductSalesContext(line) {
  const l = line.toLowerCase();
  return /\bproduct\b\s*(sales|marketing|mgr\.?\s*sales|bizdev)/i.test(l);
}

// HR 컨텍스트(같은 라인에 HR/HRBP/People 등)면 테크 토큰 가중치 크게 줄이기
function isHRContext(line) {
  const l = line.toLowerCase();
  return /\b(hr|hrbp|people|인사|노무|c&b|comp(?:ensation)?\s*&\s*benefits|employee\s*relations|er|인사총무)\b/i.test(l);
}

// 라인에서 키워드 카운트(단어 경계). 카테고리별 특수 처리 가능.
function countKeywordOnLine(line, kw, cat) {
  const l = String(line || '');
  const low = ` ${l.toLowerCase().replace(/[·•・∙]/g, ' ').replace(/\s+/g, ' ').trim()} `;

  // 'product' 특수 처리: 세일즈 컨텍스트면 0, 역할명과 함께일 때만 인정
  if (cat === '테크/프로덕트' && kw === 'product') {
    if (isProductSalesContext(low)) return 0;
    // 역할명 패턴(제품 직군): product manager/owner/lead/director/cpo/pm/po
    const roleOk = /\b(product\s+(manager|owner|lead|director)|cpo|pm|po)\b/i.test(low);
    if (!roleOk) return 0;
  }

  // 단어 경계 매칭
  const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'gi');
  let m, c = 0;
  while ((m = re.exec(low)) !== null) c += 1;
  return c;
}

function detectExpertiseFromCareer(careerText = '') {
  let text = String(careerText || '').toLowerCase();
  if (!text.trim()) return null;
  const normalize = (s) => String(s || '').toLowerCase()
    .replace(/&amp;|&#38;/g, '&')    // HTML 엔티티 → &
    .replace(/＆/g, '&')             // 전각 앰퍼샌드
    .replace(/[·•・∙··]/g, ' ')      // 점류 기호
    .replace(/[_/|\\\-]/g, ' ')      // 구분자 → 공백
    .replace(/\s+/g, ' ')
    .trim();
  const hay = ` ${normalize(text)} `; // 경계 완화용 패딩

  const parseKw = (raw) => {
    // '키워드::가중치' 형태 지원
    const m = String(raw).split('::');
    const kw = normalize(m[0]);
    const w = Number(m[1]) || 1;
    return { kw, w };
  };

  // 라인/연도/현재 경력 가중치가 반영된 스코어링 (교체본)
  const rawScores = {}; // { cat: {score, lastPos, hits:{kw->count}, currentHit, anyTopHit} }
  const slices = computeLineSlices(text); // 원문 기준 분절

  for (const [cat, kws] of Object.entries(EXPERTISE_KEYWORDS)) {
    let score = 0, lastPos = -1;
    const hits = {};
    let currentHit = false;
    let anyTopHit = false;

    for (const raw of kws) {
      const { kw, w } = parseKw(raw);
      if (!kw) continue;

      for (let i = 0; i < slices.length; i++) {
        const { line, weight, isCurrent, isTopRecent, idx } = slices[i];
        if (!line) continue;

        // 단어 경계 기반 카운트 (+ product sales 예외/HR 라인 감쇠는 헬퍼 내부/아래 로직에서 처리)
        let localCount = countKeywordOnLine(line, kw, cat);

        // 테크/프로덕트 키워드가 HR 컨텍스트 라인에서 나오면 강한 감쇠(누수 방지)
        if (localCount > 0 && cat === '테크/프로덕트' && isHRContext(line)) {
          localCount = Math.max(0, Math.floor(localCount * 0.25)); // 75% 감쇠
        }

        if (localCount > 0) {
          const baseHit = (w || 1) * weight;
          const headBoost = isTopRecent ? TOP_HEAD_MULT : 1;
          const currentBoost = isCurrent
            ? (cat === '인사/노무' ? CURRENT_HR_MULT : CURRENT_MULT)
            : 1;

          const perHit = baseHit * headBoost * currentBoost;

          score += perHit * localCount;
          hits[kw] = (hits[kw] || 0) + localCount;

          if (isCurrent) currentHit = true;
          if (isTopRecent) anyTopHit = true;

          // 상단일수록 "최근"으로 간주 → 큰 lastPos (tie-break용)
          lastPos = Math.max(lastPos, (text.length - idx));
        }
      }
    }
    rawScores[cat] = { score, lastPos, hits, currentHit, anyTopHit };
  }


  // 2) 부정 키워드 페널티
  for (const [cat, negs] of Object.entries(NEGATIVE_KEYWORDS)) {
    if (!negs || !negs.length) continue;
    if (!rawScores[cat]) continue;
    const nlist = negs.map(normalize);
    let penalty = 0;
    for (const n of nlist) {
      if (n && (hay.indexOf(` ${n} `) !== -1 || hay.indexOf(n) !== -1)) penalty += 2;
    }
    if (penalty > 0) rawScores[cat].score = Math.max(0, rawScores[cat].score - penalty);
  }

  // 3) 코어 토큰이 하나도 없으면 카테고리 점수 하향 (HR 오검출 억제: 선택 C 반영)
  for (const [cat, cores] of Object.entries(CORE_TOKENS)) {
    if (!cores || !cores.length) continue;
    if (!rawScores[cat]) continue;

    const clist = cores.map(normalize);
    let coreHits = 0;
    for (const c of clist) {
      if (!c) continue;
      if (hay.indexOf(` ${c} `) !== -1 || hay.indexOf(c) !== -1) coreHits += 1;
    }

    if (cat === '인사/노무') {
      // 선택 C: HR은 코어 1개 '미만'이면 0점
      if (coreHits < 1) rawScores[cat].score = 0;
    } else {
      // 타 카테고리: 코어 0개면 50% 감점(완전 0점은 아님)
      if (coreHits === 0 && rawScores[cat].score > 0) {
        rawScores[cat].score = Math.floor(rawScores[cat].score * 0.5);
      }
    }
  }

  // ✅ HR 현재/상단 우세 시 테크 누수 억제 (코어 패널티 적용 "후", 루프 바깥에서)
  {
    const hr   = rawScores['인사/노무'];
    const tech = rawScores['테크/프로덕트'];
    if (hr && tech) {
      const hrStrong = (hr.currentHit || hr.anyTopHit) && hr.score >= 2;
      const techPastOnly = tech.currentHit ? false : true;
      if (hrStrong && techPastOnly && tech.score > 0 && tech.score <= hr.score * 1.1) {
        tech.score = Math.max(1, Math.floor(tech.score * 0.3)); // 70% 감쇠
      }
    }
  }

  // 4) 최종 스코어로 1차 후보 선택
  let bestCat = null, bestVal = -1, bestPos = -1;
  for (const [cat, v] of Object.entries(rawScores)) {
    if (!v || v.score <= 0) continue;
    const final = v.score * 1000 + Math.max(0, v.lastPos);
    if (final > bestVal) { bestVal = final; bestCat = cat; bestPos = v.lastPos; }
  }
  if (!bestCat) return null;

  // 5) 우선순위 규칙 — C레벨/전략이 강하면 HR로 덮지 않도록
  const cLevelScore   = rawScores['C레벨 Pool']?.score || 0;
  const strategyScore = rawScores['전략/BD']?.score || 0;
  const hrScore       = rawScores['인사/노무']?.score || 0;

  if (bestCat === '인사/노무') {
    // ⬇︎ 여기서 'hr' → 'hrScore'로 비교 (오타 수정)
    if (cLevelScore >= 5 && hrScore < cLevelScore * 0.9) return 'C레벨 Pool';
    if (strategyScore >= 4 && hrScore < strategyScore * 0.9) return '전략/BD';
  }

  return bestCat;
}

// ======== 경로 자동 탐지 (기존 구조 고정) ========
function buildPathCandidates(accessCode, aid) {
  return [
    ['artifacts', aid, 'public', 'data', accessCode],
  ];
}

// ===== IdealGame Utilities =====
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleProfilesByCategory(profiles, category, optionValue, size) {
  let pool = [];
  if (category === 'expertise') {
    pool = profiles.filter(p => (p.expertise || '').trim() === optionValue);
  } else if (category === 'priority') {
    pool = profiles.filter(p => (p.priority || '').trim() === optionValue);
  } else { // random
    pool = [...profiles];
  }
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, size);
}

// ===== IdealGame Page =====
function IdealGamePage({
  profiles,
  onUpdate, onDelete,
  accessCode, onSyncOne, onShowSimilar, onToggleStar,
  seedList = null,
  onClearSeed
}) {
  const computeTournamentSize = (n) => {
    if (n >= 64) return 64;
    if (n >= 32) return 32;
    if (n >= 16) return 16;
    if (n >= 8)  return 8;   // 안전장치: 검색 시드는 8/4/2도 허용
    if (n >= 4)  return 4;
    if (n >= 2)  return 2;
    return 0;
  };
  const [phase, setPhase] = React.useState('setup'); // setup | play | result
  const [category, setCategory] = React.useState('expertise'); // expertise | priority | random
  const expertiseOptions = React.useMemo(
    () => Array.from(new Set(profiles.map(p => p.expertise).filter(Boolean))),
    [profiles]
  );
  const [expertiseValue, setExpertiseValue] = React.useState(expertiseOptions[0] || '');
  const [priorityValue, setPriorityValue] = React.useState('3');
  const [size, setSize] = React.useState(16);

  const [currentRound, setCurrentRound] = React.useState(1);
  const [roundPairs, setRoundPairs] = React.useState([]); // [[p1,p2], [p3,p4], ...]
  const [winners, setWinners] = React.useState([]);       // 누적 선택된 승자 (한 라운드)
  const [champion, setChampion] = React.useState(null);

  // 라운드 페어링 만들기
  const makePairs = React.useCallback((list) => {
    const pairs = [];
    for (let i = 0; i < list.length; i += 2) {
      pairs.push([list[i], list[i + 1]]);
    }
    return pairs;
  }, []);

  // 시작
  const handleStart = () => {
    const optVal = category === 'expertise' ? expertiseValue : (category === 'priority' ? priorityValue : null);
    const chosen = sampleProfilesByCategory(profiles, category, optVal, size);
    if (chosen.length < size) {
      alert(`선택한 조건으로 ${size}명을 확보하지 못했습니다. (현재: ${chosen.length}명)`);
      return;
    }
    const pairs = makePairs(chosen);
    setCurrentRound(1);
    setRoundPairs(pairs);
    setWinners([]);
    setChampion(null);
    setPhase('play');
  };

  // 승자 선택
  const pickWinner = (winner) => {
    setWinners(prev => {
      const next = [...prev, winner];
      // 라운드 종료 → 다음 라운드로
      if (next.length === roundPairs.length) {
        if (next.length === 1) {
          setChampion(next[0]);
          setPhase('result');
          return next;
        }
        // 다음 라운드 세팅
        const nextPairs = makePairs(shuffleArray(next));
        setRoundPairs(nextPairs);
        setCurrentRound(r => r + 1);
        return [];
      }
      return next;
    });
  };

  // UI
  if (phase === 'setup') {
    if (Array.isArray(seedList) && seedList.length > 0) {
      const count = seedList.length;
      const tSize = computeTournamentSize(count);
      return (
        <section className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <h2 className="text-xl font-bold">이상형게임 시작</h2>
          <p className="text-sm text-gray-700">
            현재 검색 결과는 <b>{count}</b>명입니다.
          </p>
          {tSize === 0 ? (
            <div className="text-sm text-red-600">
              최소 2명 이상이어야 게임을 시작할 수 있어요. 검색 범위를 넓혀주세요.
            </div>
          ) : (
            <div className="text-sm text-gray-700">
              토너먼트는 <b>{tSize}</b>명 기준으로 진행됩니다.
            </div>
          )}
          <div className="flex gap-2">
            <Btn
              variant="primary"
              type="button"
              disabled={tSize === 0}
              onClick={()=>{
                const chosen = shuffleArray(seedList).slice(0, tSize);
                const pairs = makePairs(chosen);
                setCurrentRound(1);
                setRoundPairs(pairs);
                setWinners([]);
                setChampion(null);
                setPhase('play');
                onClearSeed?.();
              }}
            >
              네, 진행할게요
            </Btn>
            <Btn
              variant="subtle"
              type="button"
              onClick={()=>{
                onClearSeed?.();
                setPhase('setup'); // 그대로 설정 화면 유지
              }}
            >
              아니요
            </Btn>
          </div>
        </section>
      );
    }
    return (
      <section className="bg-white rounded-xl shadow-md p-6 space-y-4">
        <h2 className="text-xl font-bold">이상형게임 설정</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">카테고리</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={category}
              onChange={(e)=>setCategory(e.target.value)}
            >
              <option value="expertise">특정직군(전문영역)</option>
              <option value="priority">특정레벨(우선순위)</option>
              <option value="random">랜덤</option>
            </select>
          </div>

          {category === 'expertise' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">전문영역</label>
              <select
                className="w-full border rounded px-2 py-2 text-sm"
                value={expertiseValue}
                onChange={(e)=>setExpertiseValue(e.target.value)}
              >
                {expertiseOptions.length === 0 ? (
                  <option value="">없음</option>
                ) : expertiseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          )}

          {category === 'priority' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">우선순위</label>
              <select
                className="w-full border rounded px-2 py-2 text-sm"
                value={priorityValue}
                onChange={(e)=>setPriorityValue(e.target.value)}
              >
                <option value="3">3 (상)</option>
                <option value="2">2 (중)</option>
                <option value="1">1 (하)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">토너먼트 인원</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={size}
              onChange={(e)=>setSize(Number(e.target.value))}
            >
              <option value={16}>16명</option>
              <option value={32}>32명</option>
              <option value={64}>64명</option>
            </select>
          </div>
        </div>
        <div className="pt-2">
          <Btn variant="primary" onClick={handleStart}>시작하기</Btn>
        </div>
      </section>
    );
  }

  if (phase === 'play') {
    const currentIndex = winners.length; // 진행 중인 페어 인덱스
    const pair = roundPairs[currentIndex] || [];
    const [left, right] = pair;

    return (
      <section className="space-y-4">
        <div className="bg-white rounded-xl shadow-md p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">라운드 {currentRound} — {roundPairs.length - winners.length} 매치 남음</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {left && (
            <div className="bg-white rounded-xl shadow border p-4">
              <ProfileCard
                profile={left}
                onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
              />
              <div className="mt-3 flex justify-end">
                <Btn variant="success" onClick={()=>pickWinner(left)} type="button">이 프로필 선택</Btn>
              </div>
            </div>
          )}
          {right && (
            <div className="bg-white rounded-xl shadow border p-4">
              <ProfileCard
                profile={right}
                onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
              />
              <div className="mt-3 flex justify-end">
                <Btn variant="success" onClick={()=>pickWinner(right)} type="button">이 프로필 선택</Btn>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  // result
  return (
    <section className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">최종 우승자</h2>
      {champion ? (
        <ProfileCard
          profile={champion}
          onUpdate={onUpdate} onDelete={onDelete}
          accessCode={accessCode} onSyncOne={onSyncOne}
          onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
        />
      ) : (
        <div className="text-sm text-gray-500">결과 없음</div>
      )}
      <div className="mt-4">
        <Btn variant="subtle" onClick={() => { setPhase('setup'); setChampion(null); }}>다시 하기</Btn>
      </div>
    </section>
  );
}

// ============ UI 컴포넌트 ============
const ConfirmationModal = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
      <div className="text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500" aria-hidden />
        <h3 className="mt-4 text-lg font-medium text-gray-900">확인</h3>
        <div className="mt-2 text-sm text-gray-500"><p>{message}</p></div>
      </div>
      <div className="mt-6 flex justify-center gap-4">
        <Btn variant="subtle" onClick={onCancel}>취소</Btn>
        <Btn variant="danger" onClick={onConfirm}>확인</Btn>
      </div>
    </div>
  </div>
);

/* --- 로그인 화면 (배경 그라디언트 + 패턴 적용) --- */
const LoginScreen = ({ onLogin, onLogout, isAuthed }) => {
  const [codeInput, setCodeInput] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); if (codeInput.trim()) onLogin(codeInput.trim()); };
  return (
    <div className="relative min-h-screen p-4 flex items-center justify-center overflow-hidden">
      {/* 배경 그라디언트 */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-yellow-50 to-rose-50" />
      {/* 점 패턴 (자체 작성 SVG — 자유 사용) */}
      <svg
        className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="dotPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#FACC15" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#dotPattern)" />
      </svg>

      <div className="relative w-full max-w-md bg-white/90 backdrop-blur p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <Users className="mx-auto text-yellow-400 w-12 h-12" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold text-gray-800">프로필 대시보드 접속</h2>
          <p className="mt-2 text-sm text-gray-500">데이터를 불러올 접속 코드를 입력하세요.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden />
            <input
              type="text"
              placeholder="Access Code"
              className="w-full pl-10 pr-3 py-3 border rounded-lg"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
          </div>
          <div>
            <Btn as="button" type="submit" className="w-full" variant="primary">
              데이터 불러오기
            </Btn>
          </div>
        </form>

        {isAuthed && (
          <div className="mt-4 text-center">
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              title="다른 계정으로 로그인하기"
            >
              <LogOut size={16} aria-hidden /> 로그아웃 (다른 계정으로 로그인)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ProfileCard = ({
  profile, onUpdate, onDelete,
  accessCode, onSyncOne, onShowSimilar, onToggleStar,
  renderFooterLeft
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setEditedProfile(profile); }, [profile]);

  const priorityTone = {
    '3': 'danger',
    '2': 'warning',
    '1': 'success',
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: name === 'age' ? (value ? Number(value) : '') : value }));
  };

  const handleSave = async () => {
    const parsed = parseDateTimeFromRecord(editedProfile.meetingRecord);
    const eventDate = parsed ? new Date(parsed.date).toISOString() : null;
    const payload = {
      name: editedProfile.name || '',
      career: editedProfile.career || '',
      age: editedProfile.age ? Number(editedProfile.age) : null,
      otherInfo: editedProfile.otherInfo || '',
      expertise: editedProfile.expertise || '',
      priority: editedProfile.priority || '',
      meetingRecord: editedProfile.meetingRecord || '',
      eventDate,
    };
    try {
      await onUpdate(profile.id, payload);
      setIsEditing(false);
      (toast.success?.('프로필이 저장되었습니다.') ?? toast('프로필이 저장되었습니다.'));
    } catch (e) {
      console.error('프로필 저장 실패:', e);
      (toast.error?.('프로필 저장 중 오류가 발생했습니다.') ?? toast('프로필 저장 중 오류가 발생했습니다.'));
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => (toast.success?.('공유 링크가 복사되었습니다.') ?? toast('공유 링크가 복사되었습니다.')),
      () => (toast.error?.('링크 복사에 실패했습니다.') ?? toast('링크 복사에 실패했습니다.'))
    );
  };

  const handleSyncClick = async () => {
    if (!onSyncOne) return;
    setSyncing(true);
    try {
      await onSyncOne(profile);
    } finally {
      setSyncing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl shadow border p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <input name="name" value={editedProfile.name || ''} onChange={handleInputChange} placeholder="이름" className="w-full p-2 border rounded text-sm font-bold" />
            <input name="expertise" value={editedProfile.expertise || ''} onChange={handleInputChange} placeholder="전문영역" className="w-full p-2 border rounded text-sm" />
            <textarea name="career" value={editedProfile.career || ''} onChange={handleInputChange} placeholder="경력" className="w-full p-2 border rounded text-sm h-24" />
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input name="age" type="number" value={editedProfile.age || ''} onChange={handleInputChange} placeholder="나이" className="w-full p-2 border rounded text-sm" />
              <input name="priority" type="text" value={editedProfile.priority || ''} onChange={handleInputChange} placeholder="우선순위" className="w-full p-2 border rounded text-sm" />
            </div>
            <textarea name="otherInfo" value={editedProfile.otherInfo || ''} onChange={handleInputChange} placeholder="기타 정보" className="w-full p-2 border rounded text-sm h-20" />
            <textarea name="meetingRecord" value={editedProfile.meetingRecord || ''} onChange={handleInputChange} placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" className="w-full p-2 border rounded text-sm h-20" />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Btn variant="subtle" onClick={() => setIsEditing(false)}><X size={18} /> 취소</Btn>
          <Btn variant="success" onClick={handleSave}><Save size={18} /> 저장</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow border p-4 relative flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="font-bold text-yellow-600 text-lg">{profile.name}</h3>
          {profile.age && <span className="text-sm text-gray-500">{profile.age}세</span>}
          {profile.priority && (
            <Badge tone={priorityTone[profile.priority] || 'neutral'}>
              {profile.priority}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/*
            공통 버튼 스타일: 동일한 클릭 영역(32x32), 중앙정렬, 호버/포커스 일관
          */}
          {(() => {
            const ICON_BTN =
              "inline-flex items-center justify-center w-8 h-8 rounded-md " +
              "hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400/40";

            return (
              <>
                {/* ⭐ 주목 토글 (선택시 채움, 미선택시 테두리 느낌) */}
                 <button
                   type="button"
                   onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); onToggleStar?.(profile.id, !profile.starred); }}
                  title={profile.starred ? '주목 해제' : '주목'}
                  aria-pressed={!!profile.starred}
                  className={ICON_BTN}
                >
                  <Star
                    size={16}
                    className={profile.starred ? 'stroke-yellow-500 fill-yellow-400' : 'stroke-gray-400'}
                  />
                </button>

                {/* 🧩 유사 프로필 */}
                <button type="button"
                  title="유사 프로필"
                  onClick={() => onShowSimilar?.(profile)}
                  className={ICON_BTN}
                >
                  <Layers size={16} className="text-indigo-500" />
                </button>

                {/* 🔗 공유 링크 복사 */}
                <button type="button"
                  title="공유 링크 복사"
                  onClick={handleShare}
                  className={ICON_BTN}
                >
                  <Share2 size={16} className="text-teal-500" />
                </button>

                {/* ✏️ 수정 */}
                <button type="button"
                  title="수정"
                  onClick={() => setIsEditing(true)}
                  className={ICON_BTN}
                >
                  <Edit size={16} className="text-blue-500" />
                </button>

                {/* 🗑 삭제 (빨간 박스 X, 아이콘만 레드) */}
                <button type="button"
                  title="삭제"
                  onClick={() => onDelete(profile.id, profile.name)}
                  className={ICON_BTN}
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {profile.expertise && (
        <p className="text-sm font-semibold text-gray-600 mt-1">
          {profile.expertise}
          {profile.expertiseIsAuto && (
            <span className="ml-2 text-xs text-gray-400 align-baseline">(auto)</span>
          )}
        </p>
      )}
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{profile.career}</p>
      {profile.otherInfo && <p className="text-xs text-gray-500 pt-2 border-t whitespace-pre-wrap">{profile.otherInfo}</p>}
      {profile.meetingRecord && (
        <div className="pt-2 border-t">
          <p className="text-xs font-semibold text-gray-500">미팅기록:</p>
          <p className="text-xs text-gray-600 whitespace-pre-wrap">{profile.meetingRecord}</p>
        </div>
      )}

      {/* 하단 바 */}
      <div className="mt-2 pt-2 border-t flex items-center justify-between">
        <div className="flex items-center gap-2">
          {typeof renderFooterLeft === 'function' ? renderFooterLeft() : null}
        </div>
        <div className="flex items-center gap-3">
          {profile.gcalEventId ? (
            <a href={profile.gcalHtmlLink || '#'} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <ExternalLink size={14}/> Google Calendar
            </a>
          ) : <span className="text-xs text-gray-400">캘린더 미연동</span>}
          {/* ⬇ 글자 크기 축소(약 10px) */}
          <Btn
            variant="primary"
            onClick={handleSyncClick}
            disabled={syncing}
            className="!h-10 !px-5 text-[13px] leading-none"
          >
            {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-1" />}
            {profile.gcalEventId ? '캘린더 수정' : '캘린더 등록'}
          </Btn>
        </div>
      </div>
    </div>
  );
};

const AlertsPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const tomorrowStart = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() + 1); return d; }, [todayStart]);
  const threeDaysLater = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() + 4); return d; }, [todayStart]);

  const todayProfiles = useMemo(() => (
    profiles.filter(p => p.eventDate && new Date(p.eventDate) >= todayStart && new Date(p.eventDate) < tomorrowStart)
            .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate))
  ), [profiles, todayStart, tomorrowStart]);

  const upcomingProfiles = useMemo(() => (
    profiles.filter(p => p.eventDate && new Date(p.eventDate) > now && new Date(p.eventDate) < threeDaysLater)
            .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate))
  ), [profiles, now, threeDaysLater]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-red-500" aria-hidden />오늘의 일정</h2>
        {todayProfiles.length === 0 ? <div className="text-sm text-gray-500">없음</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {todayProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center"><Zap className="mr-2 text-blue-500" aria-hidden />다가오는 일정</h2>
        {upcomingProfiles.length === 0 ? <div className="text-sm text-gray-500">없음</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingProfiles.map(p => (
              <ProfileCard key={p.id} profile={p} onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne} onShowSimilar={onShowSimilar} onToggleStar={onToggleStar} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const SearchPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, searchTerm, setSearchTerm, onStartIdealWithList }) => {

  const advancedResults = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const orConditions = term.split(/\s+or\s+/i);

    return profiles.filter(p => orConditions.some(cond => {
      const andKeywords = cond.split(/\s+and\s+/i).filter(Boolean);

      return andKeywords.every(keyword => {
        const map = { '이름':'name','경력':'career','나이':'age','전문영역':'expertise','기타':'otherInfo','우선순위':'priority' };
        const f = keyword.match(/^(이름|경력|나이|전문영역|기타|우선순위):(.+)$/);
        if (f) {
          const field = map[f[1]];
          const val = f[2].toLowerCase();
          const v = p[field] ? String(p[field]).toLowerCase() : '';
          return v.includes(val);
        }
        const ageG = keyword.match(/^(\d{1,2})대$/);
        if (ageG) {
          const d = parseInt(ageG[1],10);
          if (d>=10) { const min=d, max=d+9; return p.age && p.age>=min && p.age<=max; }
        }
        const txt = [p.name, p.career, p.expertise, p.otherInfo, p.age ? `${p.age}세` : ''].join(' ').toLowerCase();
        return txt.includes(keyword.toLowerCase());
      });
    }));
  }, [searchTerm, profiles]);

  const parsedNL = useMemo(() => parseNaturalQuery(searchTerm), [searchTerm]);
  const hasNL = useMemo(() => !!parsedNL && !parsedNL.__isEmpty, [parsedNL]);

  const nlResults = useMemo(() => {
    if (!hasNL) return [];
    try {
      return profiles.filter(p => matchProfileWithNL(p, parsedNL));
    } catch {
      return [];
    }
  }, [profiles, parsedNL, hasNL]);

  const looksLikeAdvanced = useMemo(() => /:|\sAND\s|\sOR\s/i.test(searchTerm), [searchTerm]);
  const visible = useMemo(() => {
    if (!searchTerm.trim()) return [];
    if (looksLikeAdvanced) return advancedResults;
    if (hasNL && nlResults.length) return nlResults;
    return advancedResults;
  }, [searchTerm, looksLikeAdvanced, hasNL, nlResults, advancedResults]);

  return (
    <div>
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="text"
          placeholder="자연어로도 검색 가능: 예) 네이버 경력 백엔드 30대 리더"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-4 pl-12 border rounded-xl shadow-sm"
        />
      </div>

      <div className="mt-3 flex justify-end">
        <Btn
          size="sm"
          variant="subtle"
          onClick={() => exportProfilesToXLSX(`profiles_${accessCode}_search`, visible)}
          disabled={!searchTerm.trim() || !visible.length}
        >
          <Download className="w-4 h-4 mr-1" /> 검색 결과 엑셀
        </Btn>
      </div>
      {searchTerm.trim() && (
        <>
          <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            현재 검색 결과: <b>{visible.length}</b>명
          </div>
          {visible.length > 1 && (
            <Btn
              variant="primary"
              onClick={()=> onStartIdealWithList?.(visible)}
              type="button"
            >
              이 검색결과로 이상형게임 시작
            </Btn>
          )}
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.length ? (
            visible.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accessCode={accessCode}
                onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar}
                onToggleStar={onToggleStar}
              />
            ))
          ) : (
            <div className="text-sm text-gray-500">검색 결과가 없습니다.</div>
          )}
          </div>
        </>
      )}
    </div>
  );
};

const StarredPage = ({ profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const starred = useMemo(() => profiles.filter(p => p.starred), [profiles]);
  const expertiseOptions = useMemo(() => Array.from(new Set(starred.map(p => p.expertise).filter(Boolean))), [starred]);
  const [selectedExp, setSelectedExp] = useState('전체');
  const visible = useMemo(() => selectedExp === '전체' ? starred : starred.filter(p => p.expertise === selectedExp), [starred, selectedExp]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-600">전문영역 필터:</label>
        <select value={selectedExp} onChange={(e)=>setSelectedExp(e.target.value)} className="border rounded-md text-sm px-2 py-1">
          <option value="전체">전체</option>
          {expertiseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.length ? visible.map(p => (
          <ProfileCard key={p.id} profile={p}
            onUpdate={onUpdate} onDelete={onDelete}
            accessCode={accessCode} onSyncOne={onSyncOne}
            onShowSimilar={onShowSimilar}
            onToggleStar={(id, val) => onToggleStar(id, val)}
          />
        )) : <div className="text-sm text-gray-500">표시할 프로필이 없습니다.</div>}
      </div>
    </div>
  );
};

const FunctionsPage = ({ activeSub, setActiveSub, profiles, onUpdate, onDelete, accessCode, onSyncOne, onShowSimilar, onToggleStar, activeFilter, setActiveFilter }) => {
  const now = useMemo(() => new Date(), []);
  const threeMonthsAgo = useMemo(() => { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }, [now]);

  const recommended = useMemo(() => {
    const scoreOf = (p) => {
      const last = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const days = last ? Math.max(1, Math.floor((now - last) / (1000*60*60*24))) : 180;
      let score = Math.min(100, Math.round((days / 90) * 60));
      if (p.priority === '3') score += 20;
      const kw = TARGET_KEYWORDS.filter(k => (p.career||'').includes(k)).length;
      score += Math.min(kw * 5, 15);
      if (p.expertise) score += 5;
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      if (snoozeUntil && snoozeUntil > now) score = -1;
      return score;
    };
    return profiles
      .map(p => ({ p, s: scoreOf(p) }))
      .filter(x => x.s >= 40)
      .sort((a,b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.p);
  }, [profiles, now]);

  const longTerm = useMemo(() => (
    profiles.filter(p => {
      const last = p.lastReviewedDate ? new Date(p.lastReviewedDate) : (p.eventDate ? new Date(p.eventDate) : null);
      const snoozeUntil = p.snoozeUntil ? new Date(p.snoozeUntil) : null;
      return last && last < threeMonthsAgo && (!snoozeUntil || snoozeUntil < now);
    }).sort((a,b) => (new Date(a.lastReviewedDate || a.eventDate||0)) - (new Date(b.lastReviewedDate || b.eventDate||0)))
  ), [profiles, threeMonthsAgo, now]);

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

  const priorityData = useMemo(() => {
    const p = { '3 (상)': 0, '2 (중)': 0, '1 (하)': 0 };
    profiles.forEach(x => { if (x.priority === '3') p['3 (상)']++; else if (x.priority === '2') p['2 (중)']++; else if (x.priority === '1') p['1 (하)']++; });
    return Object.entries(p).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [profiles]);

  const companyData = useMemo(() => TARGET_KEYWORDS.map(k => ({ name: k, count: profiles.filter(p => p.career?.includes(k)).length })), [profiles]);

  const expertiseData = useMemo(() => {
    const c = {}; profiles.forEach(p => { if (p.expertise) c[p.expertise] = (c[p.expertise] || 0) + 1; });
    return Object.entries(c).map(([name, count]) => ({ name, count }));
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    if (!activeFilter.type) return [];
    switch (activeFilter.type) {
      case 'age': {
        const g = activeFilter.value;
        return profiles.filter(p => p.age && (
          (g==='10대' && p.age<20) ||
          (g==='20대' && p.age>=20 && p.age<30) ||
          (g==='30대' && p.age>=30 && p.age<40) ||
          (g==='40대' && p.age>=40 && p.age<50) ||
          (g==='50대 이상' && p.age>=50)
        ));
      }
      case 'priority': {
        const v = activeFilter.value.split(' ')[0]; return profiles.filter(p => p.priority === v);
      }
      case 'company': return profiles.filter(p => p.career?.includes(activeFilter.value));
      case 'expertise': return profiles.filter(p => p.expertise === activeFilter.value);
      default: return [];
    }
  }, [profiles, activeFilter]);

  const handleConfirm = async (p) => {
    await onUpdate(p.id, { lastReviewedDate: new Date().toISOString(), snoozeUntil: null });
    (toast.success?.('확인 처리되었습니다.') ?? toast('확인 처리되었습니다.'));
  };
  const handleSnooze3M = async (p) => {
    const dt = new Date(); dt.setMonth(dt.getMonth() + 3);
    await onUpdate(p.id, { snoozeUntil: dt.toISOString() });
    (toast.success?.('3개월 후 다시 알림으로 설정했습니다.') ?? toast('3개월 후 다시 알림으로 설정했습니다.'));
  };

  return (
    <div className="space-y-8">
      {activeSub === 'rec' && (
        <section className="bg-white rounded-xl shadow-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800">추천 : 다시 들여다볼 프로필</h2>
              <div className="relative group">
                <AlertCircle className="w-4 h-4 text-yellow-600 cursor-default" aria-hidden />
                <div className="absolute z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-md px-3 py-2 w-72 -left-2 mt-2 shadow-lg">
                  최근 팔로업 시점/스누즈/우선순위/IT 키워드 등을 반영해 점수를 계산해요.
                  <br/>팔로업 ‘확인’을 누르면 목록에서 제외되고, 보통 3개월 후 조건 충족 시 다시 나타납니다.
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500">카드에서 ‘확인’/‘스누즈’ 가능</div>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recommended.length === 0 ? (
              <div className="text-gray-500 p-4 text-sm">없음</div>
            ) : recommended.map(p => (
              <ProfileCard key={p.id}
                profile={p}
                onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
                renderFooterLeft={() => (
                  <div className="flex items-center gap-2">
                    <Btn size="xs" variant="subtle" onClick={() => handleConfirm(p)}>확인</Btn>
                    <Btn size="xs" variant="warning" onClick={() => handleSnooze3M(p)}>3개월 후 다시</Btn>
                  </div>
                )}
              />
            ))}
          </div>
        </section>
      )}

      {activeSub === 'long' && (
        <section className="bg-white rounded-xl shadow-md p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold flex items-center">
              <BellRing className="mr-2 text-orange-500" aria-hidden />장기 미접촉 알림 (3개월 이상)
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {longTerm.length === 0 ? (
              <div className="text-gray-500 p-4 text-sm">없음</div>
            ) : longTerm.map(p => (
              <ProfileCard key={p.id}
                profile={p}
                onUpdate={onUpdate} onDelete={onDelete}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
                renderFooterLeft={() => (
                  <div className="flex items-center gap-2">
                    <Btn size="xs" variant="subtle" onClick={() => handleConfirm(p)}>확인</Btn>
                    <Btn size="xs" variant="warning" onClick={() => handleSnooze3M(p)}>3개월 후 다시</Btn>
                  </div>
                )}
              />
            ))}
          </div>
        </section>
      )}

      {activeSub === 'graphs' && (
        <>
          <section className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">우선순위별 분포</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  <radialGradient id="gp-0"><stop offset="0%" stopColor="#FF4444" stopOpacity={0.7} /><stop offset="100%" stopColor="#FF4444" stopOpacity={1} /></radialGradient>
                  <radialGradient id="gp-1"><stop offset="0%" stopColor="#FFBB28" stopOpacity={0.7} /><stop offset="100%" stopColor="#FFBB28" stopOpacity={1} /></radialGradient>
                  <radialGradient id="gp-2"><stop offset="0%" stopColor="#00C49F" stopOpacity={0.7} /><stop offset="100%" stopColor="#00C49F" stopOpacity={1} /></radialGradient>
                </defs>
                <Pie data={priorityData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                  {priorityData.map((entry, i) => (
                    <Cell key={`cell-pr-${i}`} fill={`url(#gp-${i})`} stroke="#fff"
                      onClick={() => setActiveFilter({ type:'priority', value: entry.name })} style={{ cursor: 'pointer' }}/>
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v}명`} /><Legend />
              </PieChart>
            </ResponsiveContainer>
            {activeFilter.type === 'priority' && (
              <FilterResultSection
                title={`"${activeFilter.value}" 필터 결과`}
                profiles={profiles.filter(p => p.priority === activeFilter.value.split(' ')[0])}
                onUpdate={onUpdate} onDelete={onDelete}
                onClear={() => setActiveFilter({ type: null, value: null })}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
              />
            )}
          </section>

          <section className="bg-white p-6 rounded-xl shadow-md mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">세대별 분포</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <radialGradient key={`g-age-${i}`} id={`g-age-${i}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                      <stop offset="0%" stopColor={c} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={c} stopOpacity={1} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                  {ageData.map((entry, i) => (
                    <Cell key={`cell-age-${i}`} fill={`url(#g-age-${i})`} stroke="#fff"
                      onClick={() => setActiveFilter({ type:'age', value: entry.name })} style={{ cursor: 'pointer' }}/>
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v}명`} /><Legend />
              </PieChart>
            </ResponsiveContainer>
            {activeFilter.type === 'age' && (
              <FilterResultSection
                title={`"${activeFilter.value}" 필터 결과`}
                profiles={filteredProfiles}
                onUpdate={onUpdate} onDelete={onDelete}
                onClear={() => setActiveFilter({ type: null, value: null })}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
              />
            )}
          </section>

          <section className="bg-white p-6 rounded-xl shadow-md mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">전문영역 분포</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={expertiseData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                <defs>
                  <linearGradient id="gradient-expertise" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C49F" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={1}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false}/><Tooltip formatter={(v)=>`${v}명`} /><Legend />
                <Bar dataKey="count" fill="url(#gradient-expertise)">
                  {expertiseData.map((entry, i) => (
                    <Cell key={`ex-${i}`} onClick={() => setActiveFilter({ type:'expertise', value: entry.name })} style={{ cursor: 'pointer' }} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {activeFilter.type === 'expertise' && (
              <FilterResultSection
                title={`"${activeFilter.value}" 전문영역 필터 결과`}
                profiles={profiles.filter(p => p.expertise === activeFilter.value)}
                onUpdate={onUpdate} onDelete={onDelete}
                onClear={() => setActiveFilter({ type: null, value: null })}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
              />
            )}
          </section>

          <section className="bg-white p-6 rounded-xl shadow-md mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">IT 기업 경력 분포</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={companyData} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                <defs>
                  <linearGradient id="gradient-company" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFBB28" stopOpacity={0.8}/><stop offset="95%" stopColor="#FF8042" stopOpacity={1}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false}/><Tooltip formatter={(v)=>`${v}명`} /><Legend />
                <Bar dataKey="count" fill="url(#gradient-company)">
                  {companyData.map((entry, i) => (
                    <Cell key={`co-${i}`} onClick={() => setActiveFilter({ type:'company', value: entry.name })} style={{ cursor: 'pointer' }} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {activeFilter.type === 'company' && (
              <FilterResultSection
                title={`"${activeFilter.value}" 필터 결과`}
                profiles={profiles.filter(p => p.career?.includes(activeFilter.value))}
                onUpdate={onUpdate} onDelete={onDelete}
                onClear={() => setActiveFilter({ type: null, value: null })}
                accessCode={accessCode} onSyncOne={onSyncOne}
                onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
};

const FilterResultSection = ({ title, profiles, onUpdate, onDelete, onClear, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => (
  <section className="bg-white p-6 rounded-xl shadow-md animate-fade-in mt-4">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      <div className="flex items-center gap-2">
        <Btn
          size="xs"
          variant="subtle"
          onClick={() => exportProfilesToXLSX(`profiles_${accessCode}_filter`, profiles)}
          disabled={!profiles || !profiles.length}
        >
          <Download className="w-3 h-3 mr-1" /> 엑셀로 내보내기
        </Btn>
        <Btn size="xs" variant="subtle" onClick={onClear}>필터 해제</Btn>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {profiles.length > 0 ? (
        profiles.map((profile) => (
          <div key={profile.id}>
            <ProfileCard
              profile={profile}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accessCode={accessCode}
              onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar}
              onToggleStar={onToggleStar}
            />
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-center col-span-full">해당 조건의 프로필이 없습니다.</p>
      )}
    </div>
  </section>
);

/* ===== 엑셀 내보내기 유틸 (하드닝 버전) =====
   - 누락 필드/잘못된 타입에도 안전
   - A:이름, B:경력, E:추정 나이, F:전문영역, H:우선순위, J:미팅기록, L:추가정보
   - 사이 컬럼(C, D, G, I, K)은 빈 칸으로 유지
   - window.XLSX 및 toast(프로젝트에 이미 존재) 사용
*/
function profilesToAoA(profiles) {
  const header = [
    '이름',      // A
    '경력',      // B
    '',          // C (빈 칸)
    '',          // D (빈 칸)
    '추정 나이', // E
    '전문영역',  // F
    '',          // G (빈 칸)
    '우선순위',  // H
    '',          // I (빈 칸)
    '미팅기록',  // J
    '',          // K (빈 칸)
    '추가정보',  // L
  ];
  const rows = [header];

  const safeText = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    try { return String(v); } catch { return ''; }
  };
  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : '';
  };

  (Array.isArray(profiles) ? profiles : []).forEach((pRaw) => {
    const p = pRaw || {};
    const expertise =
      p.expertise ? `${safeText(p.expertise)}${p.expertiseIsAuto ? ' (auto)' : ''}` : '';
    const row = [
      safeText(p.name),          // A
      safeText(p.career),        // B
      '',                        // C
      '',                        // D
      p.age === '' || p.age == null ? '' : safeNum(p.age), // E
      expertise,                 // F
      '',                        // G
      safeText(p.priority),      // H
      '',                        // I
      safeText(p.meetingRecord), // J
      '',                        // K
      safeText(p.otherInfo),     // L
    ];

    // 항상 헤더 길이와 동일하게 보정
    while (row.length < header.length) row.push('');
    if (row.length > header.length) row.length = header.length;

    rows.push(row);
  });

  return rows;
}

function exportProfilesToXLSX(fileBaseName, profiles) {
  const list = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  if (!list.length) {
    (toast?.info?.('내보낼 데이터가 없습니다.') ?? toast('내보낼 데이터가 없습니다.'));
    return;
  }
  if (!window.XLSX) {
    (toast?.error?.('엑셀 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.') ?? toast('엑셀 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.'));
    return;
  }

  try {
    const aoa = profilesToAoA(list);
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);

    // 열 너비(가독성)
    ws['!cols'] = [
      { wch: 16 }, // 이름
      { wch: 60 }, // 경력
      { wch: 2 },  // C 빈칸
      { wch: 2 },  // D 빈칸
      { wch: 10 }, // 추정 나이
      { wch: 18 }, // 전문영역
      { wch: 2 },  // G 빈칸
      { wch: 10 }, // 우선순위
      { wch: 2 },  // I 빈칸
      { wch: 28 }, // 미팅기록
      { wch: 2 },  // K 빈칸
      { wch: 40 }, // 추가정보
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'profiles');

    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const fileName = `${fileBaseName}_${y}${m}${d}_${hh}${mm}.xlsx`;

    window.XLSX.writeFile(wb, fileName);
    (toast?.success?.('엑셀로 내보냈습니다.') ?? toast('엑셀로 내보냈습니다.'));
  } catch (e) {
    console.error('엑셀 내보내기 오류:', e);
    (toast?.error?.('엑셀 내보내기 중 오류가 발생했습니다.') ?? toast('엑셀 내보내기 중 오류가 발생했습니다.'));
  }
}
/* ===== /엑셀 내보내기 유틸 ===== */
const ExcelUploader = ({ onBulkAdd }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');

  // 헤더 정규화: 소문자화 + 공백/특수문자 제거
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()\[\]{}\-_/\\.:,*'"`|!?@#%^&+~]/g, '');

  // 헤더 매칭 사전
  const HEADERS = {
    name: new Set(['이름', 'name']),
    career: new Set(['경력', '경력요약', 'career', 'careersummary']),
    age: new Set(['나이', '추정나이', 'age', 'estimatedage']),
    expertise: new Set(['전문영역', '전문분야', 'expertise', 'specialty']),
    priority: new Set(['우선순위', 'priority']),
    meeting: new Set(['미팅기록', '미팅히스토리', 'meetinghistory', 'meetingrecord']),
    // 기타정보로 통합할 후보들 (여러 열 가능)
    otherGroup: new Set([
      '추가정보',
      '경력상세내용',
      '비공식레퍼런스',
      '현황체크',
      '기타',
      '메모',
      'notes',
      'detail',
    ]),
  };

  const detectColumns = (headerRow) => {
    const map = {
      name: null,
      career: null,
      age: null,
      expertise: null,
      priority: null,
      meeting: null,
      others: [], // 인덱스 배열
      rawHeaders: headerRow, // 나중에 라벨 표시에 사용
    };
    headerRow.forEach((h, idx) => {
      const n = norm(h);
      if (HEADERS.name.has(n) && map.name == null) map.name = idx;
      else if (HEADERS.career.has(n) && map.career == null) map.career = idx;
      else if (HEADERS.age.has(n) && map.age == null) map.age = idx;
      else if (HEADERS.expertise.has(n) && map.expertise == null) map.expertise = idx;
      else if (HEADERS.priority.has(n) && map.priority == null) map.priority = idx;
      else if (HEADERS.meeting.has(n) && map.meeting == null) map.meeting = idx;
      else if (HEADERS.otherGroup.has(n)) map.others.push(idx);
    });
    return map;
  };

  const val = (row, idx) => (idx == null ? '' : (row[idx] ?? ''));

  const handleUpload = async () => {
    if (!file) { setMessage('파일을 먼저 선택해주세요.'); return; }
    if (!window.XLSX) { (toast?.info?.('로딩 중입니다. 잠시 후 다시.') ?? toast('로딩 중입니다. 잠시 후 다시.')); return; }
    if (!window.XLSX) { setMessage('엑셀 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.'); return; }

    setIsUploading(true);
    setMessage('파일을 읽는 중...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = window.XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rows || rows.length < 2) {
          setMessage('엑셀 파일에 데이터가 없습니다. (1행: 헤더, 2행부터 데이터)');
          setIsUploading(false);
          return;
        }

        // 1) 헤더 자동 추적
        const header = rows[0].map((x) => (x ?? ''));
        const col = detectColumns(header);

        // 2) 데이터 행 파싱
        const newProfiles = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i] || [];

          const name = String(val(r, col.name) || '').trim();
          const career = String(val(r, col.career) || '').trim();
          const ageRaw = String(val(r, col.age) ?? '').trim();
          let expertise = String(val(r, col.expertise) || '').trim();
          let expertiseIsAuto = false;
          if (!expertise) {
            const detected = detectExpertiseFromCareer(career);
            if (detected) { expertise = detected; expertiseIsAuto = true; }
          }
          const priority = String(val(r, col.priority) || '').trim();
          const meetingRecord = String(val(r, col.meeting) || '').trim();

          // 기타정보 통합: "헤더명: 값" 형태로 줄바꿈 결합
          const others = (col.others || [])
            .map((idx) => {
              const h = String(header[idx] ?? '').trim();
              const v = String(val(r, idx) ?? '').trim();
              return v ? `${h}: ${v}` : '';
            })
            .filter(Boolean)
            .join('\n');

          // 숫자 변환 (인식 실패 시 null)
          let age = null;
          if (ageRaw) {
            const n = Number(ageRaw);
            if (!Number.isNaN(n) && Number.isFinite(n)) age = n;
          }

          // 미팅기록 → eventDate 추출(인식 실패는 null로)
          const parsed = parseDateTimeFromRecord(meetingRecord);
          const eventDate = parsed ? parsed.date.toISOString() : null;

          // 최소 생성 조건:
          //  - 이름은 반드시 필요 (덮어쓰기 키)
          //  - 그 외 항목은 비어 있어도 OK (요청사항 반영)
          if (!name) continue;

          newProfiles.push({
            name,
            career, // 없으면 빈문자열
            age, // null 허용
            otherInfo: others || '', // 통합
            expertise,
            expertiseIsAuto,
            priority,
            meetingRecord,
            eventDate,
          });
        }

        if (newProfiles.length === 0) {
          setMessage('추가/업데이트할 유효한 행이 없습니다. (이름이 비어 있는 행은 건너뜁니다)');
          setIsUploading(false);
          return;
        }

        // 3) 업로드 (기존 정책 유지: 이름이 같으면 덮어쓰기)
        const msg = await onBulkAdd(newProfiles);
        setMessage(msg);
        setFile(null);
        (toast.success?.(msg) ?? toast(msg));
      } catch (err) {
        console.error('엑셀 처리 오류:', err);
        setMessage('엑셀 파일을 처리하는 중 오류가 발생했습니다.');
        (toast.error?.('엑셀 처리 중 오류가 발생했습니다.') ?? toast('엑셀 처리 중 오류가 발생했습니다.'));
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center">
        <UploadCloud className="mr-2 text-yellow-500" aria-hidden/>엑셀로 일괄 등록
      </h2>

      <div className="space-y-4">
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md border">
          <p className="font-semibold">엑셀 양식 안내 (헤더 자동추적)</p>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>1행은 헤더입니다. 열 위치와 상관없이 아래 단어를 인식합니다.</li>
            <li><b>이름</b> → 이름</li>
            <li><b>경력</b> 또는 <b>경력 요약</b> → 경력</li>
            <li><b>나이</b> 또는 <b>추정 나이</b> → 나이</li>
            <li><b>전문영역</b> → 전문영역</li>
            <li><b>우선순위</b> → 우선순위</li>
            <li><b>미팅 히스토리</b> → 미팅기록</li>
            <li><b>추가 정보 / 경력 상세 내용 / 비공식 레퍼런스 / 현황체크 / 기타 / 메모</b> → 기타정보로 통합 저장</li>
            <li>인식되지 않은 헤더/열은 무시됩니다. (오류 없이 건너뜀)</li>
            <li>최소 요건: <b>이름</b>이 비어 있으면 해당 행은 건너뜁니다.</li>
            <li>동명이인이면 기존 프로필을 <b>덮어쓰기</b>합니다.</li>
          </ul>
        </div>

        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={(e)=>{ setFile(e.target.files[0]); setMessage(''); }}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0 file:text-sm file:font-semibold
                     file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
        />

        <Btn onClick={handleUpload} disabled={!file || isUploading || !window.XLSX} className="w-full" variant="primary">
          {isUploading ? <Loader2 className="animate-spin" /> : (!window.XLSX ? '로딩 중…' : '업로드 및 추가')}
        </Btn>

        {message && <p className="text-sm text-center text-gray-600 whitespace-pre-wrap">{message}</p>}
      </div>
    </section>
  );
};

// 관리 페이지
const ManagePage = ({ profiles, onUpdate, onDelete, onAddOne, handleBulkAdd, accessCode, onSyncOne, onShowSimilar, onToggleStar }) => {
  const [newName, setNewName] = useState('');
  const [newCareer, setNewCareer] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newOtherInfo, setNewOtherInfo] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newMeetingRecord, setNewMeetingRecord] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;
  const sorted = useMemo(() => [...profiles].sort((a,b)=>a.name.localeCompare(b.name)), [profiles]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageItems = useMemo(() => {
    const end = currentPage * PER_PAGE, start = end - PER_PAGE;
    return sorted.slice(start,end);
  }, [sorted, currentPage]);
  const pages = useMemo(() => Array.from({length: totalPages}, (_,i)=>i+1), [totalPages]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newCareer.trim()) return;
    const autoExp = (!newExpertise || !newExpertise.trim())
      ? detectExpertiseFromCareer(newCareer)
      : null;
    await onAddOne({
      name: newName,
      career: newCareer,
      age: newAge ? Number(newAge) : null,
      otherInfo: newOtherInfo || '',
      expertise: autoExp ? autoExp : (newExpertise || ''),
      expertiseIsAuto: !!autoExp,
      priority: newPriority || '',
      meetingRecord: newMeetingRecord || ''
    });
    setNewName(''); setNewCareer(''); setNewAge(''); setNewOtherInfo(''); setNewExpertise(''); setNewPriority(''); setNewMeetingRecord('');
    (toast.success?.('프로필이 추가되었습니다.') ?? toast('프로필이 추가되었습니다.'));
  };

  return (
    <div className="space-y-8">
      <section className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4 flex items-center"><UserPlus className="mr-2 text-yellow-500" aria-hidden/>새 프로필 추가</h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded" />
            <input type="number" placeholder="나이" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-full p-2 border rounded" />
            <input type="text" placeholder="우선순위" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <input type="text" placeholder="전문영역" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} className="w-full p-2 border rounded" />
          <textarea placeholder="경력" value={newCareer} onChange={e => setNewCareer(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="기타 정보" value={newOtherInfo} onChange={e => setNewOtherInfo(e.target.value)} className="w-full p-2 border rounded h-24" />
          <textarea placeholder="미팅기록 (예: (25.08.14) 오후 7:00)" value={newMeetingRecord} onChange={e => setNewMeetingRecord(e.target.value)} className="w-full p-2 border rounded h-24" />
          <div className="flex justify-end">
            <Btn as="button" type="submit" variant="primary">추가하기</Btn>
          </div>
        </form>
      </section>

      <ExcelUploader onBulkAdd={handleBulkAdd} />

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 프로필 목록</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pageItems.map(p => (
            <ProfileCard key={p.id}
              profile={p}
              onUpdate={onUpdate} onDelete={onDelete}
              accessCode={accessCode} onSyncOne={onSyncOne}
              onShowSimilar={onShowSimilar} onToggleStar={onToggleStar}
            />
          ))}
        </div>

        <nav className="mt-6 flex items-center justify-center gap-1">
          <button onClick={()=>setCurrentPage(1)} disabled={currentPage===1}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">≪</button>
          <button onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={currentPage===1}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">〈</button>

          <div className="flex items-center gap-1 overflow-x-auto max-w-[70vw]">
            {pages.map(n => (
              <button key={n} onClick={()=>setCurrentPage(n)}
                className={`px-3 py-1 rounded-md border text-sm ${currentPage===n?'bg-yellow-400 text-white border-yellow-400':'bg-white hover:bg-gray-50'}`}>
                {n}
              </button>
            ))}
          </div>

          <button onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={currentPage===totalPages}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">〉</button>
          <button onClick={()=>setCurrentPage(totalPages)} disabled={currentPage===totalPages}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40">≫</button>
        </nav>
      </section>
    </div>
  );
};

/* === 관리자 버튼 (개선본) === */
function AdminOnlyButton({ activeMain, setActiveMain, setFunctionsOpen }) {
  const { isAdmin, isLoading } = useIsAdmin();
  if (isLoading || !isAdmin) return null;
  return (
    <button
      onClick={() => { setActiveMain('admin'); setFunctionsOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
        activeMain === 'admin' ? 'bg-yellow-400 text-white' : 'hover:bg-gray-100'
      }`}
    >
      <Users size={16}/> 사용자 관리
    </button>
  );
}

// ===== MainContent (App 바깥으로 호이스팅) =====
function MainContent({
   activeMain, functionsSub, setFunctionsSub,
   profilesWithHelpers, handleUpdate, handleDeleteRequest,
   accessCode, handleSyncOneToCalendar, openSimilarModal,
   setActiveMain, setFunctionsOpen,
   isAdmin, adminProbe,
   handleAddOne, handleBulkAdd,
   openProfileDetailById,
   // 검색/필터 글로벌 상태
   searchTerm, setSearchTerm,
   activeFilter, setActiveFilter,
   idealSeed, setIdealSeed
 }) {
   if (activeMain === 'alerts') {
     return (
       <AlertsPage
         profiles={profilesWithHelpers}
         onUpdate={handleUpdate} onDelete={handleDeleteRequest}
         accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
         onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
       />
     );
   }
   if (activeMain === 'search') {
     return (
       <SearchPage
         profiles={profilesWithHelpers}
         onUpdate={handleUpdate} onDelete={handleDeleteRequest}
         accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
         onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
         searchTerm={searchTerm}
         setSearchTerm={setSearchTerm}
         onStartIdealWithList={(list)=>{ setIdealSeed(list); setActiveMain('ideal'); }}
       />
     );
   }
   if (activeMain === 'starred') {
     return (
       <StarredPage
         profiles={profilesWithHelpers}
         onUpdate={handleUpdate} onDelete={handleDeleteRequest}
         accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
         onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
       />
     );
   }
   if (activeMain === 'meetings') {
     return <MeetingsPage profiles={profilesWithHelpers} onOpenDetail={openProfileDetailById} />;
   }
   if (activeMain === 'manage') {
     return (
       <ManagePage
         profiles={profilesWithHelpers}
         onUpdate={handleUpdate} onDelete={handleDeleteRequest}
         onAddOne={handleAddOne}
         handleBulkAdd={handleBulkAdd}
         accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
         onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
       />
     );
   }
   if (activeMain === 'admin') {
     const adminStatus = adminProbe || {};
     if (adminStatus.isLoading) return <div>로딩 중...</div>;
     if (adminStatus.err) return <div>권한 확인 에러: {adminStatus.err}</div>;
     if (!isAdmin) return <div className="text-sm text-red-600">권한이 없습니다. (App gate)</div>;
     return (
       <UserAdmin
         isAdminOverride={isAdmin}
         probe={{
           from: 'App',
           ts: new Date().toISOString(),
           ...adminStatus,
         }}
       />
     );
   }
   if (activeMain === 'ideal') {
     return (
       <IdealGamePage
         profiles={profilesWithHelpers}
         onUpdate={handleUpdate} onDelete={handleDeleteRequest}
         accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
         onShowSimilar={openSimilarModal}
         onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
         seedList={idealSeed}
         onClearSeed={()=>setIdealSeed(null)}
       />
     );
   }

   // functions (graphs/rec/long)
   return (
     <FunctionsPage
       activeSub={functionsSub} setActiveSub={setFunctionsSub}
       profiles={profilesWithHelpers}
       onUpdate={handleUpdate} onDelete={handleDeleteRequest}
       accessCode={accessCode} onSyncOne={handleSyncOneToCalendar}
       onShowSimilar={openSimilarModal} onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
       activeFilter={activeFilter} setActiveFilter={setActiveFilter}
     />
   );
 }

// ============ App ============
export default function App() {
  // --- 상태들 ---
  const [searchTermGlobal, setSearchTermGlobal] = React.useState('');     // 검색어 글로벌
  const [functionsActiveFilter, setFunctionsActiveFilter] = React.useState({ type:null, value:null }); // 그래프 필터 글로벌
  const [accessCode, setAccessCode] = useState(typeof window !== 'undefined' ? (localStorage.getItem('profileDbAccessCode') || null) : null);
  const [profiles, setProfiles]     = useState([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMain, setActiveMain]   = useState('alerts');
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [functionsSub, setFunctionsSub] = useState('rec');
  const [idealSeed, setIdealSeed] = useState(null); // 검색결과로 이상형게임 시드

  const [showDeleteConfirm, setShowDeleteConfirm] = useState({ show: false, profileId: null, profileName: '' });

  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarBase, setSimilarBase] = useState(null);
  const [similarList, setSimilarList] = useState([]);

  const [gapiClient, setGapiClient]   = useState(null);
  const [tokenClient, setTokenClient] = useState(null);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleApiReady, setGoogleApiReady]     = useState(null);
  const [googleError, setGoogleError]           = useState('');

  const [activeColRef, setActiveColRef] = useState(null);
  const [dataReady, setDataReady] = useState(false);

  const [dataError, setDataError] = useState('');
  const [resolvedPath, setResolvedPath] = useState('');
  const [autoExpertiseSkipped, setAutoExpertiseSkipped] = useState(false);
  const [autoExpertiseInProgress, setAutoExpertiseInProgress] = useState(false);
  const [autoExpertiseProgress, setAutoExpertiseProgress] = useState({ total: 0, done: 0 });

  const ctx = useUserCtx();

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProfile, setDetailProfile] = useState(null);

  // ✅ 관리자 여부 probe
  const adminProbe = useIsAdmin();
  const isAdmin = adminProbe.isAdmin;
  const isAuthed = !!(ctx?.user || adminProbe.uid);

  const openProfileDetailById = (id) => {
    const p = profiles.find((x) => x.id === id);
    if (p) {
      setDetailProfile(p);
      setDetailOpen(true);
    }
  };

  // 외부 스크립트 로드
  useEffect(() => {
    const xlsx = document.createElement('script');
    xlsx.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
    xlsx.async = true; document.body.appendChild(xlsx);

    const gapiScript = document.createElement('script');
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.async = true; gapiScript.defer = true; document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.async = true; gisScript.defer = true; document.body.appendChild(gisScript);

    Promise.all([
      new Promise(res => gapiScript.onload = res),
      new Promise(res => gisScript.onload = res),
    ]).then(() => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
          setGapiClient(window.gapi);
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
      [xlsx, gapiScript, gisScript].forEach(s => { if (s && document.body.contains(s)) document.body.removeChild(s); });
    };
  }, []);

  // 데이터 로드
  useEffect(() => {
    let unsub = null; let cancelled = false;
    (async () => {
      setDataReady(false);
      setActiveColRef(null);
      setDataError('');
      setResolvedPath('');

      if (!accessCode) { setProfiles([]); setDataReady(true); return; }

      try {
        const candidates = buildPathCandidates(accessCode, appId);
        let chosen = null;
        let chosenPathStr = '';

        for (const path of candidates) {
          try {
            const colRef = collection(db, ...path);
            const snap = await getDocs(query(colRef, limit(1)));
            if (!snap.empty) {
              chosen = colRef;
              chosenPathStr = path.join(' / ');
              break;
            }
          } catch (e) { /* next */ }
        }

        if (!chosen) {
          const fallbackPath = candidates[0];
          chosen = collection(db, ...fallbackPath);
          chosenPathStr = fallbackPath.join(' / ');
        }

        if (cancelled) return;
        setActiveColRef(chosen);
        setResolvedPath(chosenPathStr);

        unsub = onSnapshot(
          query(chosen),
          (qs) => {
            if (cancelled) return;
            const data = qs.docs.map(d => ({ ...d.data(), id: d.id }));
            setProfiles(data);
            setDataReady(true);
            setDataError(data.length === 0 ? '선택된 경로에 문서가 없습니다.' : '');

            // 자동 백필: 전문영역이 없고 career가 있는 문서 대상, 중복 방지 플래그 사용
            const needs = data.filter(p =>
              !p.expertise && p.career && !p.expertiseAutoChecked
            );
            // 로그인하지 않은 세션에서는 보안규칙상 update가 막히므로 스킵
            if (!auth.currentUser) {
              if (needs.length) setAutoExpertiseSkipped(true);
            } else if (needs.length && activeColRef) {
              const top = needs.slice(0, 50);
              setAutoExpertiseInProgress(true);
              setAutoExpertiseProgress({ total: top.length, done: 0 });
              (async () => {
                const tasks = top.map(async (p) => {
                  const detected = detectExpertiseFromCareer(p.career);
                  try {
                    await updateDoc(doc(activeColRef, p.id), detected ? {
                      expertise: detected,
                      expertiseIsAuto: true,
                      expertiseAutoChecked: true,
                    } : {
                      expertiseAutoChecked: true,
                    });
                  } catch (e) { /* noop */ }
                  setAutoExpertiseProgress(s => ({ ...s, done: s.done + 1 }));
                });

                try { await Promise.all(tasks); } catch (e) { /* noop */ }
                setAutoExpertiseInProgress(false);
              })();
            }
          },
          (err) => {
            console.error('profiles onSnapshot error:', err);
            setProfiles([]);
            setDataReady(true);
            setDataError(err?.code ? `${err.code}: ${err.message}` : '알 수 없는 오류로 데이터를 불러오지 못했습니다.');
          }
        );
      } catch (e) {
        console.error('profiles collection resolve error:', e);
        setProfiles([]);
        setDataReady(true);
        setDataError(e?.message || '데이터 경로를 해석하는 중 오류가 발생했습니다.');
      }
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [accessCode]);

  // --- Handlers ---
  const handleLogin = (code) => {
    setAccessCode(code);
    if (typeof window !== 'undefined') localStorage.setItem('profileDbAccessCode', code);
  };

  const handleFirebaseLogout = async () => {
    try { await signOut(auth); } catch (e) { /* noop */ }
    if (window.gapi?.client) window.gapi.client.setToken(null);
    setIsGoogleSignedIn(false);
  };

  const handleAddOne = async (payload) => {
    if (!activeColRef) return;
    const parsed = parseDateTimeFromRecord(payload.meetingRecord);
    const eventDate = parsed ? parsed.date.toISOString() : null;
    let expertise = payload.expertise || '';
    let expertiseIsAuto = !!payload.expertiseIsAuto;
    if (!expertise) {
      const d = detectExpertiseFromCareer(payload.career);
      if (d) { expertise = d; expertiseIsAuto = true; }
    }
    const profileData = {
      name: payload.name,
      career: payload.career,
      age: payload.age ?? null,
      otherInfo: payload.otherInfo || '',
      expertise,
      expertiseIsAuto,
      priority: payload.priority || '',
      meetingRecord: payload.meetingRecord || '',
      eventDate,
      starred: false
    };
    await addDoc(activeColRef, profileData);
  };

  const handleBulkAdd = async (newProfiles) => {
    if (!activeColRef || newProfiles.length === 0) return '업로드할 프로필이 없습니다.';
    const snap = await getDocs(query(activeColRef));
    const nameToId = new Map(snap.docs.map(d => [d.data().name, d.id]));
    const batch = writeBatch(db);
    let updated=0, added=0;
    newProfiles.forEach(p => {
      const id = nameToId.get(p.name);
      const payload = { starred:false, ...p };
      if (id) { batch.set(doc(activeColRef, id), payload, { merge: true }); updated++; }
      else { batch.set(doc(activeColRef), payload); added++; }
    });
    await batch.commit();
    return `${added}건 추가, ${updated}건 업데이트 완료.`;
  };

  const handleUpdate = async (profileId, updatedData) => {
    if (!activeColRef) return;
    await updateDoc(doc(activeColRef, profileId), updatedData);
  };

  const handleDeleteRequest = (profileId, profileName) => setShowDeleteConfirm({ show: true, profileId, profileName });
  const confirmDelete = async () => {
    if (showDeleteConfirm.profileId && activeColRef) await deleteDoc(doc(activeColRef, showDeleteConfirm.profileId));
    setShowDeleteConfirm({ show: false, profileId: null, profileName: '' });
    (toast.success?.('삭제되었습니다.') ?? toast('삭제되었습니다.'));
  };

  const openSimilarModal = (base) => {
    const others = profiles.filter(p => p.id !== base.id).map(p => ({ profile: p, score: similarityScore(base, p) }));
    const sorted = others.sort((a,b) => b.score - a.score).slice(0, 20);
    setSimilarBase(base); setSimilarList(sorted); setSimilarOpen(true);
  };

  const ensureGoogleAuth = () => {
    return new Promise((resolve, reject) => {
      const token = gapiClient?.client?.getToken?.();
      if (token?.access_token) { setIsGoogleSignedIn(true); resolve(true); return; }
      if (!tokenClient) { reject(new Error('Google API 초기화 전입니다. 잠시 후 다시 시도해주세요.')); return; }
      tokenClient.callback = (resp) => {
        if (resp && resp.access_token) { gapiClient.client.setToken({ access_token: resp.access_token }); setIsGoogleSignedIn(true); resolve(true); }
        else { reject(new Error('Google 토큰을 발급받지 못했습니다.')); }
      };
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  };

  const handleSyncOneToCalendar = async (profile) => {
    if (!googleApiReady) { (toast.error?.('Google API가 준비되지 않았습니다.') ?? toast('Google API가 준비되지 않았습니다.')); return; }
    try { await ensureGoogleAuth(); }
    catch (e) { (toast.error?.(e.message || 'Google 인증에 실패했습니다.') ?? toast(e.message || 'Google 인증에 실패했습니다.')); return; }

    let parsed = parseDateTimeFromRecord(profile.meetingRecord);
    if (!parsed && profile.eventDate) parsed = { date: new Date(profile.eventDate), hadTime: true };
    if (!parsed) { (toast.error?.('날짜/시간을 인식할 수 없습니다. "미팅기록"을 확인하세요.') ?? toast('날짜/시간을 인식할 수 없습니다. "미팅기록"을 확인하세요.')); return; }

    const startDate = parsed.date;
    let eventResource;
    if (parsed.hadTime) {
      const startLocal = formatRFC3339InTZ(startDate, TZ);
      const endDate = new Date(startDate.getTime() + 90 * 60000);
      const endLocal = formatRFC3339InTZ(endDate, TZ);
      eventResource = {
        summary: `(영입) ${profile.name}님 미팅`,
        description: `${profile.name}님 프로필 보기:\n${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`,
        start: { dateTime: startLocal, timeZone: TZ },
        end:   { dateTime: endLocal,   timeZone: TZ },
        visibility: 'private',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      };
    } else {
      const dateStr = formatDateOnlyInTZ(startDate, TZ);
      const end = new Date(startDate); end.setDate(end.getDate() + 1);
      const endStr = formatDateOnlyInTZ(end, TZ);
      eventResource = {
        summary: `(영입) ${profile.name}님 미팅`,
        description: `${profile.name}님 프로필 보기:\n${window.location.origin}${window.location.pathname}?profile=${profile.id}&code=${accessCode}`,
        start: { date: dateStr },
        end:   { date: endStr  },
        visibility: 'private',
      };
    }

    try {
      let result;
      if (profile.gcalEventId) {
        result = await gapiClient.client.calendar.events.patch({ calendarId: 'primary', eventId: profile.gcalEventId, resource: eventResource });
      } else {
        result = await gapiClient.client.calendar.events.insert({ calendarId: 'primary', resource: eventResource });
      }
      const ev = result.result || {};
      if (!activeColRef) throw new Error('컬렉션 참조가 없습니다.');
      await updateDoc(doc(activeColRef, profile.id), {
        gcalEventId: ev.id || profile.gcalEventId || null,
        gcalHtmlLink: ev.htmlLink || profile.gcalHtmlLink || null,
        gcalLastSyncAt: new Date().toISOString(),
      });
      (toast.success?.(profile.gcalEventId ? '캘린더 일정이 수정되었습니다.' : '캘린더 일정이 등록되었습니다.') ??
        toast(profile.gcalEventId ? '캘린더 일정이 수정되었습니다.' : '캘린더 일정이 등록되었습니다.'));
    } catch (e) {
      console.error('Google Calendar 동기화 실패:', e);
      (toast.error?.('캘린더 동기화에 실패했습니다. 콘솔을 확인하세요.') ?? toast('캘린더 동기화에 실패했습니다. 콘솔을 확인하세요.'));
    }
  };
  
  const runAutoExpertiseNow = async () => {
    if (!auth.currentUser) {
      (toast?.error?.('로그인 후 실행 가능합니다.') ?? toast('로그인 후 실행 가능합니다.'));
      return;
    }
    if (!activeColRef) return;
    // 1) 기존: 비어있는 것만
    // const targets = profiles.filter(p => !p.expertise && p.career);
    // 2) 개선: '비어있거나(auto인 것)'을 모두 재평가
    const targets = profiles.filter(p =>
      p.career &&
      (!p.expertise || p.expertiseIsAuto === true)
    );
    if (!targets.length) {
      (toast?.info?.('처리할 대상이 없습니다.') ?? toast('처리할 대상이 없습니다.'));
      return;
    }
    setAutoExpertiseInProgress(true);
    setAutoExpertiseProgress({ total: targets.length, done: 0 });
    for (const p of targets) {
      const detected = detectExpertiseFromCareer(p.career);
      try {
        await updateDoc(doc(activeColRef, p.id), detected ? {
          expertise: detected,
          expertiseIsAuto: true,
          expertiseAutoChecked: true,
        } : {
          expertiseAutoChecked: true,
        });
      } catch (e) { /* noop */ }
      setAutoExpertiseProgress(s => ({ ...s, done: s.done + 1 }));
    }
    setAutoExpertiseInProgress(false);
    (toast?.success?.('전문영역 자동보완이 완료되었습니다.') ?? toast('전문영역 자동보완이 완료되었습니다.'));
  };

  // URL 파라미터
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const profileIdFromUrl = urlParams.get('profile');
  const accessCodeFromUrl = urlParams.get('code');

  const profilesWithHelpers = useMemo(() => profiles, [profiles]);

  // 파생값
  const totalCount = profiles.length;
  const meetingCount = useMemo(
    () => profiles.filter(p => !!p.eventDate).length,
    [profiles]
  );

  // 상세보기 (공유 링크로 접근 시)
  function ProfileDetailView({ profileId, accessCode }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    useEffect(() => {
      (async () => {
        try {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', accessCode, profileId);
          const snap = await getDoc(ref);
          if (snap.exists()) setProfile({ ...snap.data(), id: snap.id });
          else setError('프로필을 찾을 수 없습니다.');
        } catch (e) {
          console.error('Error fetching profile:', e);
          setError('프로필을 불러오는 중 오류가 발생했습니다.');
        } finally { setLoading(false); }
      })();
    }, [profileId, accessCode]);

    if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="animate-spin h-10 w-10 text-yellow-500" /></div>;
    if (error)   return <div className="flex justify-center items-center min-h-screen text-red-500">{error}</div>;
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
  }

  if (profileIdFromUrl && accessCodeFromUrl) {
    return (
      <ErrorBoundary>
        <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />
      </ErrorBoundary>
    );
  }

  if (!accessCode) {
    return (
      <ErrorBoundary>
        <LoginScreen
          onLogin={handleLogin}
          onLogout={handleFirebaseLogout}
          isAuthed={isAuthed}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthGate>
        {profileIdFromUrl && accessCodeFromUrl ? (
          <ProfileDetailView profileId={profileIdFromUrl} accessCode={accessCodeFromUrl} />
        ) : !accessCode ? (
          <LoginScreen onLogin={handleLogin} onLogout={handleFirebaseLogout} isAuthed={isAuthed} />
        ) : (
          <div className="bg-gray-50 min-h-screen font-sans">
          {showDeleteConfirm.show && (
            <ConfirmationModal
              message={`'${showDeleteConfirm.profileName}' 프로필을 정말로 삭제하시겠습니까?`}
              onConfirm={confirmDelete}
              onCancel={() => setShowDeleteConfirm({ show: false, profileId: null, profileName: '' })}
            />
          )}

          {/* 상단 헤더 */}
          <header className="px-4 sm:px-6 py-3 border-b bg-yellow-400 text-white sticky top-0 z-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button className="md:hidden p-2 rounded-md border bg-white" onClick={()=>setSidebarOpen(s=>!s)} aria-label="사이드바 토글">
                  <Menu size={18}/>
                </button>
                <Users className="text-white w-7 h-7" aria-hidden />
                <h1 className="text-xl font-bold text-white">프로필 대시보드</h1>
                <span className="text-xs sm:text-sm bg-white/25 border border-white/40 px-2 sm:px-3 py-1 rounded-full font-mono">
                  {accessCode}
                </span>
              </div>
              <div className="hidden md:flex items-center gap-3">
                {googleApiReady === false && (
                  <span className="text-xs text-red-500">
                    Google Calendar 연동 비활성화됨{googleError ? ` (${googleError})` : ' (초기화 실패)'}
                  </span>
                )}
                {googleApiReady === true && (
                  isGoogleSignedIn ? (
                    <Btn
                      size="sm"
                      variant="subtle"
                      onClick={() => { if (window.gapi?.client) window.gapi.client.setToken(null); setIsGoogleSignedIn(false); }}
                    >
                      Google 로그아웃
                    </Btn>
                  ) : (
                    <Btn
                      size="sm"
                      variant="subtle"
                      onClick={() => tokenClient?.requestAccessToken({ prompt: 'consent' })}
                    >
                      Google 로그인
                    </Btn>
                  )
                )}
                <Btn
                  size="sm"
                  variant="subtle"
                  onClick={() => { setAccessCode(null); if (typeof window !== 'undefined') localStorage.removeItem('profileDbAccessCode'); }}
                >
                  <LogOut className="w-4 h-4 mr-1.5" /> 로그아웃
                </Btn>
              </div>
            </div>

            {/* 디버그 배너 */}
            {( (isAdmin && resolvedPath) || dataError ) && (
              <div className="mt-2 text-xs">
                {isAdmin && resolvedPath && (
                  <div className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 mr-2">
                    현재 읽는 경로: <span className="font-mono">{resolvedPath}</span>
                  </div>
                )}
                {dataError && (
                  <div className="inline-block bg-red-50 text-red-700 border border-red-200 rounded px-2 py-1">
                    데이터 로드 오류: {dataError}
                  </div>
                )}
                {isAdmin && (
                  <button
                    onClick={runAutoExpertiseNow}
                    className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-1 ml-2 hover:bg-emerald-100"
                    type="button"
                    title="전문영역 자동보완을 즉시 재실행합니다"
                  >
                    전문영역 자동보완 재실행
                  </button>
                )}
                {autoExpertiseInProgress && (
                  <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1 ml-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      전문영역 자동보완 진행 중 …
                      <b className="ml-1">
                        {autoExpertiseProgress.done}/{autoExpertiseProgress.total}
                      </b>
                    </span>
                  </div>
                )}
                {!autoExpertiseInProgress && autoExpertiseSkipped && (
                  <div className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1 ml-2">
                    로그인하지 않은 상태라 기존 프로필의 <b>전문영역 자동보완</b>은 건너뛰었습니다.
                  </div>
                )}
                {autoExpertiseSkipped && (
                  <div className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1 ml-2">
                    로그인하지 않은 상태라 기존 프로필의 <b>전문영역 자동보완</b>은 건너뛰었습니다.
                  </div>
                )}
              </div>
            )}

            {/* 카운트 박스 */}
            <div className="mt-3 flex items-center gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <h3 className="text-base font-medium text-gray-500">총 등록된 프로필</h3>
                <p className="text-3xl font-bold text-yellow-500 mt-1">{totalCount}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <h3 className="text-base font-medium text-gray-500">미팅 진행 프로필</h3>
                <p className="text-3xl font-bold text-yellow-500 mt-1">{meetingCount}</p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end">
              <Btn
                size="sm"
                variant="subtle"
                onClick={() => exportProfilesToXLSX(`profiles_${accessCode}_all`, profiles)}
              >
                <Download className="w-4 h-4 mr-1" /> 전체 엑셀
              </Btn>
            </div>
          </header>

          <div className="flex">
            {/* 사이드바 */}
            <aside className={`fixed md:static top-[180px] z-30 md:z-auto left-0 h-[calc(100vh-180px)] md:h-auto w-64 bg-white border-r transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
              <nav className="p-3 space-y-1 overflow-y-auto h-full">
                <button onClick={()=>{ setActiveMain('alerts'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='alerts'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <BellRing size={16}/> 알림
                </button>
                <button onClick={()=>{ setActiveMain('search'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='search'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <SearchIcon size={16}/> 검색
                </button>
                <button onClick={()=>{ setActiveMain('starred'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='starred'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <Star size={16}/> 주목 중인 프로필들
                </button>
                <button onClick={()=>{ setActiveMain('meetings'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='meetings'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <Calendar size={16}/> 미팅 데이터
                </button>

                {/* Functions 토글 */}
                <button onClick={()=>{ setActiveMain('functions'); setFunctionsOpen(v=>!v); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm ${activeMain==='functions'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}>
                  <span className="flex items-center gap-2"><Sparkles size={16}/> Functions</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${functionsOpen ? 'rotate-180' : ''}`} />
                </button>

                {functionsOpen && (
                  <div className="pl-4 space-y-1">
                    <button onClick={()=>{ setActiveMain('functions'); setFunctionsSub('rec'); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='functions'&&functionsSub==='rec'?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                      <Sparkles size={16}/> 추천
                    </button>
                    <button onClick={()=>{ setActiveMain('functions'); setFunctionsSub('long'); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='functions'&&functionsSub==='long'?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                      <Clock size={16}/> 장기관리
                    </button>
                    <button onClick={()=>{ setActiveMain('functions'); setFunctionsSub('graphs'); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='functions'&&functionsSub==='graphs'?'bg-yellow-100 text-yellow-800':'hover:bg-gray-100'}`}>
                      <LineChartIcon size={16}/> 그래프&필터
                    </button>
                  </div>
                )}
                  
                <button
                  onClick={()=>{ setActiveMain('ideal'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeMain==='ideal'?'bg-yellow-400 text-white':'hover:bg-gray-100'}`}
                >
                  <Sparkles size={16}/> 이상형게임
                </button>

                {/* 관리자 전용 */}
                <AdminOnlyButton
                  activeMain={activeMain}
                  setActiveMain={setActiveMain}
                  setFunctionsOpen={setFunctionsOpen}
                />

                {/* ✅ 항상 제일 아래: 프로필 관리 */}
                <button
                  onClick={() => { setActiveMain('manage'); setFunctionsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                    activeMain==='manage' ? 'bg-yellow-400 text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  <UserPlus size={16}/> 프로필 관리
                </button>
              </nav>
            </aside>

            {/* 본문 */}
            <main className="flex-1 p-4 sm:p-6 md:ml-0 ml-0 mt-3 md:mt-4">
              {!dataReady ? (
                <div className="max-w-[1200px] mx-auto space-y-3">
                  {/* 스켈레톤 로딩 */}
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : (
                <div className="max-w-[1200px] mx-auto">
                  <MainContent
                    activeMain={activeMain}
                    functionsSub={functionsSub}
                    setFunctionsSub={setFunctionsSub}
                    profilesWithHelpers={profilesWithHelpers}
                    handleUpdate={handleUpdate}
                    handleDeleteRequest={handleDeleteRequest}
                    accessCode={accessCode}
                    handleSyncOneToCalendar={handleSyncOneToCalendar}
                    openSimilarModal={openSimilarModal}
                    setActiveMain={setActiveMain}
                    setFunctionsOpen={setFunctionsOpen}
                    isAdmin={isAdmin}
                    adminProbe={adminProbe}
                    handleAddOne={handleAddOne}
                    handleBulkAdd={handleBulkAdd}
                    openProfileDetailById={openProfileDetailById}
                    // 검색/그래프 필터 (글로벌 상태)
                    searchTerm={searchTermGlobal}
                    setSearchTerm={setSearchTermGlobal}
                    activeFilter={functionsActiveFilter}
                    setActiveFilter={setFunctionsActiveFilter}
                    idealSeed={idealSeed}
                    setIdealSeed={setIdealSeed}
                  />
                </div>
              )}
            </main>
          </div>

          {/* 상세 모달 */}
          {detailOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => setDetailOpen(false)} />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-800">
                    {detailProfile?.name || '프로필'}
                  </h3>
                  <button onClick={() => setDetailOpen(false)} className="text-gray-500 hover:text-gray-800" aria-label="닫기">
                    <X size={20} />
                  </button>
                </div>
                {detailProfile && (
                  <ProfileCard
                    profile={detailProfile}
                    onUpdate={handleUpdate}
                    onDelete={handleDeleteRequest}
                    accessCode={accessCode}
                    onSyncOne={handleSyncOneToCalendar}
                    onShowSimilar={openSimilarModal}
                    onToggleStar={(id, val) => handleUpdate(id, { starred: !!val })}
                  />
                )}
              </div>
            </div>
          )}

          {/* 유사도 모달 */}
          {similarOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black bg-opacity-40" onClick={()=>setSimilarOpen(false)} />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-800">
                    유사 프로필 — <span className="text-yellow-600">{similarBase?.name}</span>
                  </h3>
                  <button onClick={()=>setSimilarOpen(false)} className="text-gray-500 hover:text-gray-800" aria-label="닫기"><X size={20} /></button>
                </div>
                <div className="overflow-y-auto pr-3" style={{ maxHeight: '70vh' }}>
                  {similarList.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">표시할 유사 프로필이 없습니다.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {similarList.map(({ profile }) => (
                        <ProfileCard
                          key={profile.id}
                          profile={profile}
                          onUpdate={handleUpdate}
                          onDelete={handleDeleteRequest}
                          accessCode={accessCode}
                          onSyncOne={handleSyncOneToCalendar}
                          onShowSimilar={openSimilarModal}
                          onToggleStar={(id, val)=>handleUpdate(id,{ starred: !!val })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AuthGate>
  </ErrorBoundary>
);
}
