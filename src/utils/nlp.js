// src/utils/nlp.js
// 자연어 검색 파서 + 매칭 유틸
// 사용법:
//   import { parseNaturalQuery, matchProfileWithNL } from './utils/nlp';
//   const parsed = parseNaturalQuery(input);                     // 질의 파싱
//   const { matched, score, reasons } = matchProfileWithNL(p, parsed); // 프로필 매칭

// ─────────────────────────────────────────────────────────────
// 1) 기본 사전/유틸
// ─────────────────────────────────────────────────────────────
const TECH_KEYWORDS = [
  '테크', '개발', '엔지니어', '프로그래머', '프론트엔드', '백엔드', '풀스택',
  '데이터', 'ai', 'ml', '머신러닝', '딥러닝', '플랫폼', 'infra', '인프라',
  'sre', 'devops', 'ios', 'android', '모바일', '웹', '서비스개발'
];

const LEADERSHIP_KEYWORDS = [
  '리더', '리더십', '팀장', '헤드', '매니저', '수석', '책임',
  '디렉터', 'director', 'vp', '부장', '이사', 'cto', 'cio', 'ceo'
];

// 불용어(검색 의미에 거의 영향 없는 조사/접속어 등)
const STOPWORDS = new Set([
  '를','을','이','가','은','는','과','와','의','에서','에게','으로','로',
  '그리고','또는','혹은','and','or','the','a','an','to','in','at','on','of',
  '라는','같은','있는','없는','했던','했던,','했던.' // 가벼운 서술어
]);

