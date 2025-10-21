const crypto = require('crypto');
const {
  DEFAULT_TIME_ZONE,
  buildMeetingReminderMessages,
  isKakaoWorkAvailable,
  postToKakaoWork,
} = require('../lib/kakaowork');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CORS_HEADERS = {
  ...JSON_HEADERS,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/datastore'];
const DEFAULT_APP_ID = 'profile-db-app-junyoungoh';
const DEFAULT_STATUS_DOC_PATH = (appId) => buildDocPath('artifacts', appId, 'meta', 'kakaoReminderStatus');
const DEFAULT_SEND_HOUR = 9;
const DEFAULT_SEND_MINUTE = 0;

function buildDocPath(...segments) {
  return segments.map((seg) => encodeURIComponent(seg)).join('/');
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not configured.');
  }

  const candidates = [raw];
  try {
    candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (error) {
    // ignore base64 fallback errors
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && parsed.client_email && parsed.private_key) {
        return parsed;
      }
    } catch (error) {
      // try next candidate
    }
  }

  throw new Error('Invalid Firebase service account JSON provided.');
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function fetchAccessToken(serviceAccount, scopes = DEFAULT_SCOPES) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: Array.isArray(scopes) ? scopes.join(' ') : String(scopes),
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, 'base64');
  const jwt = `${unsigned}.${signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    const detail = data.error_description || data.error || JSON.stringify(data);
    throw new Error(`Failed to obtain Google access token: ${response.status} ${detail}`);
  }

  if (!data.access_token) {
    throw new Error('Google access token response did not include an access_token.');
  }

  return data.access_token;
}

async function listAccessCodes({ token, projectId, appId, explicit }) {
  if (Array.isArray(explicit) && explicit.length) {
    return explicit;
  }

  const docPath = buildDocPath('artifacts', appId, 'public', 'data');
  const url = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${docPath}:listCollectionIds`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pageSize: 200 }),
  });

  if (response.status === 404) {
    return [];
  }

  const body = await response.json();
  if (!response.ok) {
    const detail = body.error?.message || JSON.stringify(body);
    throw new Error(`Failed to list Firestore access codes: ${response.status} ${detail}`);
  }

  return (body.collectionIds || []).sort();
}

function decodeFirestoreValue(value) {
  if (value == null) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number.parseInt(value.integerValue, 10);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return value.doubleValue;
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    return decodeFirestoreDocument({ fields: value.mapValue.fields || {} });
  }
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    const arr = value.arrayValue.values || [];
    return arr.map((entry) => decodeFirestoreValue(entry));
  }
  if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) return value.referenceValue;
  if (Object.prototype.hasOwnProperty.call(value, 'geoPointValue')) return value.geoPointValue;
  return null;
}

function decodeFirestoreDocument(doc = {}) {
  const result = {};
  const fields = doc.fields || {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeFirestoreValue(value);
  }
  if (doc.name) {
    const parts = doc.name.split('/');
    result.id = parts[parts.length - 1];
  }
  return result;
}

function encodeFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value
          .map((entry) => encodeFirestoreValue(entry))
          .filter((entry) => entry !== undefined),
      },
    };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  const type = typeof value;
  if (type === 'string') return { stringValue: value };
  if (type === 'boolean') return { booleanValue: value };
  if (type === 'number') {
    if (!Number.isFinite(value)) return { stringValue: String(value) };
    if (Number.isInteger(value)) return { integerValue: value.toString() };
    return { doubleValue: value };
  }
  if (type === 'object') {
    const fields = {};
    for (const [key, entry] of Object.entries(value)) {
      const encoded = encodeFirestoreValue(entry);
      if (encoded !== undefined) fields[key] = encoded;
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function encodeFirestoreDocument(data = {}) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    const encoded = encodeFirestoreValue(value);
    if (encoded !== undefined) fields[key] = encoded;
  }
  return { fields };
}

async function fetchProfilesForAccessCode({ token, projectId, appId, accessCode }) {
  const collectionPath = buildDocPath('artifacts', appId, 'public', 'data', accessCode);
  const documents = [];
  let pageToken;

  do {
    const url = new URL(
      `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${collectionPath}`
    );
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) {
      return [];
    }

    const body = await response.json();
    if (!response.ok) {
      const detail = body.error?.message || JSON.stringify(body);
      throw new Error(`Failed to load Firestore profiles for access code ${accessCode}: ${response.status} ${detail}`);
    }

    const docs = body.documents || [];
    documents.push(...docs.map((doc) => decodeFirestoreDocument(doc)));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return documents;
}

