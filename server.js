const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { WebSocketServer } = require('ws');
const { AccessToken } = require('livekit-server-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const PORT = process.env.PORT || 1880;
const PUBLIC = path.join(__dirname, 'public');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-meet-secret-key-32chars';
const JWT_TTL = process.env.JWT_TTL || '30d';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Collab Accounts (central identity). When set, Meet validates tokens against Accounts
// and can proxy login/signup so the suite shares one identity.
const ACCOUNTS_URL = (process.env.ACCOUNTS_URL || 'https://accounts.collab.name.ng').replace(/\/$/, '');
const ACCOUNTS_JWT_SECRET = process.env.ACCOUNTS_JWT_SECRET || process.env.ACCOUNTS_SECRET_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Active meetings (runtime only)
// code -> { name, hostId, hostUserId, historyId, createdAt, participants: Map }
const meetings = new Map();
const clients = new Map();

function generateCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let code;
  do {
    let L = '', N = '';
    for (let i = 0; i < 3; i++) L += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 3; i++) N += digits[Math.floor(Math.random() * digits.length)];
    code = L + N;
  } while (meetings.has(code));
  return code;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Resolve auth: local Meet JWT, or Accounts access token (shared secret or /auth/me). */
async function getAuthUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  // 1) Local Meet JWT
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload && payload.sub != null && payload.type !== 'access') {
      const user = db.getUserById(payload.sub);
      if (user) return { ...user, source: 'meet' };
    }
  } catch (_) {}

  // 2) Accounts JWT via shared secret (same SECRET_KEY as Accounts)
  if (ACCOUNTS_JWT_SECRET) {
    try {
      const payload = jwt.verify(token, ACCOUNTS_JWT_SECRET);
      if (payload && payload.sub && (payload.type === 'access' || !payload.type)) {
        // Prefer live profile from Accounts so we get display_name / email
        if (ACCOUNTS_URL && (!payload.email || !payload.display_name)) {
          try {
            const res = await fetch(ACCOUNTS_URL + '/auth/me', {
              headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
            });
            if (res.ok) {
              const data = await res.json();
              const u = data.user || data;
              return ensureAccountsUser({
                accountsId: String(u.id || payload.sub),
                email: u.email || payload.email || null,
                username: u.username || null,
                displayName: u.display_name || u.username || u.email || null,
              });
            }
          } catch (_) {}
        }
        const linked = ensureAccountsUser({
          accountsId: String(payload.sub),
          email: payload.email || null,
          username: payload.username || payload.display_name || null,
          displayName: payload.display_name || payload.username || null,
        });
        return linked;
      }
    } catch (_) {}
  }

  // 3) Accounts remote validation
  if (ACCOUNTS_URL) {
    try {
      const res = await fetch(ACCOUNTS_URL + '/auth/me', {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const u = data.user || data;
        if (u && (u.id || u.email)) {
          return ensureAccountsUser({
            accountsId: String(u.id),
            email: u.email || null,
            username: u.username || null,
            displayName: u.display_name || u.username || u.email || 'User',
          });
        }
      }
    } catch (e) {
      console.warn('[accounts] /auth/me failed', e.message);
    }
  }

  return null;
}

/** Map an Accounts identity into a local Meet user row for history linkage. */
function isInternalUsername(name) {
  if (!name) return true;
  const s = String(name);
  return s.startsWith('accounts:') || s.startsWith('acc_') || s.endsWith('@accounts.local');
}

function niceDisplayName({ displayName, username, email, accountsId }) {
  const candidates = [displayName, username, email && String(email).split('@')[0], 'User'];
  for (const c of candidates) {
    if (c && !isInternalUsername(c)) return String(c).trim().slice(0, 80);
  }
  return 'User';
}