function normalize(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitTokens(s) {
  // 한글/영문/숫자 토큰만 남기고 분리
  return normalize(s)
    .replace(/[^0-9a-z가-힣+\- ]/g, ' ')
    .split(' ')
    .filter(t => t && !STOPWORDS.has(t));
}

function anyKeywordInText(keywords, text) {
  return keywords.some(kw => text.includes(kw));
}

// ─────────────────────────────────────────────────────────────
// 2) 파서: 자연어 질의 → 구조화 조건
// ─────────────────────────────────────────────────────────────
/**
 * 파싱 결과 구조
 * {
 *   includeKeywords: string[],   // 반드시 포함되어야 할 키워드(회사명 등 자유 키워드)
 *   excludeKeywords: string[],   // 제외 키워드
 *   ageDecade: number|null,      // 20/30/40/50 (…대)
 *   ageMin: number|null,         // 선택 (세 단위 범위)
 *   ageMax: number|null,
 *   wantsTech: boolean,          // 테크 직군 요구
 *   wantsLeader: boolean,        // 리더/관리자급 요구
 *   meetingRequired: boolean,    // 미팅/일정 보유 요구
 *   priority: '1'|'2'|'3'|null,  // 우선순위
 *   starredOnly: boolean         // 주목(별표) 프로필만
 * }
 */
export function parseNaturalQuery(inputRaw) {
  const input = normalize(inputRaw);

  const res = {
    includeKeywords: [],
    excludeKeywords: [],
    ageDecade: null,
    ageMin: null,
    ageMax: null,
    wantsTech: false,
    wantsLeader: false,
    meetingRequired: false,
    priority: null,
    starredOnly: false
  };

  // 2-1) 나이: "40대", "나이 40대", "35세~45세"
  const decadeM = input.match(/(\d{2})\s*대/);
  if (decadeM) {
    const d = parseInt(decadeM[1], 10);
    if (d >= 10 && d <= 80) res.ageDecade = d;
  }
  const rangeM = input.match(/(\d{1,2})\s*세\s*[~\-]\s*(\d{1,2})\s*세/);
  if (rangeM) {
    const a = parseInt(rangeM[1], 10);
    const b = parseInt(rangeM[2], 10);
    if (!isNaN(a) && !isNaN(b) && a <= b) {
      res.ageMin = a; res.ageMax = b;
      res.ageDecade = null; // 범위가 있으면 decade는 비움
    }
  }

  // 2-2) 테크/리더 시그널
  if (anyKeywordInText(TECH_KEYWORDS, input))      res.wantsTech = true;
  if (anyKeywordInText(LEADERSHIP_KEYWORDS, input)) res.wantsLeader = true;
  if (/(테크\s*직군|기술\s*직군)/.test(input)) res.wantsTech = true;
  if (/(리더|매니저|관리자|리더십|팀장|헤드)/.test(input)) res.wantsLeader = true;

  // 2-3) 미팅/일정 보유 요구
  if (/(미팅|일정|캘린더|약속|면담)/.test(input)) res.meetingRequired = true;

  // 2-4) 우선순위
  const prioM = input.match(/(우선순위|priority)\s*([123])/);
  if (prioM) res.priority = prioM[2];

  // 2-5) 주목/별표/스타
  if (/(주목|즐겨찾|별표|스타|모아보기)/.test(input)) res.starredOnly = true;

  // 2-6) 제외 키워드: "카카오 제외", "네이버 아닌", "-쿠팡"
  const exclude = new Set();
  // 패턴 A: "<토큰> 제외|빼고|아닌"
  const exRe = /([가-힣a-z0-9+]{2,})\s*(?:는|은|이|가)?\s*(?:제외|빼고|아닌)/g;
  let m;
  while ((m = exRe.exec(input)) !== null) exclude.add(m[1]);
  // 패턴 B: -키워드
  const minusRe = /-(\S+)/g;
  while ((m = minusRe.exec(input)) !== null) exclude.add(m[1]);
  res.excludeKeywords = Array.from(exclude);

  // 2-7) 포함 키워드: 불용어 제외 토큰 중에서, 위 조건들에 직접 쓰이지 않은 일반 키워드
  const tokens = splitTokens(input);
  const consumed = new Set([
    ...res.excludeKeywords,
    ...(res.ageDecade ? [`${res.ageDecade}`] : []),
    ...(res.priority ? [res.priority] : []),
    '우선순위','priority','미팅','일정','캘린더','약속','면담',
    '테크','직군','리더','리더십','매니저','관리자','팀장','헤드'
  ]);
  const include = [];
  for (const t of tokens) {
    if (consumed.has(t)) continue;
    if (t.match(/^\d{1,2}세$/)) continue;
    include.push(t);
  }
  res.includeKeywords = Array.from(new Set(include));

  return res;
}

// ─────────────────────────────────────────────────────────────
// 3) 매칭: 프로필 + 파싱결과 → { matched, score, reasons[] }
// ─────────────────────────────────────────────────────────────
export function matchProfileWithNL(profile, parsed) {
  const reasons = [];
  let score = 0;

  const text = normalize(
    [
      profile.name || '',
      profile.career || '',
      profile.expertise || '',
      profile.otherInfo || ''
    ].join(' ')
  );

  // 3-1) 제외 키워드
  for (const bad of parsed.excludeKeywords) {
    if (bad && text.includes(normalize(bad))) {
      return { matched: false, score: 0, reasons: [`제외 키워드(${bad}) 포함`] };
    }
  }

  // 3-2) 포함 키워드(AND 느낌, 너무 강하면 검색이 빡빡해지니 "대부분" 충족으로 처리)
  if (parsed.includeKeywords.length > 0) {
    const hits = parsed.includeKeywords.filter(kw => text.includes(normalize(kw)));
    const ratio = hits.length / parsed.includeKeywords.length;
    if (ratio < 0.6) {
      return { matched: false, score: 0, reasons: ['핵심 키워드 매칭 부족'] };
    }
    score += Math.round(ratio * 30);
    if (hits.length) reasons.push(`키워드 일치: ${hits.join(', ')}`);
  }

  // 3-3) 나이 조건
  if (parsed.ageDecade != null) {
    const a = Number(profile.age);
    const d = parsed.ageDecade;
    const inBand =
      !isNaN(a) &&
      ((d === 10 && a < 20) ||
       (d === 20 && a >= 20 && a < 30) ||
       (d === 30 && a >= 30 && a < 40) ||
       (d === 40 && a >= 40 && a < 50) ||
       (d === 50 && a >= 50));
    if (!inBand) return { matched: false, score: 0, reasons: ['나이(…대) 불일치'] };
    score += 15; reasons.push(`${parsed.ageDecade}대`);
  }
  if (parsed.ageMin != null && parsed.ageMax != null) {
    const a = Number(profile.age);
    if (isNaN(a) || a < parsed.ageMin || a > parsed.ageMax) {
      return { matched: false, score: 0, reasons: ['나이 범위 불일치'] };
    }
    score += 15; reasons.push(`나이 ${parsed.ageMin}~${parsed.ageMax}세`);
  }

  // 3-4) 테크/리더
  if (parsed.wantsTech) {
    if (!anyKeywordInText(TECH_KEYWORDS, text)) {
      return { matched: false, score: 0, reasons: ['테크 직군 키워드 없음'] };
    }
    score += 15; reasons.push('테크 직군');
  }
  if (parsed.wantsLeader) {
    if (!anyKeywordInText(LEADERSHIP_KEYWORDS, text)) {
      return { matched: false, score: 0, reasons: ['리더/관리자 키워드 없음'] };
    }
    score += 15; reasons.push('리더/관리자');
  }

  // 3-5) 미팅/일정 보유
  if (parsed.meetingRequired) {
    if (!profile.eventDate) return { matched: false, score: 0, reasons: ['미팅/일정 없음'] };
    score += 10; reasons.push('미팅/일정 있음');
  }

  // 3-6) 우선순위
  if (parsed.priority) {
    if (String(profile.priority || '') !== parsed.priority) {
      return { matched: false, score: 0, reasons: ['우선순위 불일치'] };
    }
    score += 10; reasons.push(`우선순위 ${parsed.priority}`);
  }

  // 3-7) 주목(별표)만
  if (parsed.starredOnly) {
    if (!profile.starred) return { matched: false, score: 0, reasons: ['주목 프로필 아님'] };
    score += 8; reasons.push('주목 프로필');
  }

  // 기본 가점: 전문영역 + 경력 길이
  if (profile.expertise) score += 4;
  if ((profile.career || '').length > 20) score += 3;

  return {
    matched: true,
    score: Math.min(100, score),
    reasons
  };
}
