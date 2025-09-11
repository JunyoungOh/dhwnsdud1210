// src/utils/nlp.js
// 자연어 → 구조화된 조건으로 파싱 + 프로필 매칭 유틸

// 간단 한국어 토큰 정규화
function norm(s = "") {
  return String(s || "").toLowerCase().trim();
}

// 자주 쓰이는 키워드 사전
const COMPANY_KEYWORDS = ['네이버', '카카오', '쿠팡', '라인', '우아한형제들', '당근', '토스'];
const ROLE_KEYWORDS = ['백엔드', '프론트엔드', '프론트', 'backend', 'frontend', '데이터', 'data', 'ml', 'ai', 'pm', 'po', 'product', '디자이너', 'design', 'ios', 'android', '모바일', '웹', '플랫폼', 'infra', '인프라', 'sre'];
const LEAD_KEYWORDS = ['리더', '리딩', '팀장', '실장', '본부장', '헤드', 'lead', 'head', 'manager', 'mgr', '리드'];

// 우선순위 뉘앙스 (보조)
function detectPriority(text) {
  // “우선순위 3/2/1” 직접 표기
  const direct = text.match(/우선\s*순위\s*([123])/);
  if (direct) return direct[1];

  // 상/중/하, 핵심/중요/보류 등 뉘앙스 맵핑 (느슨)
  const hi = /(상|핵심|매우\s*중요|top|high)/.test(text);
  const mid = /(중|중요|medium|mid)/.test(text);
  const low = /(하|낮음|보류|low)/.test(text);
  if (hi) return '3';
  if (mid) return '2';
  if (low) return '1';
  return null;
}

// 나이대(30대 등) 추출
function detectAgeDecade(text) {
  const m = text.match(/(\d{2})\s*대/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  if (d >= 10 && d <= 70) return d; // 10,20,30...
  return null;
}

// 회사 키워드
function detectCompanies(text) {
  const found = COMPANY_KEYWORDS.filter(k => text.includes(norm(k)));
  return Array.from(new Set(found));
}

// 역할/직군 키워드
function detectRoles(text) {
  const found = ROLE_KEYWORDS.filter(k => text.includes(norm(k)));
  return Array.from(new Set(found));
}

// 리더 여부
function detectLeader(text) {
  return LEAD_KEYWORDS.some(k => text.includes(norm(k)));
}

// 남은 자유 키워드(아주 간단히): 공백단위로 쪼개고 너무 짧은 토큰/숫자/불용어는 제거
const STOPWORDS = new Set(['그리고','그리고요','그','좀','에서','으로','있는','하게','해줘','찾아줘','찾아','주라','해주세요','해줘요','의','를','을','이','가','은','는','도','에','와','과','및','또는','or','and']);
function extractFreeTokens(text) {
  return text
    .split(/[\s,]+/)
    .map(t => norm(t).replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(t => t && t.length >= 2 && !STOPWORDS.has(t) && !/\d{2}대/.test(t))
    .slice(0, 8); // 과도한 토큰 방지
}

/**
 * 자연어 쿼리 파싱
 * 결과에 __isEmpty = true/false 를 반드시 넣어 비어있는 쿼리를 식별
 */
export function parseNaturalQuery(input) {
  const text = norm(input);
  if (!text) return { __isEmpty: true };

  const companies = detectCompanies(text);
  const roles = detectRoles(text);
  const ageDecade = detectAgeDecade(text);
  const priority = detectPriority(text);
  const leader = detectLeader(text);
  const tokens = extractFreeTokens(text).filter(t =>
    !companies.includes(t) &&
    !roles.includes(t) &&
    !/^\d{2}대$/.test(t) &&
    !/우선\s*순위/.test(t)
  );

  const has =
    (companies && companies.length) ||
    (roles && roles.length) ||
    !!ageDecade ||
    !!priority ||
    !!leader ||
    (tokens && tokens.length);

  return {
    companies,
    roles,
    ageDecade,  // 30 → 30대
    priority,   // '3' | '2' | '1' | null
    leader,     // true | false
    tokens,     // 자유 키워드(있으면 all-contains)
    __isEmpty: !has,
  };
}

/**
 * 파싱된 조건으로 프로필 하나를 검사
 * - __isEmpty === true 인 쿼리는 절대 매치시키지 않음(빈 조건은 검색無)
 */
export function matchProfileWithNL(profile, parsed) {
  if (!parsed || parsed.__isEmpty) return false;

  const name = norm(profile.name);
  const career = norm(profile.career);
  const expertise = norm(profile.expertise);
  const otherInfo = norm(profile.otherInfo);
  const priority = profile.priority ? String(profile.priority) : '';
  const age = typeof profile.age === 'number' ? profile.age : null;

  // 회사(any)
  if (parsed.companies && parsed.companies.length) {
    const ok = parsed.companies.some(c => career.includes(norm(c)));
    if (!ok) return false;
  }

  // 역할/직군(any) → career 또는 expertise 에서 만족
  if (parsed.roles && parsed.roles.length) {
    const ok = parsed.roles.some(r => career.includes(norm(r)) || expertise.includes(norm(r)));
    if (!ok) return false;
  }

  // 나이대(예: 30대)
  if (parsed.ageDecade) {
    const d = parsed.ageDecade;
    const min = d, max = d + 9;
    if (!(age && age >= min && age <= max)) return false;
  }

  // 우선순위
  if (parsed.priority) {
    if (priority !== parsed.priority) return false;
  }

  // 리더 여부
  if (parsed.leader) {
    const hay = `${career} ${expertise} ${otherInfo}`;
    const isLead = LEAD_KEYWORDS.some(k => hay.includes(norm(k)));
    if (!isLead) return false;
  }

  // 자유 키워드(all must exist anywhere)
  if (parsed.tokens && parsed.tokens.length) {
    const hay = `${name} ${career} ${expertise} ${otherInfo}`;
    const all = parsed.tokens.every(t => hay.includes(norm(t)));
    if (!all) return false;
  }

  return true;
}