function ensureAccountsUser({ accountsId, email, username, displayName }) {
  const id = String(accountsId || '').trim();
  const em = (email && String(email).trim().toLowerCase()) || (id ? id + '@accounts.local' : null);
  const pretty = niceDisplayName({ displayName, username, email: em, accountsId: id });

  // Prefer lookup by real email so we don't create duplicate shadow rows
  let user = null;
  if (em && !em.endsWith('@accounts.local')) {
    try { user = db.getUserByEmail(em); } catch (_) {}
  }
  // Legacy rows keyed as accounts:<uuid>
  if (!user && id) {
    try { user = db.getUserByUsername('accounts:' + id); } catch (_) {}
  }
  if (!user && username && !isInternalUsername(username)) {
    try { user = db.getUserByUsername(username); } catch (_) {}
  }

  if (user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: pretty,
      accountsId: id,
      source: 'accounts',
    };
  }

  // Create a shadow local user for history FK — never store accounts:uuid as the visible name
  const base =
    (username && !isInternalUsername(username) && String(username).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16)) ||
    (em && !em.endsWith('@accounts.local') && em.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16)) ||
    'user';
  const uname = ('u' + id.replace(/-/g, '').slice(0, 8) + '_' + base).slice(0, 40).toLowerCase();

  try {
    const created = db.createUser({
      username: uname,
      email: em || (id + '@accounts.local'),
      passwordHash: bcrypt.hashSync('accounts-sso-' + id, 8),
    });
    return {
      id: created.id,
      username: created.username,
      email: created.email,
      displayName: pretty,
      accountsId: id,
      source: 'accounts',
    };
  } catch (e) {
    user = null;
    try { user = db.getUserByEmail(em); } catch (_) {}
    if (!user) {
      try { user = db.getUserByUsername(uname); } catch (_) {}
    }
    if (user) {
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: pretty,
        accountsId: id,
        source: 'accounts',
      };
    }
    console.error('[accounts] ensure user failed', e.message);
    return {
      id: null,
      username: pretty,
      email: em,
      displayName: pretty,
      accountsId: id,
      source: 'accounts',
    };
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

function publicUser(user) {
  if (!user) return null;
  const displayName = niceDisplayName({
    displayName: user.displayName || user.display_name,
    username: user.username,
    email: user.email,
    accountsId: user.accountsId,
  });
  return {
    id: user.id,
    username: isInternalUsername(user.username) ? displayName : (user.username || displayName),
    email: user.email,
    displayName,
    source: user.source || 'meet',
    createdAt: user.created_at,
  };
}

function broadcast(code, message, excludeId = null) {
  const meeting = meetings.get(code);
  if (!meeting) return;
  const payload = JSON.stringify(message);
  for (const [pid] of meeting.participants) {
    if (pid === excludeId) continue;
    const ws = clients.get(pid);
    if (ws && ws.readyState === 1) {
      try { ws.send(payload); } catch (_) {}
    }
  }
}

function getParticipantsList(meeting) {
  return Array.from(meeting.participants.values()).map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    sharing: !!p.sharing,
    userId: p.userId || null,
  }));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