function formatDateKey(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year || '0000'}${parts.month || '00'}${parts.day || '00'}`;
}

function getLocalTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const hour = Number.parseInt(parts.hour ?? '0', 10);
  const minute = Number.parseInt(parts.minute ?? '0', 10);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function parseTimeComponent(value, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function isPastTargetTime({ date, timeZone, hour: targetHour, minute: targetMinute }) {
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  if (hour > targetHour) return true;
  if (hour < targetHour) return false;
  return minute >= targetMinute;
}

async function getReminderStatus({ token, projectId, docPath }) {
  const url = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${docPath}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) return null;

  const body = await response.json();
  if (!response.ok) {
    const detail = body.error?.message || JSON.stringify(body);
    throw new Error(`Failed to read reminder status document: ${response.status} ${detail}`);
  }

  return decodeFirestoreDocument(body);
}

function splitDocPath(docPath) {
  const segments = docPath.split('/');
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new Error(`Invalid Firestore document path: ${docPath}`);
  }
  return {
    collectionPath: segments.slice(0, -1).join('/'),
    docId: segments[segments.length - 1],
  };
}

async function setReminderStatus({ token, projectId, docPath, data }) {
  const url = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${docPath}`;
  const body = encodeFirestoreDocument(data);

  let response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 404) {
    const { collectionPath, docId } = splitDocPath(docPath);
    const createUrl = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${collectionPath}?documentId=${encodeURIComponent(docId)}`;
    response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  const responseBody = await response.json();
  if (!response.ok) {
    const detail = responseBody.error?.message || JSON.stringify(responseBody);
    throw new Error(`Failed to update reminder status document: ${response.status} ${detail}`);
  }

  return decodeFirestoreDocument(responseBody);
}

function parseForceFlag(event) {
  const query = event.queryStringParameters || {};
  if (query.force && /^(1|true|yes|on)$/i.test(String(query.force))) return true;

  if (event.body) {
    try {
      const payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (payload && payload.force) return true;
    } catch (error) {
      // ignore JSON parsing errors for force flag
    }
  }

  if (event.payload) {
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      if (payload && payload.force) return true;
    } catch (error) {
      // ignore JSON parsing errors for force flag
    }
  }

  return false;
}

function buildShareUrl(baseUrl, profile, accessCode) {
  if (!baseUrl || !profile?.id) return '';
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('profile', profile.id);
    if (accessCode) url.searchParams.set('code', accessCode);
    return url.toString();
  } catch (error) {
    console.warn('Invalid PROFILE_SHARE_BASE_URL provided.', error);
    return '';
  }
}

exports.handler = async (event = {}) => {
  const isHttp = typeof event.httpMethod === 'string';
  if (isHttp && event.httpMethod.toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (isHttp && !['POST', 'GET'].includes(event.httpMethod.toUpperCase())) {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    if (!isKakaoWorkAvailable()) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'KakaoWork webhook is not configured.' }),
      };
    }

    const serviceAccount = loadServiceAccount();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
    if (!projectId) {
      throw new Error('Firestore project id is not configured. Set FIREBASE_PROJECT_ID.');
    }

    const appId = process.env.FIREBASE_ARTIFACT_APP_ID || DEFAULT_APP_ID;
    const statusDocPath = process.env.MEETING_REMINDER_STATUS_DOC_PATH || DEFAULT_STATUS_DOC_PATH(appId);
    const timeZone = process.env.MEETING_REMINDER_TIME_ZONE || DEFAULT_TIME_ZONE;
    const shareBase = process.env.PROFILE_SHARE_BASE_URL || '';
    const targetHour = parseTimeComponent(process.env.MEETING_REMINDER_TARGET_HOUR, {
      min: 0,
      max: 23,
      fallback: DEFAULT_SEND_HOUR,
    });
    const targetMinute = parseTimeComponent(process.env.MEETING_REMINDER_TARGET_MINUTE, {
      min: 0,
      max: 59,
      fallback: DEFAULT_SEND_MINUTE,
    });

    const accessToken = await fetchAccessToken(serviceAccount);

    const explicitCodes = (process.env.MEETING_REMINDER_ACCESS_CODES || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const accessCodes = await listAccessCodes({
      token: accessToken,
      projectId,
      appId,
      explicit: explicitCodes,
    });

    if (!accessCodes.length) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, sent: 0, accessCodes: [], reason: 'no_access_codes' }),
      };
    }

    const force = parseForceFlag(event);
    const statusSnapshot = await getReminderStatus({
      token: accessToken,
      projectId,
      docPath: statusDocPath,
    });

    const now = new Date();
    const todayKey = formatDateKey(now, timeZone);

    if (!force && statusSnapshot?.lastSentDateKey === todayKey) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, sent: 0, skipped: true, reason: 'already_sent' }),
      };
    }

    if (!force && !isPastTargetTime({ date: now, timeZone, hour: targetHour, minute: targetMinute })) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          sent: 0,
          skipped: true,
          reason: 'before_target_time',
          targetHour,
          targetMinute,
        }),
      };
    }

    const shareUrlBuilder = shareBase
      ? (profile, code) => buildShareUrl(shareBase, profile, code)
      : undefined;

    const perAccessCodeSummary = {};
    let totalSent = 0;

    for (const accessCode of accessCodes) {
      const profiles = await fetchProfilesForAccessCode({
        token: accessToken,
        projectId,
        appId,
        accessCode,
      });

      const reminders = buildMeetingReminderMessages(profiles, {
        date: now,
        shareUrlBuilder: shareUrlBuilder ? (profile) => shareUrlBuilder(profile, accessCode) : undefined,
        timeZone,
      });

      perAccessCodeSummary[accessCode] = {
        profiles: profiles.length,
        reminders: reminders.length,
      };

      for (const entry of reminders) {
        await postToKakaoWork(entry.text);
        totalSent += 1;
      }
    }

    await setReminderStatus({
      token: accessToken,
      projectId,
      docPath: statusDocPath,
      data: {
        lastSentDateKey: todayKey,
        lastSentAtIso: new Date().toISOString(),
        lastSentCount: totalSent,
        lastAccessCodes: accessCodes,
        lastSummary: perAccessCodeSummary,
        targetHour,
        targetMinute,
      },
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        sent: totalSent,
        accessCodes: perAccessCodeSummary,
        dateKey: todayKey,
        forced: force,
      }),
    };
  } catch (error) {
    console.error('Failed to run scheduled KakaoWork reminder.', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || 'Unexpected error running KakaoWork reminder.' }),
    };
  }
};

exports.config = {
  // Runs daily at 00:00 UTC (09:00 KST)
  schedule: '0 0 0 * * *',
};