async function createLiveKitToken(identity, name, roomName) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LiveKit is not configured on the server (missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET)');
  }
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: String(identity),
    name: String(name || identity),
    ttl: '6h',
  });
  at.addGrant({
    roomJoin: true,
    room: String(roomName),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await at.toJwt();
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  if (urlPath === '/health' || urlPath === '/api/health') {
    return sendJSON(res, 200, {
      ok: true,
      livekitConfigured: !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL),
      db: db.DB_PATH,
    });
  }

  // ----- Auth / suite config -----
  if (urlPath === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, {
      accountsUrl: ACCOUNTS_URL || null,
      accountsEnabled: !!(ACCOUNTS_URL || ACCOUNTS_JWT_SECRET),
      livekitUrl: LIVEKIT_URL || null,
      livekitConfigured: !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
    });
  }

  if (urlPath === '/api/accounts/login' && req.method === 'POST') {
    if (!ACCOUNTS_URL) return sendJSON(res, 503, { error: 'Accounts not configured' });
    try {
      const body = await parseBody(req);
      const email = (body.email || body.login || '').trim();
      const password = body.password || '';
      if (!email || !password) return sendJSON(res, 400, { error: 'Email and password required' });
      const resA = await fetch(ACCOUNTS_URL + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await resA.json().catch(() => ({}));
      if (!resA.ok) {
        const detail = data.detail || data.error || 'Login failed';
        return sendJSON(res, resA.status, { error: typeof detail === 'string' ? detail : 'Login failed' });
      }
      const access = data.access_token;
      const u = data.user || {};
      const linked = ensureAccountsUser({
        accountsId: String(u.id),
        email: u.email,
        username: u.username,
        displayName: u.display_name || u.username || u.email,
      });
      return sendJSON(res, 200, {
        token: access,
        user: publicUser({ ...linked, displayName: u.display_name || linked.username }),
        products: u.products || [],
      });
    } catch (e) {
      console.error('[accounts/login]', e);
      return sendJSON(res, 502, { error: e.message || 'Accounts unreachable' });
    }
  }

  if (urlPath === '/api/accounts/signup' && req.method === 'POST') {
    if (!ACCOUNTS_URL) return sendJSON(res, 503, { error: 'Accounts not configured' });
    try {
      const body = await parseBody(req);
      const payload = {
        email: (body.email || '').trim(),
        password: body.password || '',
        display_name: (body.display_name || body.username || body.displayName || '').trim(),
      };
      if (body.username) payload.username = body.username;
      if (!payload.email || !payload.password || !payload.display_name) {
        return sendJSON(res, 400, { error: 'Email, password and name are required' });
      }
      const resA = await fetch(ACCOUNTS_URL + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resA.json().catch(() => ({}));
      if (!resA.ok) {
        const detail = data.detail || data.error || 'Signup failed';
        return sendJSON(res, resA.status, { error: typeof detail === 'string' ? detail : 'Signup failed' });
      }
      const access = data.access_token;
      const u = data.user || {};
      const linked = ensureAccountsUser({
        accountsId: String(u.id),
        email: u.email,
        username: u.username,
        displayName: u.display_name || u.username || u.email,
      });
      return sendJSON(res, 200, {
        token: access,
        user: publicUser({ ...linked, displayName: u.display_name || linked.username }),
        products: u.products || [],
      });
    } catch (e) {
      console.error('[accounts/signup]', e);
      return sendJSON(res, 502, { error: e.message || 'Accounts unreachable' });
    }
  }

  if (urlPath === '/api/signup' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const username = (body.username || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (!isValidUsername(username)) {
        return sendJSON(res, 400, { error: 'Username must be 3–24 chars (letters, numbers, underscore)' });
      }
      if (!isValidEmail(email)) {
        return sendJSON(res, 400, { error: 'Invalid email address' });
      }
      if (typeof password !== 'string' || password.length < 6) {
        return sendJSON(res, 400, { error: 'Password must be at least 6 characters' });
      }
      if (password.length > 128) {
        return sendJSON(res, 400, { error: 'Password too long' });
      }

      if (db.getUserByUsername(username)) {
        return sendJSON(res, 409, { error: 'Username already taken' });
      }
      if (db.getUserByEmail(email)) {
        return sendJSON(res, 409, { error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = db.createUser({ username, email, passwordHash });
      const token = signToken(user);
      return sendJSON(res, 201, { token, user: publicUser(user) });
    } catch (e) {
      console.error('[signup]', e);
      return sendJSON(res, 500, { error: e.message || 'Signup failed' });
    }
  }

  if (urlPath === '/api/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const login = (body.login || body.email || body.username || '').trim();
      const password = body.password || '';

      if (!login || !password) {
        return sendJSON(res, 400, { error: 'Login and password are required' });
      }

      // Prefer Collab Accounts when configured (suite SSO)
      if (ACCOUNTS_URL) {
        try {
          const resA = await fetch(ACCOUNTS_URL + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ email: login, password }),
          });
          const data = await resA.json().catch(() => ({}));
          if (resA.ok && data.access_token) {
            const u = data.user || {};
            const linked = ensureAccountsUser({
              accountsId: String(u.id),
              email: u.email,
              username: u.username,
              displayName: u.display_name || u.username || u.email,
            });
            return sendJSON(res, 200, {
              token: data.access_token,
              user: publicUser({ ...linked, displayName: u.display_name || linked.username }),
              products: u.products || [],
            });
          }
          // If Accounts rejects, fall through to local only when identity is not an email-looking Accounts attempt
          // Still surface Accounts error for email logins
          if (login.includes('@')) {
            const detail = data.detail || data.error || 'Invalid credentials';
            return sendJSON(res, 401, { error: typeof detail === 'string' ? detail : 'Invalid credentials' });
          }
        } catch (e) {
          console.warn('[login] Accounts unreachable, trying local:', e.message);
        }
      }

      const row = db.findUserByLogin(login);
      if (!row) {
        return sendJSON(res, 401, { error: 'Invalid credentials' });
      }
      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) {
        return sendJSON(res, 401, { error: 'Invalid credentials' });
      }

      const user = publicUser(row);
      const token = signToken(user);
      return sendJSON(res, 200, { token, user });
    } catch (e) {
      console.error('[login]', e);
      return sendJSON(res, 500, { error: e.message || 'Login failed' });
    }
  }

  if (urlPath === '/api/me' && req.method === 'GET') {
    const user = await getAuthUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Not authenticated' });
    return sendJSON(res, 200, { user: publicUser(user) });
  }

  if (urlPath === '/api/history' && req.method === 'GET') {
    const user = await getAuthUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Not authenticated' });
    const limit = Math.min(100, Math.max(1, parseInt(parsed.searchParams.get('limit') || '50', 10)));
    const rows = db.getHistoryForUser(user.id, limit);
    return sendJSON(res, 200, {
      history: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        hostDisplayName: r.host_display_name,
        createdAt: r.created_at,
        endedAt: r.ended_at,
        maxParticipants: r.max_participants,
        wasHost: !!r.was_host,
      })),
    });
  }

  if (urlPath.startsWith('/api/history/') && req.method === 'GET') {
    const user = await getAuthUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Not authenticated' });
    const id = parseInt(urlPath.split('/').pop(), 10);
    if (!id) return sendJSON(res, 400, { error: 'Invalid id' });
    const meeting = db.getMeetingHistoryById(id);
    if (!meeting) return sendJSON(res, 404, { error: 'Not found' });
    // Only host or someone who joined can view
    const participants = db.getMeetingParticipantsLog(id);
    const allowed =
      meeting.host_user_id === user.id ||
      participants.some((p) => p.user_id === user.id);
    if (!allowed) return sendJSON(res, 403, { error: 'Forbidden' });
    return sendJSON(res, 200, {
      meeting: {
        id: meeting.id,
        code: meeting.code,
        name: meeting.name,
        hostDisplayName: meeting.host_display_name,
        createdAt: meeting.created_at,
        endedAt: meeting.ended_at,
        maxParticipants: meeting.max_participants,
      },
      participants: participants.map((p) => ({
        displayName: p.display_name,
        userId: p.user_id,
        joinedAt: p.joined_at,
        leftAt: p.left_at,
      })),
    });
  }

  // LiveKit token
  if (urlPath === '/api/livekit-token' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const code = (body.code || '').toUpperCase();
      const participantId = body.participantId;
      const participantName = (body.participantName || 'Guest').trim() || 'Guest';

      if (!code || !participantId) {
        return sendJSON(res, 400, { error: 'code and participantId are required' });
      }

      const meeting = meetings.get(code);
      if (!meeting) return sendJSON(res, 404, { error: 'Meeting not found' });
      if (!meeting.participants.has(participantId)) {
        return sendJSON(res, 403, { error: 'Not a participant of this meeting' });
      }

      const token = await createLiveKitToken(participantId, participantName, code);
      return sendJSON(res, 200, { token, url: LIVEKIT_URL, room: code });
    } catch (e) {
      console.error('[livekit-token]', e.message);
      return sendJSON(res, 500, { error: e.message || 'Failed to create token' });
    }
  }

  if (urlPath === '/api/create' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const name = (body.name || '').trim();
      if (!name || name.length < 2) return sendJSON(res, 400, { error: 'Meeting name must be at least 2 characters' });
      if (name.length > 60) return sendJSON(res, 400, { error: 'Meeting name too long' });

      const authUser = await getAuthUser(req);
      const code = generateCode();
      const hostId = body.participantId || 'host-' + Date.now();
      const hostName = (body.participantName || authUser?.displayName || (!authUser?.username || isInternalUsername(authUser.username) ? null : authUser.username) || (authUser?.email && authUser.email.split('@')[0]) || 'Host').trim() || 'Host';

      const historyId = db.startMeetingHistory({
        code,
        name,
        hostUserId: authUser ? authUser.id : null,
        hostDisplayName: hostName,
      });

      db.logParticipantJoin({
        meetingHistoryId: historyId,
        userId: authUser ? authUser.id : null,
        displayName: hostName,
        participantId: hostId,
      });

      const participants = new Map();
      participants.set(hostId, {
        id: hostId,
        name: hostName,
        isHost: true,
        sharing: false,
        userId: authUser ? authUser.id : null,
      });

      meetings.set(code, {
        name,
        hostId,
        hostUserId: authUser ? authUser.id : null,
        historyId,
        createdAt: Date.now(),
        participants,
      });

      return sendJSON(res, 200, {
        code,
        letters: code.slice(0, 3),
        numbers: code.slice(3),
        name,
        hostId,
        participantId: hostId,
        participants: getParticipantsList(meetings.get(code)),
      });
    } catch (e) {
      console.error('[create]', e);
      return sendJSON(res, 400, { error: e.message || 'Bad request' });
    }
  }

  if (urlPath === '/api/join' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const letters = (body.letters || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      const numbers = (body.numbers || '').replace(/\D/g, '').slice(0, 3);
      const code = letters + numbers;

      if (letters.length !== 3 || numbers.length !== 3) {
        return sendJSON(res, 400, { error: 'Enter 3 letters and 3 numbers' });
      }

      const meeting = meetings.get(code);
      if (!meeting) return sendJSON(res, 404, { error: 'Meeting not found. Check the code.' });
      if (meeting.participants.size >= 20) {
        return sendJSON(res, 403, { error: 'Meeting is full (max 20)' });
      }

      const authUser = await getAuthUser(req);
      const participantId = body.participantId || 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const participantName = (body.participantName || authUser?.displayName || (!authUser?.username || isInternalUsername(authUser.username) ? null : authUser.username) || (authUser?.email && authUser.email.split('@')[0]) || 'Guest').trim() || 'Guest';

      if (!meeting.participants.has(participantId)) {
        meeting.participants.set(participantId, {
          id: participantId,
          name: participantName,
          isHost: false,
          sharing: false,
          userId: authUser ? authUser.id : null,
        });

        if (meeting.historyId) {
          db.logParticipantJoin({
            meetingHistoryId: meeting.historyId,
            userId: authUser ? authUser.id : null,
            displayName: participantName,
            participantId,
          });
          db.updateMaxParticipants(meeting.historyId, meeting.participants.size);
        }
      }

      broadcast(code, {
        type: 'participant-joined',
        participantId,
        participants: getParticipantsList(meeting),
      }, participantId);

      return sendJSON(res, 200, {
        code,
        letters: code.slice(0, 3),
        numbers: code.slice(3),
        name: meeting.name,
        participantId,
        participants: getParticipantsList(meeting),
      });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message || 'Bad request' });
    }
  }

  if (urlPath.startsWith('/api/meeting/') && req.method === 'GET') {
    const code = urlPath.split('/').pop().toUpperCase();
    const meeting = meetings.get(code);
    if (!meeting) return sendJSON(res, 404, { error: 'Meeting not found' });
    return sendJSON(res, 200, {
      code,
      letters: code.slice(0, 3),
      numbers: code.slice(3),
      name: meeting.name,
      participants: getParticipantsList(meeting),
      createdAt: meeting.createdAt,
    });
  }

  if (urlPath === '/api/leave' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const code = (body.code || '').toUpperCase();
      const participantId = body.participantId;
      const meeting = meetings.get(code);
      if (meeting && participantId) {
        meeting.participants.delete(participantId);
        clients.delete(participantId);

        if (meeting.historyId) {
          db.logParticipantLeave({
            meetingHistoryId: meeting.historyId,
            participantId,
          });
        }

        if (meeting.participants.size === 0) {
          if (meeting.historyId) db.endMeetingHistory(meeting.historyId);
          meetings.delete(code);
        } else {
          broadcast(code, {
            type: 'participant-left',
            participantId,
            participants: getParticipantsList(meeting),
          });
        }
      }
      return sendJSON(res, 200, { ok: true });
    } catch {
      return sendJSON(res, 400, { error: 'Bad request' });
    }
  }

  // Static files
  let staticPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC, path.normalize(staticPath).replace(/^(\.\.[/\\])+/, ''));

  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          });
          res.end(html);
        });
        return;
      }
      res.writeHead(500);
      return res.end('Server error');
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // HTML always revalidate; hashed/query-busted assets can be short-cached
    const cache =
      ext === '.html' || staticPath === '/index.html'
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=60, must-revalidate';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': cache,
    });
    res.end(data);
  });
});

// ----- WebSocket -----
const wss = new WebSocketServer({ server, path: '/' });

server.on('upgrade', (req) => {
  console.log(
    `[WS UPGRADE] ${new Date().toISOString()} url=${req.url} origin=${req.headers.origin || '-'} ` +
    `host=${req.headers.host || '-'} upgrade-header=${req.headers.upgrade || '-'}`
  );
});

wss.on('connection', (ws, req) => {
  let participantId = null;
  let meetingCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'register') {
      participantId = msg.participantId;
      meetingCode = (msg.code || '').toUpperCase();

      const old = clients.get(participantId);
      if (old && old !== ws) {
        try { old.close(); } catch (_) {}
      }
      clients.set(participantId, ws);

      const meeting = meetings.get(meetingCode);
      if (meeting) {
        ws.send(JSON.stringify({
          type: 'participants',
          participants: getParticipantsList(meeting),
        }));
      }
      return;
    }

    if (!participantId || !meetingCode) return;
    const meeting = meetings.get(meetingCode);
    if (!meeting) return;

    if (msg.type === 'start-share') {
      const p = meeting.participants.get(participantId);
      if (p) {
        p.sharing = true;
        broadcast(meetingCode, {
          type: 'share-started',
          participantId,
          participants: getParticipantsList(meeting),
        });
      }
      return;
    }

    if (msg.type === 'stop-share') {
      const p = meeting.participants.get(participantId);
      if (p) {
        p.sharing = false;
        broadcast(meetingCode, {
          type: 'share-stopped',
          participantId,
          participants: getParticipantsList(meeting),
        });
      }
      return;
    }
  });

  ws.on('close', () => {
    if (participantId && clients.get(participantId) === ws) {
      clients.delete(participantId);
    }
  });

  ws.on('error', () => {
    if (participantId && clients.get(participantId) === ws) {
      clients.delete(participantId);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Meet is running at http://0.0.0.0:${PORT}`);
  console.log(`[DB] SQLite at ${db.DB_PATH}`);
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.warn('[WARN] LiveKit env vars not fully set — screenshare/audio need LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.');
  } else {
    console.log(`[LiveKit] clients will connect to ${LIVEKIT_URL}`);
  }
  if (JWT_SECRET === 'change-me-in-production-meet-secret-key-32chars') {
    console.warn('[WARN] Using default JWT_SECRET — set JWT_SECRET in production.');
  }
  if (ACCOUNTS_URL) {
    console.log(`[Accounts] SSO enabled → ${ACCOUNTS_URL}`);
  } else {
    console.log('[Accounts] ACCOUNTS_URL not set — using local Meet auth only');
  }
});
