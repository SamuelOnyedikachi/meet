(function () {
  const $ = (id) => document.getElementById(id);

  const homeView = $('homeView');
  const meetingView = $('meetingView');
  const historyView = $('historyView');
  const col1 = $('col1');
  const resizer = $('resizer');
  const themeToggle = $('themeToggle');
  const fullscreenBtn = $('fullscreenBtn');
  const leaveBtn = $('leaveBtn');
  const meetingBadge = $('meetingBadge');
  const copyCodeBtn = $('copyCodeBtn');

  const createName = $('createName');
  const createYourName = $('createYourName');
  const createBtn = $('createBtn');
  const createError = $('createError');
  const joinLetters = $('joinLetters');
  const joinNumbers = $('joinNumbers');
  const joinYourName = $('joinYourName');
  const joinBtn = $('joinBtn');
  const joinError = $('joinError');

  const participantList = $('participantList');
  const participantCount = $('participantCount');
  const screenCards = $('screenCards');
  const remoteVideo = $('remoteVideo');
  const bigPlaceholder = $('bigPlaceholder');
  const bigViewLabel = $('bigViewLabel');
  const bigView = $('bigView');
  const screenFsBtn = $('screenFsBtn');
  const shareBtn = $('shareBtn');
  const micBtn = $('micBtn');

  const authArea = $('authArea');
  const userArea = $('userArea');
  const userLabel = $('userLabel');
  const loginOpenBtn = $('loginOpenBtn');
  const signupOpenBtn = $('signupOpenBtn');
  const logoutBtn = $('logoutBtn');
  const historyBtn = $('historyBtn');
  const historyCloseBtn = $('historyCloseBtn');
  const historyList = $('historyList');
  const historyEmpty = $('historyEmpty');
  const historyDetail = $('historyDetail');
  const historyDetailTitle = $('historyDetailTitle');
  const historyDetailMeta = $('historyDetailMeta');
  const historyDetailParticipants = $('historyDetailParticipants');
  const historyDetailBack = $('historyDetailBack');

  const authModal = $('authModal');
  const authModalBackdrop = $('authModalBackdrop');
  const authModalClose = $('authModalClose');
  const tabLogin = $('tabLogin');
  const tabSignup = $('tabSignup');
  const loginForm = $('loginForm');
  const signupForm = $('signupForm');
  const loginError = $('loginError');
  const signupError = $('signupError');

  let currentMeeting = null;
  let participants = [];
  let ws = null;
  let isSharing = false;
  let micOn = false;
  let watchingId = null;
  let pollTimer = null;
  let wsRetryTimer = null;
  let wsAttempt = 0;

  let room = null;
  let livekitUrl = null;
  const remoteMedia = {};
  const LK = window.LivekitClient || window.livekit;

  let authToken = localStorage.getItem('meet_token') || null;
  let currentUser = null;
  let accountsEnabled = false;

  const SESSION_KEY = 'meet_session';

  /** Parse meeting code from path: /ABC-123, /ABC/123, /abc123 */
  function parseMeetingCodeFromPath(pathname) {
    const path = (pathname || location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/' || path.startsWith('/api')) return null;
    // /ABC-123 or /ABC_123
    let m = path.match(/^\/([A-Za-z]{3})[-_](\d{3})$/);
    if (m) return (m[1] + m[2]).toUpperCase();
    // /ABC/123
    m = path.match(/^\/([A-Za-z]{3})\/(\d{3})$/);
    if (m) return (m[1] + m[2]).toUpperCase();
    // /ABC123
    m = path.match(/^\/([A-Za-z]{3})(\d{3})$/);
    if (m) return (m[1] + m[2]).toUpperCase();
    return null;
  }

  function meetingPath(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) return '/';
    return '/' + c.slice(0, 3) + '-' + c.slice(3);
  }

  function setMeetingUrl(code, replace) {
    const path = meetingPath(code);
    if (location.pathname === path) return;
    if (replace) history.replaceState({ meet: code }, '', path);
    else history.pushState({ meet: code }, '', path);
  }

  function clearMeetingUrl(replace) {
    if (location.pathname === '/' || location.pathname === '') return;
    if (replace) history.replaceState({}, '', '/');
    else history.pushState({}, '', '/');
  }

  function saveSession(meeting) {
    if (!meeting) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        code: meeting.code,
        participantId: meeting.participantId,
        participantName: meeting.participantName,
        isHost: !!meeting.isHost,
      }));
    } catch (_) {}
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /** Display name is required — reject empty or generic Guest/Host-only labels. */
  function isValidDisplayName(name) {
    const n = (name || '').trim();
    if (n.length < 2) return false;
    if (/^(guest|host)$/i.test(n)) return false;
    return true;
  }

  function normalizeDisplayName(name) {
    return (name || '').trim().slice(0, 40);
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function hideError(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.textContent = '';
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (authToken) headers.Authorization = 'Bearer ' + authToken;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function formatCode(letters, numbers) {
    return `${letters}—${numbers}`;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  // ----- Auth UI -----

  function displayNameOf(u) {
    if (!u) return '';
    const bad = (v) => !v || /^accounts:/.test(v) || /^acc_/.test(v) || /@accounts\.local$/.test(v);
    const emailName = u.email && String(u.email).split('@')[0];
    for (const c of [u.displayName, u.display_name, u.username, emailName]) {
      if (c && !bad(c)) return String(c);
    }
    return 'User';
  }

  function updateAuthUI() {
    if (currentUser) {
      authArea?.classList.add('hidden');
      userArea?.classList.remove('hidden');
      const name = displayNameOf(currentUser);
      if (userLabel) userLabel.textContent = name;
      try { if (typeof applySelfChatColor === 'function') applySelfChatColor(); } catch (_) {}
      if (createYourName && !createYourName.value) createYourName.value = name;
      if (joinYourName && !joinYourName.value) joinYourName.value = name;
    } else {
      authArea?.classList.remove('hidden');
      userArea?.classList.add('hidden');
    }
    // Keep mobile overflow menu in sync
    document.querySelectorAll('.more-history, .more-logout').forEach((el) => {
      el.classList.toggle('hidden', !currentUser);
    });
    document.querySelectorAll('.more-login, .more-signup').forEach((el) => {
      el.classList.toggle('hidden', !!currentUser);
    });
  }

  function openAuthModal(tab) {
    authModal?.classList.remove('hidden');
    if (tab === 'signup') {
      tabSignup?.classList.add('active');
      tabLogin?.classList.remove('active');
      signupForm?.classList.remove('hidden');
      loginForm?.classList.add('hidden');
    } else {
      tabLogin?.classList.add('active');
      tabSignup?.classList.remove('active');
      loginForm?.classList.remove('hidden');
      signupForm?.classList.add('hidden');
    }
    hideError(loginError);
    hideError(signupError);
  }

  function closeAuthModal() {
    authModal?.classList.add('hidden');
  }

  async function loadConfig() {
    try {
      const cfg = await api('/api/config');
      accountsEnabled = !!cfg.accountsEnabled;
      livekitUrl = cfg.livekitUrl || livekitUrl || null;
      if (cfg.features && typeof window.MeetBoot === 'function') {
        window.MeetBoot(cfg.features);
      }
    } catch {
      accountsEnabled = false;
    }
  }

  async function restoreSession() {
    await loadConfig();
    if (!authToken) {
      updateAuthUI();
      return;
    }
    try {
      const data = await api('/api/me');
      currentUser = data.user;
    } catch {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('meet_token');
    }
    updateAuthUI();
  }

  loginOpenBtn?.addEventListener('click', () => openAuthModal('login'));
  signupOpenBtn?.addEventListener('click', () => openAuthModal('signup'));
  authModalClose?.addEventListener('click', closeAuthModal);
  authModalBackdrop?.addEventListener('click', closeAuthModal);
  tabLogin?.addEventListener('click', () => openAuthModal('login'));
  tabSignup?.addEventListener('click', () => openAuthModal('signup'));

  // Mobile overflow menu (theme / fullscreen / auth)
  const moreMenuBtn = $('moreMenuBtn');
  const moreMenu = $('moreMenu');
  function closeMoreMenu() {
    moreMenu?.classList.add('hidden');
    moreMenuBtn?.setAttribute('aria-expanded', 'false');
  }
  moreMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = moreMenu?.classList.toggle('hidden') === false;
    moreMenuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!moreMenu || moreMenu.classList.contains('hidden')) return;
    if (moreMenu.contains(e.target) || moreMenuBtn?.contains(e.target)) return;
    closeMoreMenu();
  });
  moreMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('.more-item');
    if (!item) return;
    const action = item.dataset.action;
    closeMoreMenu();
    if (action === 'theme') themeToggle?.click();
    else if (action === 'fullscreen') fullscreenBtn?.click();
    else if (action === 'history') historyBtn?.click();
    else if (action === 'logout') logoutBtn?.click();
    else if (action === 'login') openAuthModal('login');
    else if (action === 'signup') openAuthModal('signup');
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(loginError);
    try {
      const identity = $('loginIdentity')?.value?.trim();
      const password = $('loginPassword')?.value;
      if (!identity || !password) {
        showError(loginError, 'Email and password are required');
        return;
      }
      await loadConfig();
      let data;
      // Always try suite Accounts SSO first (email + password from Collab Accounts)
      try {
        data = await api('/api/accounts/login', {
          method: 'POST',
          body: JSON.stringify({ email: identity, login: identity, password }),
        });
      } catch (accountsErr) {
        // If Accounts is not configured on server, fall back to local Meet auth
        const msg = (accountsErr && accountsErr.message) || '';
        if (/not configured|503|unreachable|Failed to fetch|NetworkError/i.test(msg) && !accountsEnabled) {
          data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ login: identity, email: identity, password }),
          });
        } else {
          throw accountsErr;
        }
      }
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('meet_token', authToken);
      updateAuthUI();
      closeAuthModal();
    } catch (err) {
      showError(loginError, err.message || 'Invalid credentials');
    }
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(signupError);
    try {
      const username = $('signupUsername')?.value?.trim();
      const email = $('signupEmail')?.value?.trim();
      const password = $('signupPassword')?.value;
      let data;
      try {
        data = await api('/api/accounts/signup', {
          method: 'POST',
          body: JSON.stringify({
            username,
            email,
            password,
            display_name: username,
          }),
        });
      } catch (accountsErr) {
        const msg = (accountsErr && accountsErr.message) || '';
        if (/not configured|503|unreachable|Failed to fetch|NetworkError/i.test(msg) && !accountsEnabled) {
          data = await api('/api/signup', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
          });
        } else {
          throw accountsErr;
        }
      }
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('meet_token', authToken);
      updateAuthUI();
      closeAuthModal();
    } catch (err) {
      showError(signupError, err.message);
    }
  });

  logoutBtn?.addEventListener('click', () => {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('meet_token');
    updateAuthUI();
    if (historyView && !historyView.classList.contains('hidden')) {
      showHome();
    }
  });

  // ----- History -----

  function showHome() {
    historyView?.classList.add('hidden');
    meetingView?.classList.add('hidden');
    homeView?.classList.remove('hidden');
  }

  async function showHistory() {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    homeView?.classList.add('hidden');
    meetingView?.classList.add('hidden');
    historyView?.classList.remove('hidden');
    historyDetail?.classList.add('hidden');
    historyList?.classList.remove('hidden');

    try {
      const data = await api('/api/history');
      const items = data.history || [];
      if (!historyList) return;
      historyList.innerHTML = '';
      if (items.length === 0) {
        historyEmpty?.classList.remove('hidden');
        return;
      }
      historyEmpty?.classList.add('hidden');
      items.forEach((h) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        const status = h.endedAt ? 'Ended' : 'Active / open';
        li.innerHTML = `
          <div class="history-item-main">
            <strong>${escapeHtml(h.name)}</strong>
            <span class="history-code">${escapeHtml(h.code.slice(0, 3))}—${escapeHtml(h.code.slice(3))}</span>
          </div>
          <div class="history-item-meta">
            ${h.wasHost ? '<span class="tag">Host</span>' : '<span class="tag">Joined</span>'}
            <span>${formatDate(h.createdAt)}</span>
            <span>${status}</span>
            <span>${h.maxParticipants} people max</span>
          </div>
        `;
        li.addEventListener('click', () => openHistoryDetail(h.id));
        historyList.appendChild(li);
      });
    } catch (e) {
      if (historyEmpty) {
        historyEmpty.classList.remove('hidden');
        historyEmpty.textContent = e.message;
      }
    }
  }

  async function openHistoryDetail(id) {
    try {
      const data = await api('/api/history/' + id);
      historyList?.classList.add('hidden');
      historyEmpty?.classList.add('hidden');
      historyDetail?.classList.remove('hidden');
      if (historyDetailTitle) historyDetailTitle.textContent = data.meeting.name;
      if (historyDetailMeta) {
        historyDetailMeta.textContent =
          `Code ${data.meeting.code.slice(0, 3)}—${data.meeting.code.slice(3)} · ` +
          `Started ${formatDate(data.meeting.createdAt)} · ` +
          (data.meeting.endedAt ? `Ended ${formatDate(data.meeting.endedAt)}` : 'Still open / not ended') +
          ` · Max ${data.meeting.maxParticipants} participants`;
      }
      if (historyDetailParticipants) {
        historyDetailParticipants.innerHTML = '';
        (data.participants || []).forEach((p) => {
          const li = document.createElement('li');
          li.textContent =
            `${p.displayName} · joined ${formatDate(p.joinedAt)}` +
            (p.leftAt ? ` · left ${formatDate(p.leftAt)}` : ' · (no leave recorded)');
          historyDetailParticipants.appendChild(li);
        });
      }
    } catch (e) {
      alert(e.message);
    }
  }

  historyBtn?.addEventListener('click', showHistory);
  historyCloseBtn?.addEventListener('click', showHome);
  historyDetailBack?.addEventListener('click', () => {
    historyDetail?.classList.add('hidden');
    showHistory();
  });

  // ----- WebSocket -----

  const WS_CLOSE_CODES = {
    1000: 'Normal closure', 1001: 'Going away', 1006: 'Abnormal closure',
  };

  let wsStatusEl = null;
  function setWsStatus(text, isError) {
    const live = document.getElementById('liveStatus');
    const liveText = document.getElementById('liveStatusText');
    const raw = String(text || '').toLowerCase();

    let label = text;
    let state = 'idle';
    if (isError || /fail|error|closed|left/.test(raw)) {
      label = /left/.test(raw) ? 'Left' : 'Offline';
      state = 'error';
    } else if (/connect/.test(raw) && !/connected/.test(raw)) {
      label = 'Connecting…';
      state = 'connecting';
    } else if (/connected|open|live|ok/.test(raw)) {
      label = 'Live';
      state = 'live';
    }

    if (live && liveText) {
      liveText.textContent = label;
      live.classList.remove('is-live', 'is-connecting', 'is-error', 'is-idle');
      live.classList.add('is-' + state);
      live.classList.remove('hidden');
    }

    // Keep a minimal non-debug footer hint only while developing is not needed —
    // remove floating WS overlay if present.
    if (wsStatusEl) {
      try { wsStatusEl.remove(); } catch (_) {}
      wsStatusEl = null;
    }
  }

  function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host || location.hostname;
    return host ? proto + '//' + host : null;
  }

  function connectWS() {
    if (!currentMeeting) return;
    const url = getWsUrl();
    if (!url) return;

    if (ws) {
      try { ws.onclose = null; ws.close(); } catch (_) {}
      ws = null;
    }

    wsAttempt += 1;
    setWsStatus('connecting...');
    let socket;
    try { socket = new WebSocket(url); } catch (err) {
      setWsStatus('failed', true);
      scheduleWsRetry();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      setWsStatus('connected');
      sendWS({ type: 'register', participantId: currentMeeting.participantId, code: currentMeeting.code });
      // If we already published screen before WS was ready, re-announce so late joiners see our card
      if (isSharing) {
        sendWS({ type: 'start-share' });
      }
    };

    socket.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'meeting-ended') {
        // Server closed the room (empty or 12h inactivity)
        stopPolling();
        if (wsRetryTimer) clearTimeout(wsRetryTimer);
        if (ws) { try { ws.onclose = null; ws.close(); } catch (_) {} ws = null; }
        disconnectLiveKit();
        clearBigView();
        currentMeeting = null;
        participants = [];
        saveSession(null);
        clearMeetingUrl(true);
        meetingView?.classList.add('hidden');
        homeView?.classList.remove('hidden');
        leaveBtn?.classList.add('hidden');
        meetingBadge?.classList.add('hidden');
        copyCodeBtn?.classList.add('hidden');
        setWsStatus('ended');
        return;
      }
      if (msg.type === 'participants' || msg.type === 'participant-joined' ||
          msg.type === 'participant-left' || msg.type === 'share-started' || msg.type === 'share-stopped') {
        participants = msg.participants || [];
        // LiveKit is source of truth for who is actually publishing screen —
        // merge so late joiners still see cards even if WS sharing flag was missed
        try { syncSharingFlagsFromLiveKit(); } catch (_) {
          renderParticipants();
          renderCards();
        }
        if ((msg.type === 'participant-left' || msg.type === 'share-stopped') && watchingId === msg.participantId) {
          clearBigView();
        }
        return;
      }
      if (msg.type === 'chat') {
        appendChatMessage(msg);
        return;
      }
      if (msg.type === 'chat-history') {
        var box = $('chatMessages');
        if (box) box.innerHTML = '';
        (msg.messages || []).forEach(function (m) { appendChatMessage(m); });
        return;
      }
      if (msg.type === 'reaction') {
        showReaction(msg);
        return;
      }
      if (msg.type === 'force-mute') {
        forceMuteLocal(msg);
        return;
      }
      if (msg.type === 'content-state') {
        applyContentState(msg.content);
        return;
      }
      if (msg.type === 'content-update') {
        applyContentUpdate(msg.content, msg.from);
        return;
      }
    };

    socket.onclose = () => {
      setWsStatus('closed', true);
      if (ws === socket) ws = null;
      if (currentMeeting) scheduleWsRetry();
    };
    socket.onerror = () => setWsStatus('error', true);
  }

  function scheduleWsRetry() {
    if (wsRetryTimer) clearTimeout(wsRetryTimer);
    wsRetryTimer = setTimeout(() => {
      wsRetryTimer = null;
      if (currentMeeting) connectWS();
    }, 2000);
  }

  function sendWS(obj) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch (_) {}
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!currentMeeting) return;
      try {
        const data = await api('/api/meeting/' + currentMeeting.code);
        const next = data.participants || [];
        const prevKey = participants.map(p => p.id + ':' + !!p.sharing).join('|');
        const nextKey = next.map(p => p.id + ':' + !!p.sharing).join('|');
        if (prevKey !== nextKey) {
          participants = next;
          renderParticipants();
          renderCards();
          if (watchingId) {
            const still = next.find(p => p.id === watchingId && p.sharing);
            if (!still) clearBigView();
          }
        }
      } catch (e) {
        // Meeting no longer exists (ended / 12h inactivity)
        if (e && /not found|404/i.test(String(e.message || e))) {
          leaveMeeting();
        }
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ----- LiveKit -----

  async function connectLiveKit() {
    if (!LK || !currentMeeting) return;

    let tokenData;
    try {
      tokenData = await api('/api/livekit-token', {
        method: 'POST',
        body: JSON.stringify({
          code: currentMeeting.code,
          participantId: currentMeeting.participantId,
          participantName: currentMeeting.participantName,
        }),
      });
    } catch (e) {
      console.error('LiveKit token error', e);
      alert('Could not get media token: ' + e.message);
      return;
    }

    const url = tokenData.url || livekitUrl;
    if (!url) {
      alert('LiveKit URL is not configured (LIVEKIT_URL).');
      return;
    }

    await disconnectLiveKit();

    // adaptiveStream can leave screen-share black if the video element
    // reports 0 size during layout; this app only shows one big screen so
    // we turn it off for reliability.
    // Audio-first on poor networks: Opus with DTX, lower video priority.
    // adaptiveStream off avoids black screen-share when layout size is 0.
    // Screen share: prioritize resolution for video (YouTube etc.).
    // Audio stays speech-optimized; screen video needs higher bitrate/fps than slides.
    room = new LK.Room({
      adaptiveStream: false,
      dynacast: false,
      reconnectPolicy: {
        nextRetryDelayInMs: (context) => Math.min(1000 * Math.pow(2, context.retryCount || 0), 15000),
      },
      publishDefaults: {
        videoCodec: 'vp8',
        audioPreset: LK.AudioPresets?.speech || undefined,
        dtx: true,
        red: true,
        // High ceiling; actual bitrate chosen by send quality (high/medium/low)
        screenShareEncoding: {
          maxBitrate: 10_000_000,
          maxFramerate: 30,
        },
        videoEncoding: {
          maxBitrate: 1_500_000,
          maxFramerate: 24,
        },
        degradationPreference: 'maintain-resolution',
      },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    room
      .on(LK.RoomEvent.TrackSubscribed, handleTrackSubscribed)
      .on(LK.RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      .on(LK.RoomEvent.ParticipantDisconnected, (p) => {
        cleanupRemoteMedia(p.identity);
        if (watchingId === p.identity) clearBigView();
      })
      .on(LK.RoomEvent.LocalTrackPublished, (pub) => {
        console.log('[LiveKit] LocalTrackPublished', {
          source: pub.source,
          kind: pub.kind,
          trackSid: pub.trackSid,
          muted: pub.isMuted,
        });
        if (pub.source === LK.Track.Source.ScreenShare) {
          isSharing = true;
          updateShareButton();
          sendWS({ type: 'start-share' });
          const me = participants.find(p => p.id === currentMeeting.participantId);
          if (me) me.sharing = true;
          renderCards();
          // Show own shared screen in the main view (clicking the card must not stop share)
          if (currentMeeting?.participantId) {
            watchingId = null; // force re-attach
            watchParticipant(currentMeeting.participantId);
          }
        }
      })
      .on(LK.RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === LK.Track.Source.ScreenShare) {
          isSharing = false;
          updateShareButton();
          sendWS({ type: 'stop-share' });
          const me = participants.find(p => p.id === currentMeeting?.participantId);
          if (me) me.sharing = false;
          if (watchingId && currentMeeting && watchingId === currentMeeting.participantId) {
            clearBigView();
          }
          renderCards();
        }
      })
      .on(LK.RoomEvent.ConnectionStateChanged, (state) => {
        console.log('[LiveKit] connection state:', state);
      })
      .on(LK.RoomEvent.MediaDevicesError, (e) => {
        console.error('[LiveKit] MediaDevicesError', e);
      })
      .on(LK.RoomEvent.SignalConnected, () => {
        console.log('[LiveKit] signal connected');
      })
      .on(LK.RoomEvent.Connected, () => {
        console.log('[LiveKit] room connected', {
          name: room.name,
          localIdentity: room.localParticipant?.identity,
          remoteCount: room.remoteParticipants.size,
        });
        // Publications may finish resolving just after Connected
        attachExistingRemoteScreenTracks();
        syncSharingFlagsFromLiveKit();
      })
      .on(LK.RoomEvent.ParticipantConnected, (participant) => {
        // New remote participant — subscribe to any screen share they already have
        attachParticipantScreenTracks(participant);
        syncSharingFlagsFromLiveKit();
      })
      .on(LK.RoomEvent.TrackPublished, (publication, participant) => {
        // Remote published a track (including ones already live when we joined)
        if (
          participant &&
          publication &&
          publication.source === LK.Track.Source.ScreenShare
        ) {
          try {
            if (typeof publication.setSubscribed === 'function' && !publication.isSubscribed) {
              publication.setSubscribed(true);
            }
          } catch (_) {}
          if (publication.track && publication.track.kind === LK.Track.Kind.Video) {
            handleTrackSubscribed(publication.track, publication, participant);
          }
          markParticipantSharing(participant.identity, true);
        }
      })
      .on(LK.RoomEvent.TrackUnpublished, (publication, participant) => {
        if (publication && publication.source === LK.Track.Source.ScreenShare) {
          markParticipantSharing(participant?.identity, false);
          if (watchingId === participant?.identity) clearBigView();
        }
      })
      .on(LK.RoomEvent.Disconnected, (reason) => {
        console.warn('[LiveKit] disconnected', reason);
      });

    try {
      console.log('[LiveKit] connecting to', url);
      await room.connect(url, tokenData.token, { autoSubscribe: true });
      console.log('[LiveKit] connect OK, state=', room.state);
      micOn = false;
      updateMicButton();
      // Pick up any screen shares already published before we joined
      attachExistingRemoteScreenTracks();
      syncSharingFlagsFromLiveKit();
      // LiveKit sometimes delivers pubs a tick later
      setTimeout(() => {
        attachExistingRemoteScreenTracks();
        syncSharingFlagsFromLiveKit();
      }, 400);
      setTimeout(() => {
        attachExistingRemoteScreenTracks();
        syncSharingFlagsFromLiveKit();
      }, 1500);
    } catch (e) {
      console.error('[LiveKit] connect failed', e);
      alert('Could not connect to media server: ' + (e.message || e));
      room = null;
    }
  }

  function markParticipantSharing(identity, sharing) {
    if (!identity) return;
    const p = participants.find((x) => x.id === identity);
    if (p) {
      if (!!p.sharing !== !!sharing) {
        p.sharing = !!sharing;
        renderCards();
        renderParticipants();
      }
    } else if (sharing) {
      // Participant row may arrive via WS slightly later — keep a pending flag on remoteMedia
      if (!remoteMedia[identity]) remoteMedia[identity] = {};
      remoteMedia[identity].pendingShare = true;
    }
  }

  function syncSharingFlagsFromLiveKit() {
    if (room) {
      room.remoteParticipants.forEach((participant) => {
        let hasScreen = false;
        participant.trackPublications.forEach((publication) => {
          if (publication.source === LK.Track.Source.ScreenShare) {
            hasScreen = true;
            if (
              publication.kind === LK.Track.Kind.Video ||
              (publication.track && publication.track.kind === LK.Track.Kind.Video)
            ) {
              try {
                if (typeof publication.setSubscribed === 'function' && !publication.isSubscribed) {
                  publication.setSubscribed(true);
                }
              } catch (_) {}
            }
          }
        });
        markParticipantSharing(participant.identity, hasScreen);
      });
    }
    renderParticipants();
    renderCards();
  }

  function attachParticipantScreenTracks(participant) {
    if (!participant) return;
    participant.trackPublications.forEach((publication) => {
      if (publication.source !== LK.Track.Source.ScreenShare) return;
      markParticipantSharing(participant.identity, true);
      try {
        if (typeof publication.setSubscribed === 'function' && !publication.isSubscribed) {
          publication.setSubscribed(true);
        }
      } catch (_) {}
      if (
        publication.track &&
        publication.track.kind === LK.Track.Kind.Video
      ) {
        handleTrackSubscribed(publication.track, publication, participant);
      }
    });
  }

  function attachExistingRemoteScreenTracks() {
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      attachParticipantScreenTracks(participant);
    });
  }

  async function disconnectLiveKit() {
    if (room) {
      try { await room.disconnect(); } catch (_) {}
      room = null;
    }
    Object.keys(remoteMedia).forEach(cleanupRemoteMedia);
    isSharing = false;
    micOn = false;
    updateShareButton();
    updateMicButton();
  }

  function handleTrackSubscribed(track, publication, participant) {
    const identity = participant.identity;
    if (!remoteMedia[identity]) remoteMedia[identity] = {};

    if (track.kind === LK.Track.Kind.Video && publication.source === LK.Track.Source.ScreenShare) {
      remoteMedia[identity].screenTrack = track;
      console.log('[LiveKit] ScreenShare TrackSubscribed', {
        identity,
        trackSid: track.sid,
        muted: track.isMuted,
        streamState: track.streamState,
        dimensions: track.dimensions,
      });
      try {
        applyViewQualityToPublication(publication);
      } catch (_) {}
      const p = participants.find(x => x.id === identity);
      if (p && !p.sharing) { p.sharing = true; renderCards(); }
      // Auto-watch only if nothing selected yet; never steal focus if user picked another card
      if (!watchingId || watchingId === identity) {
        watchingId = identity;
        attachScreenToBigView(track, identity);
        renderCards();
      }
    }

    if (track.kind === LK.Track.Kind.Audio) {
      const el = track.attach();
      el.autoplay = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      remoteMedia[identity].audioEl = el;
      const playP = el.play();
      if (playP && playP.catch) playP.catch(() => {});
    }
  }

  function handleTrackUnsubscribed(track, publication, participant) {
    const identity = participant.identity;
    track.detach();
    if (publication.source === LK.Track.Source.ScreenShare) {
      if (remoteMedia[identity]) delete remoteMedia[identity].screenTrack;
      if (watchingId === identity) clearBigView();
      const p = participants.find(x => x.id === identity);
      if (p) { p.sharing = false; renderCards(); }
    }
    if (track.kind === LK.Track.Kind.Audio && remoteMedia[identity]?.audioEl) {
      try { remoteMedia[identity].audioEl.remove(); } catch (_) {}
      delete remoteMedia[identity].audioEl;
    }
  }

  function cleanupRemoteMedia(identity) {
    const m = remoteMedia[identity];
    if (!m) return;
    if (m.audioEl) try { m.audioEl.remove(); } catch (_) {}
    if (m.screenTrack) try { m.screenTrack.detach(); } catch (_) {}
    delete remoteMedia[identity];
  }

  function hideContentOverlay() {
    const cv = $('contentView');
    if (cv) cv.classList.add('hidden');
    if (remoteVideo) {
      remoteVideo.style.opacity = '';
      remoteVideo.style.display = 'none';
    }
  }

  function attachScreenToBigView(track, identity) {
    hideContentOverlay();
    const existing = document.getElementById('lkScreenVideo');
    if (existing) {
      try {
        // detach any previous track from the element
        existing.remove();
      } catch (_) {}
    }
    if (remoteVideo) {
      remoteVideo.style.display = 'none';
      remoteVideo.classList.remove('active');
    }

    // Prefer attaching into a dedicated element we fully control
    const el = document.createElement('video');
    el.id = 'lkScreenVideo';
    el.autoplay = true;
    el.playsInline = true;
    // Mute the *element* initially so autoplay is allowed, then unmute after play.
    // (Browsers block unmuted autoplay; screen video itself has no audio usually.)
    el.muted = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('autoplay', '');
    el.classList.add('active');
    // Fill the container so size is never 0 (avoids black frames / adaptive issues)
    el.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'object-fit:contain',
      'display:block',
      'background:#0a0c10',
      'z-index:3',
    ].join(';');

    // Attach MediaStreamTrack(s) to our element
    track.attach(el);

    bigView?.appendChild(el);
    bigPlaceholder?.classList.add('hidden');
    if (bigViewLabel) {
      const p = participants.find(x => x.id === identity);
      bigViewLabel.textContent = p ? p.name + ' is sharing' : 'Screen share';
      bigViewLabel.classList.add('visible');
    }

    const mst = track.mediaStreamTrack;
    const stream = el.srcObject;
    console.log('[screen] attached', {
      identity,
      videoWidth: el.videoWidth,
      videoHeight: el.videoHeight,
      readyState: el.readyState,
      paused: el.paused,
      srcObjectTracks: stream ? stream.getTracks().map((t) => ({
        kind: t.kind,
        id: t.id,
        readyState: t.readyState,
        enabled: t.enabled,
        muted: t.muted,
        label: t.label,
      })) : null,
      mediaStreamTrack: mst
        ? { readyState: mst.readyState, enabled: mst.enabled, muted: mst.muted, label: mst.label }
        : null,
      trackDimensions: track.dimensions,
      trackMuted: track.isMuted,
      streamState: track.streamState,
    });

    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.then(() => {
          // Video can stay muted (screen share audio is a separate track)
          console.log('[screen] playing', { videoWidth: el.videoWidth, videoHeight: el.videoHeight });
        }).catch((err) => console.warn('[screen] video.play() blocked', err));
      }
    };
    tryPlay();
    // Safari / some Chromium builds need a second kick after layout
    requestAnimationFrame(() => {
      tryPlay();
      void el.offsetWidth;
    });
    setTimeout(() => {
      tryPlay();
      // If still 0x0 after a moment, media is not arriving (ICE/UDP/TURN problem)
      if (el.videoWidth === 0 && el.videoHeight === 0) {
        console.warn(
          '[screen] still 0x0 after attach — media frames are not arriving. ' +
          'Check LiveKit UDP ports 50000-60000, TURN, and that LIVEKIT_URL is reachable over WSS.'
        );
      }
    }, 1500);

    if (track.on) {
      try {
        const dimEvent = (LK.TrackEvent && LK.TrackEvent.DimensionsChanged) || 'dimensionsChanged';
        track.on(dimEvent, () => {
          console.log('[screen] dimensions changed', track.dimensions);
          tryPlay();
        });
      } catch (_) {}
    }
  }

  function clearBigView() {
    watchingId = null;
    try { hideContentOverlay(); } catch (_) {}
    const lkVid = document.getElementById('lkScreenVideo');
    if (lkVid) try { lkVid.remove(); } catch (_) {}
    if (remoteVideo) {
      remoteVideo.style.display = '';
      remoteVideo.style.opacity = '';
      remoteVideo.srcObject = null;
      remoteVideo.classList.remove('active');
    }
    bigPlaceholder?.classList.remove('hidden');
    if (bigViewLabel) {
      bigViewLabel.textContent = '';
      bigViewLabel.classList.remove('visible');
    }
    // restore default placeholder text
    if (bigPlaceholder) {
      const p = bigPlaceholder.querySelector('p');
      if (p) p.textContent = 'No screen selected';
    }
    renderCards();
  }

  // Sender encode presets (highest available path = high)
  const SEND_QUALITY = {
    high: {
      maxBitrate: 10_000_000,
      maxFramerate: 30,
      resolution: { width: 1920, height: 1080, frameRate: 30 },
    },
    medium: {
      maxBitrate: 4_000_000,
      maxFramerate: 24,
      resolution: { width: 1280, height: 720, frameRate: 24 },
    },
    low: {
      maxBitrate: 1_500_000,
      maxFramerate: 15,
      resolution: { width: 960, height: 540, frameRate: 15 },
    },
  };
  let sendQuality = localStorage.getItem('meet-send-quality') || 'high';
  if (!SEND_QUALITY[sendQuality]) sendQuality = 'high';
  let viewQuality = localStorage.getItem('meet-view-quality') || 'high';
  if (!['high', 'medium', 'off'].includes(viewQuality)) viewQuality = 'high';

  function getSendPreset() {
    return SEND_QUALITY[sendQuality] || SEND_QUALITY.high;
  }

  function applyViewQualityToPublication(publication) {
    if (!publication) return;
    try {
      if (viewQuality === 'off') {
        if (typeof publication.setSubscribed === 'function') publication.setSubscribed(false);
        return;
      }
      if (typeof publication.setSubscribed === 'function' && !publication.isSubscribed) {
        publication.setSubscribed(true);
      }
      if (publication.setVideoQuality && LK.VideoQuality) {
        publication.setVideoQuality(
          viewQuality === 'medium' ? LK.VideoQuality.MEDIUM : LK.VideoQuality.HIGH
        );
      }
    } catch (_) {}
  }

  function applyViewQualityAll() {
    const big = $('bigView');
    if (big) {
      big.classList.toggle('view-audio-only', viewQuality === 'off');
      if (viewQuality === 'off') {
        const ph = $('bigPlaceholder');
        if (ph) {
          ph.classList.remove('hidden');
          const p = ph.querySelector('p');
          if (p) p.textContent = 'Audio only — screen hidden';
          const sub = ph.querySelector('.sub');
          if (sub) sub.textContent = 'Sound still plays; pick High/Medium under View to show video';
        }
      }
    }
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.source === LK.Track.Source.ScreenShare) {
          applyViewQualityToPublication(publication);
        }
      });
    });
    // Re-attach current watch if video turned back on
    if (viewQuality !== 'off' && watchingId) {
      const m = remoteMedia[watchingId];
      if (m && m.screenTrack) attachScreenToBigView(m.screenTrack, watchingId);
    }
  }

  async function republishScreenWithQuality() {
    if (!isSharing || !room?.localParticipant) return;
    try {
      await room.localParticipant.setScreenShareEnabled(false);
    } catch (_) {}
    // brief yield so unpublish settles
    await new Promise((r) => setTimeout(r, 200));
    await startShare();
  }

  async function startShare() {
    if (!room?.localParticipant) { alert('Not connected to media server yet.'); return; }
    const preset = getSendPreset();
    try {
      // motion + high bitrate keeps YouTube clearer while playing (not only when paused)
      if (typeof room.localParticipant.createScreenTracks === 'function') {
        const tracks = await room.localParticipant.createScreenTracks({
          audio: true,
          resolution: preset.resolution,
          contentHint: 'motion',
        });
        for (const track of tracks) {
          if (track.mediaStreamTrack && track.kind === 'video') {
            try { track.mediaStreamTrack.contentHint = 'motion'; } catch (_) {}
          }
          console.log('[LiveKit] publishing screen track', {
            kind: track.kind,
            sendQuality,
            maxBitrate: preset.maxBitrate,
            maxFramerate: preset.maxFramerate,
          });
          await room.localParticipant.publishTrack(track, {
            source: track.kind === 'video' ? LK.Track.Source.ScreenShare : LK.Track.Source.ScreenShareAudio,
            videoCodec: 'vp8',
            simulcast: false,
            videoEncoding: {
              maxBitrate: preset.maxBitrate,
              maxFramerate: preset.maxFramerate,
            },
            degradationPreference: 'maintain-resolution',
          });
        }
      } else {
        await room.localParticipant.setScreenShareEnabled(true, {
          audio: true,
          resolution: preset.resolution,
          contentHint: 'motion',
        });
      }
    } catch (e) {
      console.error('[LiveKit] startShare failed', e);
      try {
        await room.localParticipant.setScreenShareEnabled(true, { audio: true });
      } catch (e2) {
        console.error(e2);
        alert('Could not start screen share. Please allow the permission.\n' + (e2.message || e.message || ''));
      }
    }
  }

  async function stopShare() {
    if (!room?.localParticipant) return;
    try { await room.localParticipant.setScreenShareEnabled(false); } catch (e) { console.error(e); }
  }

  async function toggleMic() {
    if (!room?.localParticipant) { alert('Not connected to media server yet.'); return; }
    try {
      const next = !micOn;
      await room.localParticipant.setMicrophoneEnabled(next);
      micOn = next;
      updateMicButton();
    } catch (e) {
      console.error(e);
      alert('Could not access microphone.');
    }
  }

  function updateShareButton() {
    if (!shareBtn) return;
    if (isSharing) {
      shareBtn.classList.add('sharing-active');
      shareBtn.innerHTML = '<i class="fa-solid fa-desktop"></i><span>Stop share</span>';
    } else {
      shareBtn.classList.remove('sharing-active');
      shareBtn.innerHTML = '<i class="fa-solid fa-desktop"></i><span>Share screen</span>';
    }
  }

  function updateMicButton() {
    if (!micBtn) return;
    micBtn.classList.toggle('active', micOn);
    micBtn.classList.toggle('off', !micOn);
    micBtn.innerHTML = micOn
      ? '<i class="fa-solid fa-microphone"></i><span>Mic</span>'
      : '<i class="fa-solid fa-microphone-slash"></i><span>Mic</span>';
  }

  function getLocalScreenTrack() {
    if (!room?.localParticipant || !LK) return null;
    try {
      const pubs = room.localParticipant.trackPublications
        || room.localParticipant.tracks
        || null;
      if (pubs) {
        const list = pubs.values ? Array.from(pubs.values()) : Object.values(pubs);
        for (const pub of list) {
          if (!pub) continue;
          const src = pub.source;
          const isScreen = src === LK.Track.Source.ScreenShare
            || src === 'screen_share'
            || src === 'screenShare';
          if (isScreen && pub.track && pub.track.kind === 'video') return pub.track;
          if (isScreen && pub.videoTrack) return pub.videoTrack;
        }
      }
      // Fallback: iterate video track publications helper if present
      if (typeof room.localParticipant.getTrackPublication === 'function') {
        const pub = room.localParticipant.getTrackPublication(LK.Track.Source.ScreenShare);
        if (pub?.track) return pub.track;
      }
    } catch (e) {
      console.warn('[screen] getLocalScreenTrack', e);
    }
    return null;
  }

  async function watchParticipant(remoteId) {
    // Always re-bind so switching cards works even if same id after content overlay
    hideContentOverlay();
    const prev = document.getElementById('lkScreenVideo');
    if (prev) try { prev.remove(); } catch (_) {}
    if (remoteVideo) {
      remoteVideo.style.display = 'none';
      remoteVideo.classList.remove('active');
    }

    watchingId = remoteId;
    renderCards();

    // Self view while sharing: use local publication (not remoteMedia)
    const isSelf = currentMeeting && remoteId === currentMeeting.participantId;
    if (isSelf) {
      const localTrack = getLocalScreenTrack();
      if (localTrack) {
        attachScreenToBigView(localTrack, remoteId);
        return;
      }
      bigPlaceholder?.classList.remove('hidden');
      if (bigViewLabel) {
        bigViewLabel.textContent = 'You are sharing';
        bigViewLabel.classList.add('visible');
      }
      if (bigPlaceholder) {
        const p = bigPlaceholder.querySelector('p');
        if (p) p.textContent = 'Your screen is being shared…';
      }
      return;
    }

    const m = remoteMedia[remoteId];
    if (m?.screenTrack) {
      attachScreenToBigView(m.screenTrack, remoteId);
    } else {
      bigPlaceholder?.classList.remove('hidden');
      if (bigViewLabel) {
        bigViewLabel.textContent = '';
        bigViewLabel.classList.remove('visible');
      }
      if (bigPlaceholder) {
        const p = bigPlaceholder.querySelector('p');
        if (p) p.textContent = 'Waiting for screen…';
      }
    }
  }

  // ----- Render -----

  function deviceIcon(device) {
    if (device === 'mobile') return 'fa-mobile-screen';
    if (device === 'tablet') return 'fa-tablet-screen-button';
    return 'fa-desktop';
  }

  function detectDevice() {
    const ua = navigator.userAgent || '';
    const w = window.innerWidth || 1024;
    if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua) || w < 600) return 'mobile';
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua) || (w >= 600 && w < 1024)) return 'tablet';
    return 'desktop';
  }

  let showDeviceIcons = true;

  function renderParticipants() {
    if (!participantList) return;
    participantList.innerHTML = '';
    if (participantCount) participantCount.textContent = String(participants.length);

    const sorted = [...participants].sort((a, b) => {
      if (a.isHost && !b.isHost) return -1;
      if (!a.isHost && b.isHost) return 1;
      if (a.id === currentMeeting?.participantId) return -1;
      if (b.id === currentMeeting?.participantId) return 1;
      return 0;
    });

    const VISIBLE = 4;
    const pinned = sorted.slice(0, VISIBLE);
    const rest = sorted.slice(VISIBLE);
    const myId = currentMeeting?.participantId;

    const appendItem = (p, parent) => {
      const li = document.createElement('li');
      li.className = 'participant-item';
      if (p.isHost) li.classList.add('host');
      if (p.id === myId) li.classList.add('me');
      const offline = p.online === false;
      if (offline) li.style.opacity = '0.55';

      const deviceHtml = showDeviceIcons
        ? `<i class="fa-solid ${deviceIcon(p.device)} device-icon" title="${escapeHtml(p.device || 'desktop')}"></i>`
        : '';
      const muteTag = p.mutedByHost ? ' <span class="host-tag" title="Muted">muted</span>' : '';
      li.innerHTML = `
        ${deviceHtml}
        <span class="p-name">${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">Host</span>' : ''}${p.id === myId ? ' <span class="me-tag">(you)</span>' : ''}${muteTag}</span>
        ${p.sharing ? '<span class="live-dot" title="Sharing screen" aria-label="Sharing"></span>' : ''}
      `;

      if (p.id !== myId) {
        const actions = document.createElement('div');
        actions.className = 'participant-actions';
        const muteBtn = document.createElement('button');
        muteBtn.type = 'button';
        muteBtn.className = 'btn small-btn';
        muteBtn.title = 'Mute this person';
        muteBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sendWS({ type: 'mute-participant', targetId: p.id });
        });
        actions.appendChild(muteBtn);
        li.appendChild(actions);
      }
      parent.appendChild(li);
    };

    pinned.forEach((p) => appendItem(p, participantList));

    if (rest.length) {
      const wrap = document.createElement('li');
      wrap.className = 'participant-collapse';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'collapse-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = `<i class="fa-solid fa-chevron-down"></i> <span>${rest.length} more</span>`;
      const sub = document.createElement('ul');
      sub.className = 'participant-list nested collapsed';
      rest.forEach((p) => appendItem(p, sub));
      toggle.addEventListener('click', () => {
        const open = sub.classList.toggle('collapsed') === false;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.querySelector('span').textContent = open ? 'Show less' : `${rest.length} more`;
        toggle.querySelector('i')?.classList.toggle('rotated', open);
      });
      wrap.appendChild(toggle);
      wrap.appendChild(sub);
      participantList.appendChild(wrap);
    }
  }

  function renderCards() {
    if (!screenCards) return;
    screenCards.innerHTML = '';

    // Only cards for people currently sharing (easy switch between live screens)
    const sharingList = participants.filter(
      (p) => p.sharing || (p.id === currentMeeting?.participantId && isSharing)
    );

    if (!sharingList.length) {
      screenCards.classList.add('empty');
      return;
    }
    screenCards.classList.remove('empty');

    const CARD_VISIBLE = 4; // one compact row; rest collapsible on small screens
    const pinned = sharingList.slice(0, CARD_VISIBLE);
    const rest = sharingList.slice(CARD_VISIBLE);

    const makeCard = (p) => {
      const card = document.createElement('div');
      card.className = 'screen-card sharing';
      if (watchingId === p.id) card.classList.add('watching', 'active');
      card.innerHTML = `
        <i class="fa-solid fa-desktop card-icon" title="Sharing screen"></i>
        <span class="card-name">${escapeHtml(p.name)}</span>
      `;
      card.addEventListener('click', () => onCardClick(p));
      return card;
    };

    const row = document.createElement('div');
    row.className = 'screen-cards-row';
    pinned.forEach((p) => row.appendChild(makeCard(p)));
    screenCards.appendChild(row);

    if (rest.length) {
      const wrap = document.createElement('div');
      wrap.className = 'screen-cards-collapse';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'collapse-toggle cards-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = `<i class="fa-solid fa-chevron-down"></i> <span>${rest.length} more screens</span>`;
      const extra = document.createElement('div');
      extra.className = 'screen-cards-row nested collapsed';
      rest.forEach((p) => extra.appendChild(makeCard(p)));
      toggle.addEventListener('click', () => {
        const open = extra.classList.toggle('collapsed') === false;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.querySelector('span').textContent = open ? 'Show less' : `${rest.length} more screens`;
        toggle.querySelector('i')?.classList.toggle('rotated', open);
      });
      wrap.appendChild(toggle);
      wrap.appendChild(extra);
      screenCards.appendChild(wrap);
    }
  }

  async function onCardClick(p) {
    if (!currentMeeting) return;
    // Own card: if already sharing, show own screen; otherwise start share.
    if (p.id === currentMeeting.participantId) {
      const sharing = isSharing || p.sharing;
      if (sharing) {
        await watchParticipant(p.id);
        return;
      }
      await startShare();
      return;
    }
    if (!p.sharing) return;
    await watchParticipant(p.id);
  }

  // ----- Meeting lifecycle -----

  async function showMeeting(data, isHost, opts = {}) {
    const participantName = normalizeDisplayName(
      opts.participantName
      || (isHost ? createYourName?.value : joinYourName?.value)
      || displayNameOf(currentUser)
    );
    if (!isValidDisplayName(participantName)) {
      throw new Error('Please enter your display name');
    }

    currentMeeting = {
      code: data.code,
      letters: data.letters || data.code.slice(0, 3),
      numbers: data.numbers || data.code.slice(3),
      name: data.name,
      participantId: data.participantId,
      participantName,
      isHost: !!isHost,
    };
    participants = data.participants || [];

    saveSession(currentMeeting);
    setMeetingUrl(currentMeeting.code, !!opts.replaceUrl);

    homeView?.classList.add('hidden');
    historyView?.classList.add('hidden');
    meetingView?.classList.remove('hidden');
    leaveBtn?.classList.remove('hidden');
    if (meetingBadge) {
      meetingBadge.textContent = formatCode(currentMeeting.letters, currentMeeting.numbers);
      meetingBadge.classList.remove('hidden');
    }
    copyCodeBtn?.classList.remove('hidden');

    renderParticipants();
    renderCards();
    connectWS();
    startPolling();
    await loadConfig();
    await connectLiveKit();
  }

  async function leaveMeeting() {
    if (currentMeeting) {
      try {
        await api('/api/leave', {
          method: 'POST',
          body: JSON.stringify({
            code: currentMeeting.code,
            participantId: currentMeeting.participantId,
          }),
        });
      } catch (_) {}
    }
    stopPolling();
    if (wsRetryTimer) clearTimeout(wsRetryTimer);
    if (ws) { try { ws.onclose = null; ws.close(); } catch (_) {} ws = null; }
    await disconnectLiveKit();
    clearBigView();
    currentMeeting = null;
    participants = [];
    saveSession(null);
    clearMeetingUrl(false);

    meetingView?.classList.add('hidden');
    homeView?.classList.remove('hidden');
    leaveBtn?.classList.add('hidden');
    meetingBadge?.classList.add('hidden');
    copyCodeBtn?.classList.add('hidden');
    setWsStatus('left');
  }

  // ----- Theme / layout -----

  function initTheme() {
    const saved = localStorage.getItem('meet-theme');
    if (saved === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    updateThemeIcon();
  }
  function updateThemeIcon() {
    if (!themeToggle) return;
    const isDark = document.documentElement.classList.contains('dark');
    themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  }
  themeToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('meet-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    updateThemeIcon();
  });
  initTheme();

  fullscreenBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

    if (resizer && col1 && meetingView) {
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => {
      dragging = true;
      resizer.classList.add('active');
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      resizer.classList.remove('active');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = meetingView.getBoundingClientRect();
      let px = e.clientX - rect.left;
      px = Math.max(220, Math.min(rect.width * 0.45, px));
      meetingView.style.gridTemplateColumns = px + 'px 5px minmax(0, 1fr)';
    });
  }


  copyCodeBtn?.addEventListener('click', async () => {
    if (!currentMeeting) return;
    try {
      const shareUrl = location.origin + meetingPath(currentMeeting.code);
      await navigator.clipboard.writeText(shareUrl);
      copyCodeBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { copyCodeBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
    } catch (_) {}
  });

  leaveBtn?.addEventListener('click', leaveMeeting);
  micBtn?.addEventListener('click', toggleMic);
  shareBtn?.addEventListener('click', async () => {
    if (isSharing) await stopShare();
    else await startShare();
  });

  // Screen quality controls (send = encode, view = subscribe / hide video)
  (function initQualityControls() {
    var sendSel = $('sendQualitySelect');
    var viewSel = $('viewQualitySelect');
    if (sendSel) {
      sendSel.value = sendQuality;
      sendSel.addEventListener('change', async function () {
        sendQuality = sendSel.value;
        if (!SEND_QUALITY[sendQuality]) sendQuality = 'high';
        try { localStorage.setItem('meet-send-quality', sendQuality); } catch (_) {}
        if (isSharing) {
          await republishScreenWithQuality();
        }
      });
    }
    if (viewSel) {
      viewSel.value = viewQuality;
      viewSel.addEventListener('change', function () {
        viewQuality = viewSel.value;
        if (!['high', 'medium', 'off'].includes(viewQuality)) viewQuality = 'high';
        try { localStorage.setItem('meet-view-quality', viewQuality); } catch (_) {}
        applyViewQualityAll();
      });
    }
    applyViewQualityAll();
  })();


  screenFsBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) bigView?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  createBtn?.addEventListener('click', async () => {
    hideError(createError);
    const name = (createName?.value || '').trim();
    const yourName = normalizeDisplayName(createYourName?.value || displayNameOf(currentUser));
    if (name.length < 2) {
      showError(createError, 'Please enter a meeting name (min 2 characters)');
      return;
    }
    if (!isValidDisplayName(yourName)) {
      showError(createError, 'Please enter your display name');
      createYourName?.focus();
      return;
    }
    createBtn.disabled = true;
    try {
      const data = await api('/api/create', {
        method: 'POST',
        body: JSON.stringify({ name, participantName: yourName }),
      });
      await showMeeting(data, true, { participantName: yourName });
    } catch (e) {
      showError(createError, e.message);
    } finally {
      createBtn.disabled = false;
    }
  });

  function normalizeLetters(v) { return (v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); }
  function normalizeNumbers(v) { return (v || '').replace(/\D/g, '').slice(0, 3); }

  joinLetters?.addEventListener('input', () => {
    joinLetters.value = normalizeLetters(joinLetters.value);
    if (joinLetters.value.length === 3) joinNumbers?.focus();
  });
  joinNumbers?.addEventListener('input', () => {
    joinNumbers.value = normalizeNumbers(joinNumbers.value);
  });

  joinBtn?.addEventListener('click', async () => {
    hideError(joinError);
    const letters = normalizeLetters(joinLetters?.value);
    const numbers = normalizeNumbers(joinNumbers?.value);
    const yourName = normalizeDisplayName(joinYourName?.value || displayNameOf(currentUser));
    if (letters.length !== 3 || numbers.length !== 3) {
      showError(joinError, 'Enter 3 letters and 3 numbers');
      return;
    }
    if (!isValidDisplayName(yourName)) {
      showError(joinError, 'Please enter your display name');
      joinYourName?.focus();
      return;
    }
    joinBtn.disabled = true;
    try {
      const data = await api('/api/join', {
        method: 'POST',
        body: JSON.stringify({ letters, numbers, participantName: yourName }),
      });
      await showMeeting(data, false, { participantName: yourName });
    } catch (e) {
      showError(joinError, e.message);
    } finally {
      joinBtn.disabled = false;
    }
  });

  const nameModal = $('nameModal');
  const nameModalInput = $('nameModalInput');
  const nameModalError = $('nameModalError');
  const nameForm = $('nameForm');
  const nameModalCancel = $('nameModalCancel');
  let pendingJoin = null; // { code, participantId, isHost, resolve, reject }

  function openNameModal(prefill) {
    hideError(nameModalError);
    if (nameModalInput) {
      nameModalInput.value = isValidDisplayName(prefill) ? normalizeDisplayName(prefill) : '';
    }
    nameModal?.classList.remove('hidden');
    setTimeout(() => nameModalInput?.focus(), 50);
  }

  function closeNameModal() {
    nameModal?.classList.add('hidden');
    hideError(nameModalError);
    pendingJoin = null;
  }

  /** Prompt for display name; resolves with valid name or rejects on cancel. */
  function promptDisplayName(prefill) {
    return new Promise((resolve, reject) => {
      pendingJoin = { resolve, reject };
      openNameModal(prefill);
    });
  }

  nameForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError(nameModalError);
    const name = normalizeDisplayName(nameModalInput?.value);
    if (!isValidDisplayName(name)) {
      showError(nameModalError, 'Please enter your display name (at least 2 characters)');
      nameModalInput?.focus();
      return;
    }
    const pending = pendingJoin;
    nameModal?.classList.add('hidden');
    pendingJoin = null;
    pending?.resolve(name);
  });

  nameModalCancel?.addEventListener('click', () => {
    const pending = pendingJoin;
    closeNameModal();
    pending?.reject(new Error('cancelled'));
  });

  // Backdrop does not dismiss — name is required

  async function joinWithCode(code, opts = {}) {
    const session = loadSession();
    const sameSession = session && session.code === code;
    let participantName = normalizeDisplayName(
      opts.participantName
      || (sameSession && session.participantName)
      || displayNameOf(currentUser)
    );
    const participantId = opts.participantId
      || (sameSession ? session.participantId : undefined);
    const isHost = opts.isHost != null
      ? !!opts.isHost
      : !!(sameSession && session.isHost);

    if (!isValidDisplayName(participantName)) {
      try {
        participantName = await promptDisplayName(participantName || displayNameOf(currentUser) || '');
      } catch {
        // User cancelled name prompt
        saveSession(null);
        clearMeetingUrl(true);
        return false;
      }
    }

    try {
      const body = {
        code,
        letters: code.slice(0, 3),
        numbers: code.slice(3),
        participantName,
      };
      if (participantId) body.participantId = participantId;

      const data = await api('/api/join', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await showMeeting(data, isHost, { participantName, replaceUrl: true });
      return true;
    } catch (e) {
      saveSession(null);
      clearMeetingUrl(true);
      console.warn('[rejoin]', e.message || e);
      return false;
    }
  }

  /** Rejoin from URL (refresh or shared link). Always requires a real display name. */
  async function tryRejoinFromUrl() {
    const code = parseMeetingCodeFromPath(location.pathname);
    if (!code) return false;
    return joinWithCode(code);
  }

  window.addEventListener('popstate', async () => {
    const code = parseMeetingCodeFromPath(location.pathname);
    if (code) {
      if (currentMeeting && currentMeeting.code === code) return;
      if (currentMeeting) {
        stopPolling();
        if (wsRetryTimer) clearTimeout(wsRetryTimer);
        if (ws) { try { ws.onclose = null; ws.close(); } catch (_) {} ws = null; }
        await disconnectLiveKit();
        clearBigView();
        currentMeeting = null;
        participants = [];
      }
      await tryRejoinFromUrl();
    } else if (currentMeeting) {
      await leaveMeeting();
    }
  });

  // Do NOT leave on refresh — session + URL allow seamless rejoin when a name is known.
  // Leave only when the user clicks Leave (or navigates away via back to home).



  // Landing mock: typewriter messages inside the stage preview
  function runLandingTypewriter() {
    const lines = document.querySelectorAll('.hero-stage .type-line[data-text]');
    if (!lines.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lines.forEach((el) => {
        el.textContent = el.getAttribute('data-text') || '';
        el.classList.add('done');
      });
      return;
    }

    const schedule = [400, 1600, 2900]; // when each message starts typing
    const speed = 28; // ms per character

    lines.forEach((el, i) => {
      const full = el.getAttribute('data-text') || '';
      el.textContent = '';
      const startAt = schedule[i] ?? (400 + i * 1400);
      setTimeout(() => {
        el.classList.add('typing');
        let n = 0;
        const tick = () => {
          n += 1;
          el.textContent = full.slice(0, n);
          if (n < full.length) {
            setTimeout(tick, speed);
          } else {
            el.classList.remove('typing');
            el.classList.add('done');
          }
        };
        tick();
      }, startAt);
    });
  }

  // Kick off once DOM is ready (script is at end of body)
  runLandingTypewriter();

  // =====================================================================
  // Upgrade: chat, reactions, content share, remote, schedule, devices
  // =====================================================================

  let currentContent = null;
  let localVideoObjectUrl = null;
  let pdfDoc = null;
  let pdfPageNum = 1;

  function hashHue(str) {
    var h = 0;
    var s = String(str || 'user');
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }

  function selfChatColor() {
    var key = (currentUser && (currentUser.displayName || currentUser.username || currentUser.email))
      || (currentMeeting && currentMeeting.participantName)
      || 'me';
    return 'hsl(' + hashHue(key) + ' 70% 55%)';
  }

  function applySelfChatColor() {
    var c = selfChatColor();
    document.documentElement.style.setProperty('--chat-self-color', c);
  }

  function linkifyAndMentions(text, mentions) {
    var escaped = escapeHtml(text || '');
    // URLs: http(s)://... or bare domain.tld/...
    escaped = escaped.replace(
      /(https?:\/\/[^\s<]+)|(www\.[^\s<]+)|(\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi,
      function (m) {
        var href = m;
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        return '<a class="chat-link" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + m + '</a>';
      }
    );
    // @mentions: only the @Name token (no bold bleed into following words)
    if (mentions && mentions.length) {
      mentions.forEach(function (mn) {
        var name = String(mn.name || '').trim();
        if (!name) return;
        var re = new RegExp('@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'gi');
        escaped = escaped.replace(re, '<span class="chat-mention">@' + escapeHtml(name) + '</span>');
      });
    } else {
      // single token only — no spaces (avoids bolding the rest of the sentence)
      escaped = escaped.replace(/@([A-Za-z0-9_.-]{1,40})/g, '<span class="chat-mention">@$1</span>');
    }
    return escaped;
  }

  function formatBytes(n) {
    if (!n || n < 1024) return (n || 0) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function appendChatMessage(msg) {
    const box = $('chatMessages');
    if (!box) return;
    applySelfChatColor();
    const row = document.createElement('div');
    const isMe = msg.participantId === currentMeeting?.participantId;
    row.className = 'chat-msg-row' + (isMe ? ' is-me' : '');
    if (isMe) row.style.setProperty('--chat-self-color', selfChatColor());

    var who = escapeHtml(isMe ? 'You' : (msg.name || 'User'));
    var body = linkifyAndMentions(msg.text || '', msg.mentions);
    var attachHtml = '';
    if (msg.attachment) {
      var a = msg.attachment;
      if (a.kind === 'image' && a.dataUrl) {
        attachHtml =
          '<div class="chat-attach">' +
          '<img class="chat-attach-img" src="' + a.dataUrl.replace(/"/g, '') + '" alt="' + escapeHtml(a.name || 'image') + '" data-full="' + a.dataUrl.replace(/"/g, '') + '" data-name="' + escapeHtml(a.name || 'image.webp') + '">' +
          '<a class="chat-attach-file" href="' + a.dataUrl.replace(/"/g, '') + '" download="' + escapeHtml(a.name || 'image.webp') + '"><i class="fa-solid fa-download"></i> ' + escapeHtml(a.name || 'image.webp') + '</a>' +
          '</div>';
      } else if (a.dataUrl) {
        attachHtml =
          '<div class="chat-attach">' +
          '<a class="chat-attach-file" href="' + a.dataUrl.replace(/"/g, '') + '" download="' + escapeHtml(a.name || 'file') + '">' +
          '<i class="fa-solid fa-paperclip"></i> ' + escapeHtml(a.name || 'file') +
          (a.size ? ' <span>(' + formatBytes(a.size) + ')</span>' : '') +
          '</a></div>';
      } else if (a.omitted) {
        attachHtml = '<div class="chat-attach"><span class="chat-attach-file">Attachment too large for history replay</span></div>';
      }
    }

    row.innerHTML =
      '<span class="chat-who">' + who + '</span>' +
      (body ? '<div class="chat-msg-body">' + body + '</div>' : '') +
      attachHtml;

    var img = row.querySelector('.chat-attach-img');
    if (img) {
      img.addEventListener('click', function () {
        openChatImagePreview(img.getAttribute('data-full'), img.getAttribute('data-name'));
      });
    }

    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function openChatImagePreview(src, name) {
    var overlay = $('chatPreviewOverlay');
    var img = $('chatPreviewImg');
    var dl = $('chatPreviewDownload');
    if (!overlay || !img) return;
    img.src = src || '';
    if (dl) {
      dl.href = src || '#';
      dl.setAttribute('download', name || 'image.webp');
    }
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeChatImagePreview() {
    var overlay = $('chatPreviewOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    var img = $('chatPreviewImg');
    if (img) img.src = '';
  }

  function compressImageToWebp(file, maxEdge, quality) {
    maxEdge = maxEdge || 720;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          function (blob) {
            if (!blob) return reject(new Error('Could not compress image'));
            var reader = new FileReader();
            reader.onload = function () {
              resolve({
                dataUrl: reader.result,
                mime: 'image/webp',
                name: (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp',
                size: blob.size,
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/webp',
          quality
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Invalid image'));
      };
      img.src = url;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function extractMentionsFromText(text) {
    var found = [];
    var re = /@([A-Za-z0-9_.\- ]{1,40})/g;
    var m;
    while ((m = re.exec(text))) {
      var name = m[1].trim();
      var p = participants.find(function (x) {
        return x.name && x.name.toLowerCase() === name.toLowerCase();
      });
      if (p) found.push({ id: p.id, name: p.name });
      else found.push({ id: '', name: name });
    }
    return found;
  }

  function sendChatPayload(text, attachment) {
    text = (text || '').trim();
    if (!text && !attachment) return;
    var mentions = extractMentionsFromText(text);
    sendWS({
      type: 'chat',
      text: text,
      mentions: mentions,
      attachment: attachment || null,
    });
  }

  function showReaction(msg) {
    const overlay = $('reactionOverlay');
    if (!overlay) return;
    const el = document.createElement('div');
    el.className = 'flying-reaction';
    el.textContent = msg.emoji || '👍';
    el.style.left = (20 + Math.random() * 60) + '%';
    overlay.appendChild(el);
    setTimeout(function () { el.remove(); }, 2100);
  }

  async function forceMuteLocal(msg) {
    try {
      if (room && room.localParticipant) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
      micOn = false;
      if (typeof updateMicButton === 'function') updateMicButton();
    } catch (e) { console.warn(e); }
    var who = msg.byName ? (' by ' + msg.byName) : '';
    var el = $('liveStatusText');
    if (el) el.textContent = 'Mic muted' + who;
  }

  function openContentModal(mode) {
    var modal = $('contentModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.dataset.mode = mode;
    var title = $('contentModalTitle');
    var urlInput = $('contentUrlInput');
    var fileArea = $('filePickArea');
    var err = $('contentModalError');
    if (err) err.classList.add('hidden');
    var urlLabel = document.querySelector('label[for="contentUrlInput"]');
    if (mode === 'url') {
      if (title) title.textContent = 'Browse a URL together';
      if (urlInput) { urlInput.classList.remove('hidden'); urlInput.required = true; }
      if (urlLabel) urlLabel.classList.remove('hidden');
      if (fileArea) fileArea.classList.add('hidden');
    } else if (mode === 'file') {
      if (title) title.textContent = 'Share a document';
      if (urlInput) { urlInput.classList.add('hidden'); urlInput.required = false; }
      if (urlLabel) urlLabel.classList.add('hidden');
      if (fileArea) fileArea.classList.remove('hidden');
      if ($('fileInput')) $('fileInput').accept = '.pdf,.csv,.xlsx,.xls,.pptx,.ppt,.doc,.docx,image/*';
    } else {
      if (title) title.textContent = 'Share a local movie';
      if (urlInput) { urlInput.classList.add('hidden'); urlInput.required = false; }
      if (urlLabel) urlLabel.classList.add('hidden');
      if (fileArea) fileArea.classList.remove('hidden');
      if ($('fileInput')) $('fileInput').accept = 'video/*';
    }
  }

  function closeContentModal() {
    var m = $('contentModal');
    if (m) m.classList.add('hidden');
  }

  if ($('contentModalClose')) $('contentModalClose').addEventListener('click', closeContentModal);
  if ($('contentModalBackdrop')) $('contentModalBackdrop').addEventListener('click', closeContentModal);
  if ($('browseUrlBtn')) $('browseUrlBtn').addEventListener('click', function () { openContentModal('url'); });
  if ($('shareFileBtn')) $('shareFileBtn').addEventListener('click', function () { openContentModal('file'); });
  if ($('shareVideoBtn')) $('shareVideoBtn').addEventListener('click', function () { openContentModal('video'); });

  if ($('contentForm')) $('contentForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var mode = ($('contentModal') && $('contentModal').dataset.mode) || 'url';
    var title = (($('contentTitleInput') && $('contentTitleInput').value) || '').trim();
    var uniform = !!($('contentUniformScroll') && $('contentUniformScroll').checked);
    var err = $('contentModalError');
    if (mode === 'url') {
      var url = (($('contentUrlInput') && $('contentUrlInput').value) || '').trim();
      if (!url) { if (err) { err.textContent = 'Enter a URL'; err.classList.remove('hidden'); } return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      sendWS({ type: 'content-start', contentType: 'url', title: title || url, url: url, scrollMode: uniform ? 'uniform' : 'free' });
      closeContentModal();
      return;
    }
    var file = $('fileInput') && $('fileInput').files && $('fileInput').files[0];
    if (!file) { if (err) { err.textContent = 'Choose a file'; err.classList.remove('hidden'); } return; }
    if (mode === 'video' || (file.type && file.type.indexOf('video/') === 0)) {
      await startLocalVideoShare(file, title || file.name, uniform);
      closeContentModal();
      return;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      await startPdfShare(file, title || file.name, uniform);
      closeContentModal();
      return;
    }
    if ((file.type && file.type.indexOf('image/') === 0) || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
      var ireader = new FileReader();
      ireader.onload = function () {
        sendWS({
          type: 'content-start',
          contentType: 'image',
          title: title || file.name,
          scrollMode: uniform ? 'uniform' : 'free',
          fileMeta: { name: file.name, size: file.size, mime: file.type || 'image/*', dataUrl: ireader.result }
        });
        closeContentModal();
      };
      ireader.readAsDataURL(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      if (typeof dataUrl === 'string' && dataUrl.length > 2000000) dataUrl = dataUrl.slice(0, 2000000);
      sendWS({
        type: 'content-start',
        contentType: 'file',
        title: title || file.name,
        scrollMode: uniform ? 'uniform' : 'free',
        fileMeta: { name: file.name, size: file.size, mime: file.type, dataUrl: dataUrl }
      });
      closeContentModal();
    };
    reader.readAsDataURL(file);
  });

  async function startLocalVideoShare(file, title, uniform) {
    if (localVideoObjectUrl) URL.revokeObjectURL(localVideoObjectUrl);
    localVideoObjectUrl = URL.createObjectURL(file);
    var vid = $('localMediaVideo');
    if (vid) {
      vid.src = localVideoObjectUrl;
      vid.classList.remove('hidden');
      try { await vid.play(); } catch (_) {}
    }
    try {
      if (room && room.localParticipant && vid && vid.captureStream) {
        var stream = vid.captureStream();
        var vTrack = stream.getVideoTracks()[0];
        if (vTrack) {
          // Publish as ScreenShare so existing subscribers attach it to the main stage
          await room.localParticipant.publishTrack(vTrack, {
            name: 'local-movie',
            source: LK.Track.Source.ScreenShare,
          });
          isSharing = true;
          if (typeof updateShareButton === 'function') updateShareButton();
          sendWS({ type: 'start-share' });
          // Owner also sees local element; others get the LiveKit track
          if (typeof watchParticipant === 'function' && currentMeeting) {
            watchingId = null;
            watchParticipant(currentMeeting.participantId);
          }
        }
      }
    } catch (e) { console.warn('local video publish', e); }
    sendWS({
      type: 'content-start',
      contentType: 'local-video',
      title: title,
      scrollMode: uniform ? 'uniform' : 'free',
      media: { playing: true, currentTime: 0 },
      fileMeta: { name: file.name, size: file.size, mime: file.type }
    });
  }

  async function startPdfShare(file, title, uniform) {
    var buf = await file.arrayBuffer();
    try {
      await window.pdfjsLibReady;
      if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
      pdfDoc = await window.pdfjsLib.getDocument({ data: buf }).promise;
      pdfPageNum = 1;
      await renderPdfPage(1);
      if (localVideoObjectUrl) URL.revokeObjectURL(localVideoObjectUrl);
      localVideoObjectUrl = URL.createObjectURL(file);
      sendWS({
        type: 'content-start',
        contentType: 'pdf',
        title: title,
        scrollMode: uniform ? 'uniform' : 'free',
        page: 1,
        fileMeta: { name: file.name, size: file.size, mime: 'application/pdf' }
      });
    } catch (e) {
      alert('Could not open PDF: ' + (e.message || e));
    }
  }

  async function renderPdfPage(num) {
    if (!pdfDoc) return;
    pdfPageNum = Math.max(1, Math.min(num, pdfDoc.numPages));
    var page = await pdfDoc.getPage(pdfPageNum);
    var canvas = $('pdfCanvas');
    var wrap = $('pdfCanvasWrap');
    if (!canvas || !wrap) return;
    wrap.classList.remove('hidden');
    var viewport = page.getViewport({ scale: 1.4 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
    var pdfLabel = $('pdfPageLabel');
    if (pdfLabel && pdfDoc) pdfLabel.textContent = pdfPageNum + ' / ' + pdfDoc.numPages;
  }

  function applyContentState(content) {
    currentContent = content;
    var view = $('contentView');
    var placeholder = $('bigPlaceholder');
    var remoteVideo = $('remoteVideo');
    if (!content) {
      if (view) view.classList.add('hidden');
      updateContentToolbar();
      return;
    }
    if (view) view.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
    if (remoteVideo) remoteVideo.style.opacity = '0';
    var frame = $('contentFrame');
    var fallback = $('contentFrameFallback');
    var pdfWrap = $('pdfCanvasWrap');
    var localVid = $('localMediaVideo');
    var imgEl = $('contentImage');
    if (frame) frame.classList.add('hidden');
    if (fallback) fallback.classList.add('hidden');
    if (pdfWrap) pdfWrap.classList.add('hidden');
    if (imgEl) imgEl.classList.add('hidden');
    if (localVid && content.type !== 'local-video') localVid.classList.add('hidden');

    if (content.type === 'url' && content.url) {
      if (frame) {
        frame.classList.remove('hidden');
        // Detect blocked embeds after load
        frame.onload = function () {
          try {
            // Same-origin only; cross-origin throws — treat empty as possible block
            var doc = frame.contentDocument;
            if (doc && (!doc.body || !doc.body.innerHTML)) showUrlFallback(content.url);
          } catch (e) {
            // Cross-origin: cannot inspect; many sites still refuse and show blank
            setTimeout(function () {
              // Heuristic: if still about:blank-ish user will use fallback button
            }, 800);
          }
        };
        if (frame.src !== content.url) frame.src = content.url;
      }
      var ext = $('contentOpenExternal');
      if (ext) ext.href = content.url;
      // Always offer external open in toolbar context via fallback toggle button
    } else if (content.type === 'pdf') {
      if (pdfWrap) pdfWrap.classList.remove('hidden');
      if (content.page && content.page !== pdfPageNum && pdfDoc) renderPdfPage(content.page);
    } else if (content.type === 'image' || (content.type === 'file' && content.fileMeta && /^image\//.test(content.fileMeta.mime || ''))) {
      if (imgEl && content.fileMeta && content.fileMeta.dataUrl) {
        imgEl.src = content.fileMeta.dataUrl;
        imgEl.classList.remove('hidden');
      }
    } else if (content.type === 'local-video') {
      // Owner: local element with controls. Others: LiveKit screen track on big view.
      if (content.ownerId === (currentMeeting && currentMeeting.participantId) && localVid) {
        localVid.classList.remove('hidden');
      }
    } else if (content.type === 'file') {
      // Downloadable only — show fallback message in toolbar title
    }
    updateContentToolbar();
  }

  function showUrlFallback(url) {
    var frame = $('contentFrame');
    var fallback = $('contentFrameFallback');
    if (frame) frame.classList.add('hidden');
    if (fallback) fallback.classList.remove('hidden');
    var ext = $('contentOpenExternal');
    if (ext && url) ext.href = url;
  }

  function applyContentUpdate(content, from) {
    if (!content) return;
    currentContent = content;
    if (content.type === 'pdf' && content.page != null && from !== currentMeeting?.participantId && content.scrollMode === 'uniform') {
      renderPdfPage(content.page);
    }
    if (content.type === 'local-video' && content.media && from !== currentMeeting?.participantId) {
      var vid = $('localMediaVideo');
      if (vid && content.ownerId === currentMeeting?.participantId) {
        if (typeof content.media.currentTime === 'number' && Math.abs(vid.currentTime - content.media.currentTime) > 1.5) {
          vid.currentTime = content.media.currentTime;
        }
        if (content.media.playing === false) vid.pause();
        else if (content.media.playing) vid.play().catch(function () {});
      }
    }
    updateContentToolbar();
  }

  function updateContentToolbar() {
    var c = currentContent;
    var title = $('contentTitle');
    var remoteBadge = $('remoteBadge');
    var claimBtn = $('claimRemoteBtn');
    var handoffBtn = $('handoffRemoteBtn');
    var scrollSel = $('scrollModeSelect');
    var dlBtn = $('downloadContentBtn');
    var stopBtn = $('stopContentBtn');
    var myId = currentMeeting && currentMeeting.participantId;
    if (!c) {
      [remoteBadge, claimBtn, handoffBtn, scrollSel, dlBtn, stopBtn].forEach(function (el) { if (el) el.classList.add('hidden'); });
      if (title) title.textContent = '';
      return;
    }
    if (title) title.textContent = c.title || 'Shared content';
    var isHolder = c.remoteHolderId === myId;
    var isOwner = c.ownerId === myId;
    if (remoteBadge) remoteBadge.classList.toggle('hidden', !isHolder);
    if (claimBtn) claimBtn.classList.toggle('hidden', !!isHolder);
    if (handoffBtn) handoffBtn.classList.toggle('hidden', !(isHolder || isOwner));
    if (scrollSel) {
      scrollSel.classList.toggle('hidden', !(isHolder || isOwner));
      scrollSel.value = c.scrollMode || 'uniform';
    }
    var isHost = !!(participants.find(function (p) { return p.id === myId; }) || {}).isHost;
    if (stopBtn) stopBtn.classList.toggle('hidden', !(isOwner || isHost));
    if (dlBtn) dlBtn.classList.toggle('hidden', !(c.fileMeta && c.type !== 'local-video'));
    var isPdf = c.type === 'pdf';
    var pdfPrev = $('pdfPrevBtn');
    var pdfNext = $('pdfNextBtn');
    var pdfLabel = $('pdfPageLabel');
    if (pdfPrev) pdfPrev.classList.toggle('hidden', !isPdf);
    if (pdfNext) pdfNext.classList.toggle('hidden', !isPdf);
    if (pdfLabel) {
      pdfLabel.classList.toggle('hidden', !isPdf);
      if (isPdf && pdfDoc) pdfLabel.textContent = pdfPageNum + ' / ' + pdfDoc.numPages;
      else if (isPdf) pdfLabel.textContent = (c.page || 1) + '';
    }
  }

  if ($('claimRemoteBtn')) $('claimRemoteBtn').addEventListener('click', function () { sendWS({ type: 'remote-claim' }); });
  if ($('stopContentBtn')) $('stopContentBtn').addEventListener('click', function () { sendWS({ type: 'content-stop' }); });
  if ($('scrollModeSelect')) $('scrollModeSelect').addEventListener('change', function (e) {
    sendWS({ type: 'content-update', scrollMode: e.target.value });
  });
  if ($('downloadContentBtn')) $('downloadContentBtn').addEventListener('click', function () {
    var meta = currentContent && currentContent.fileMeta;
    if (!meta) return;
    if (meta.dataUrl) {
      var a = document.createElement('a');
      a.href = meta.dataUrl;
      a.download = meta.name || 'download';
      a.click();
    } else if (localVideoObjectUrl) {
      var a2 = document.createElement('a');
      a2.href = localVideoObjectUrl;
      a2.download = meta.name || 'download';
      a2.click();
    }
  });

  if ($('handoffRemoteBtn')) $('handoffRemoteBtn').addEventListener('click', function () {
    var modal = $('handoffModal');
    var list = $('handoffList');
    if (!modal || !list) return;
    list.innerHTML = '';
    participants.forEach(function (p) {
      if (p.id === currentMeeting?.participantId) return;
      var li = document.createElement('li');
      li.innerHTML = '<i class="fa-solid ' + deviceIcon(p.device) + '"></i> ' + escapeHtml(p.name) + (p.isHost ? ' (Host)' : '');
      li.addEventListener('click', function () {
        sendWS({ type: 'remote-handoff', targetId: p.id });
        modal.classList.add('hidden');
      });
      list.appendChild(li);
    });
    var keep = document.createElement('li');
    keep.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Keep / reclaim as owner';
    keep.addEventListener('click', function () {
      sendWS({ type: 'remote-handoff', targetId: currentContent && currentContent.ownerId });
      modal.classList.add('hidden');
    });
    list.appendChild(keep);
    modal.classList.remove('hidden');
  });
  if ($('handoffModalClose')) $('handoffModalClose').addEventListener('click', function () { $('handoffModal').classList.add('hidden'); });
  if ($('handoffModalBackdrop')) $('handoffModalBackdrop').addEventListener('click', function () { $('handoffModal').classList.add('hidden'); });

  if ($('chatForm')) $('chatForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('chatInput');
    var text = (input && input.value || '').trim();
    if (!text) return;
    sendChatPayload(text, null);
    if (input) input.value = '';
    hideMentionMenu();
  });

  // --- @mention autocomplete ---
  var mentionActiveIndex = 0;
  function hideMentionMenu() {
    var menu = $('mentionMenu');
    if (menu) menu.classList.add('hidden');
  }
  function showMentionMenu(filter) {
    var menu = $('mentionMenu');
    if (!menu) return;
    var q = (filter || '').toLowerCase();
    var list = (participants || []).filter(function (p) {
      if (!p.name) return false;
      if (currentMeeting && p.id === currentMeeting.participantId) return false;
      return !q || p.name.toLowerCase().indexOf(q) === 0 || p.name.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 8);
    if (!list.length) {
      menu.classList.add('hidden');
      return;
    }
    mentionActiveIndex = 0;
    menu.innerHTML = list.map(function (p, i) {
      return '<div class="mention-item' + (i === 0 ? ' active' : '') + '" data-name="' + escapeHtml(p.name) + '" role="option">' + escapeHtml(p.name) + '</div>';
    }).join('');
    menu.classList.remove('hidden');
    menu.querySelectorAll('.mention-item').forEach(function (el) {
      el.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        insertMention(el.getAttribute('data-name'));
      });
    });
  }
  function insertMention(name) {
    var input = $('chatInput');
    if (!input || !name) return;
    var v = input.value || '';
    var caret = input.selectionStart != null ? input.selectionStart : v.length;
    var before = v.slice(0, caret);
    var after = v.slice(caret);
    var at = before.lastIndexOf('@');
    if (at < 0) return;
    var next = before.slice(0, at) + '@' + name + ' ' + after;
    input.value = next;
    var pos = at + name.length + 2;
    input.setSelectionRange(pos, pos);
    input.focus();
    hideMentionMenu();
  }
  if ($('chatInput')) {
    $('chatInput').addEventListener('input', function () {
      var input = $('chatInput');
      var v = input.value || '';
      var caret = input.selectionStart != null ? input.selectionStart : v.length;
      var before = v.slice(0, caret);
      var m = before.match(/@([A-Za-z0-9_.\-]*)$/);
      if (m) showMentionMenu(m[1] || '');
      else hideMentionMenu();
    });
    $('chatInput').addEventListener('keydown', function (e) {
      var menu = $('mentionMenu');
      if (!menu || menu.classList.contains('hidden')) return;
      var items = menu.querySelectorAll('.mention-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionActiveIndex = (mentionActiveIndex + 1) % items.length;
        items.forEach(function (el, i) { el.classList.toggle('active', i === mentionActiveIndex); });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionActiveIndex = (mentionActiveIndex - 1 + items.length) % items.length;
        items.forEach(function (el, i) { el.classList.toggle('active', i === mentionActiveIndex); });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        var active = items[mentionActiveIndex];
        if (active) {
          e.preventDefault();
          insertMention(active.getAttribute('data-name'));
        }
      } else if (e.key === 'Escape') {
        hideMentionMenu();
      }
    });
  }

  // Image (compressed webp 720) vs file attachment (original)
  if ($('chatImageBtn') && $('chatImageInput')) {
    $('chatImageBtn').addEventListener('click', function () { $('chatImageInput').click(); });
    $('chatImageInput').addEventListener('change', async function () {
      var file = $('chatImageInput').files && $('chatImageInput').files[0];
      $('chatImageInput').value = '';
      if (!file) return;
      try {
        var compressed = await compressImageToWebp(file, 720, 0.82);
        if (compressed.dataUrl.length > 900000) {
          alert('Image still too large after compression. Try a smaller picture.');
          return;
        }
        var caption = ($('chatInput') && $('chatInput').value || '').trim();
        sendChatPayload(caption, {
          kind: 'image',
          name: compressed.name,
          mime: compressed.mime,
          size: compressed.size,
          dataUrl: compressed.dataUrl,
        });
        if ($('chatInput')) $('chatInput').value = '';
      } catch (err) {
        alert(err.message || 'Could not process image');
      }
    });
  }
  if ($('chatAttachBtn') && $('chatFileInput')) {
    $('chatAttachBtn').addEventListener('click', function () { $('chatFileInput').click(); });
    $('chatFileInput').addEventListener('change', async function () {
      var file = $('chatFileInput').files && $('chatFileInput').files[0];
      $('chatFileInput').value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('Attachments are limited to 2 MB over chat. Use a link for larger files.');
        return;
      }
      try {
        var dataUrl = await readFileAsDataUrl(file);
        if (dataUrl.length > 2800000) {
          alert('File too large to send in chat (max ~2 MB).');
          return;
        }
        var caption = ($('chatInput') && $('chatInput').value || '').trim();
        sendChatPayload(caption, {
          kind: 'file',
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: dataUrl,
        });
        if ($('chatInput')) $('chatInput').value = '';
      } catch (err) {
        alert(err.message || 'Could not read file');
      }
    });
  }
  if ($('chatPreviewClose')) $('chatPreviewClose').addEventListener('click', closeChatImagePreview);
  if ($('chatPreviewBackdrop')) $('chatPreviewBackdrop').addEventListener('click', closeChatImagePreview);

  // Apply self color when auth / meeting ready
  try { applySelfChatColor(); } catch (_) {}

  document.querySelectorAll('.emoji-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var emoji = btn.getAttribute('data-emoji');
      if (emoji) sendWS({ type: 'reaction', emoji: emoji });
    });
  });

  if ($('deviceToggle')) $('deviceToggle').addEventListener('click', function () {
    showDeviceIcons = !showDeviceIcons;
    $('deviceToggle').setAttribute('aria-pressed', String(showDeviceIcons));
    renderParticipants();
  });

  function updateMeetingChrome() {
    var nameEl = $('meetingNameLabel');
    if (nameEl && currentMeeting) nameEl.textContent = currentMeeting.name || 'Meeting';
    var endBtn = $('endMeetBtn');
    var myId = currentMeeting && currentMeeting.participantId;
    var isHost = !!(currentMeeting && currentMeeting.isHost) || !!(participants.find(function (p) { return p.id === myId; }) || {}).isHost;
    if (endBtn) endBtn.classList.toggle('hidden', !isHost);
  }

  if ($('shareLinkBtn')) $('shareLinkBtn').addEventListener('click', async function () {
    if (!currentMeeting || !currentMeeting.code) return;
    var url = location.origin + meetingPath(currentMeeting.code);
    try { await navigator.clipboard.writeText(url); var t = $('liveStatusText'); if (t) t.textContent = 'Link copied'; }
    catch (e) { prompt('Copy invite link:', url); }
  });

  if ($('endMeetBtn')) $('endMeetBtn').addEventListener('click', function () {
    if (!confirm('End the meeting for everyone?')) return;
    sendWS({ type: 'end-meeting' });
  });

  if ($('meetingView')) {
    new MutationObserver(function () {
      if (!$('meetingView').classList.contains('hidden') && currentMeeting) {
        updateMeetingChrome();
        sendWS({ type: 'device', device: detectDevice() });
      }
    }).observe($('meetingView'), { attributes: true, attributeFilter: ['class'] });
  }

  document.querySelectorAll('.history-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.history-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var which = tab.getAttribute('data-tab');
      if ($('pastTab')) $('pastTab').classList.toggle('hidden', which !== 'past');
      if ($('scheduledTab')) $('scheduledTab').classList.toggle('hidden', which !== 'scheduled');
      if (which === 'scheduled') loadScheduled();
    });
  });

  async function loadScheduled() {
    if (!authToken) return;
    try {
      var res = await fetch('/api/schedule', { headers: { Authorization: 'Bearer ' + authToken } });
      var data = await res.json();
      var list = $('scheduledList');
      var empty = $('scheduledEmpty');
      if (!list) return;
      list.innerHTML = '';
      var meetings = data.meetings || [];
      if (empty) empty.classList.toggle('hidden', meetings.length > 0);
      meetings.forEach(function (m) {
        var li = document.createElement('li');
        li.className = 'history-item';
        var start = m.scheduledStart ? new Date(m.scheduledStart).toLocaleString() : '';
        var codeFmt = m.code ? (m.code.slice(0, 3) + '-' + m.code.slice(3)) : '';
        li.innerHTML = '<div><strong>' + escapeHtml(m.name) + '</strong> <span class="status-pill ' + escapeHtml(m.status) + '">' + escapeHtml(m.status) + '</span>' +
          (m.isLive ? ' <span class="status-pill live">in room</span>' : '') + '</div>' +
          '<div class="history-meta">' + escapeHtml(start) + ' · ' + escapeHtml(codeFmt) + '</div>' +
          '<div class="scheduled-item-actions">' +
          '<button type="button" class="btn small-btn primary-btn" data-start="' + m.id + '">Start</button>' +
          '<button type="button" class="btn small-btn" data-copy="' + escapeHtml(m.link || '') + '">Copy link</button>' +
          '<button type="button" class="btn small-btn danger-btn" data-del="' + m.id + '">Delete</button></div>';
        list.appendChild(li);
      });
      list.querySelectorAll('[data-start]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-start');
          var r = await fetch('/api/schedule/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
            body: JSON.stringify({ id: Number(id) })
          });
          var d = await r.json();
          if (!r.ok) return alert(d.error || 'Failed');
          if ($('historyCloseBtn')) $('historyCloseBtn').click();
          try {
            var joinRes = await fetch('/api/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}) },
              body: JSON.stringify({ code: d.code, participantName: (currentUser && (currentUser.displayName || currentUser.username)) || 'Host', device: detectDevice() })
            });
            if (joinRes.ok) {
              location.href = meetingPath(d.code);
            } else {
              var createName = $('createName');
              if (createName) createName.value = d.name || 'Scheduled meeting';
              alert('Room not live yet. Create a meeting with the same name and share the new link.');
            }
          } catch (ex) { console.error(ex); }
        });
      });
      list.querySelectorAll('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var link = location.origin + (btn.getAttribute('data-copy') || '');
          try { await navigator.clipboard.writeText(link); } catch (e) { prompt('Link', link); }
        });
      });
      list.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!confirm('Delete this scheduled meeting?')) return;
          await fetch('/api/schedule/' + btn.getAttribute('data-del'), { method: 'DELETE', headers: { Authorization: 'Bearer ' + authToken } });
          loadScheduled();
        });
      });
    } catch (e) { console.error(e); }
  }

  if ($('scheduleForm')) $('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('scheduleError');
    if (err) err.classList.add('hidden');
    if (!authToken) { if (err) { err.textContent = 'Log in to schedule'; err.classList.remove('hidden'); } return; }
    var name = ($('scheduleName') && $('scheduleName').value.trim()) || 'Scheduled meeting';
    var start = $('scheduleStart') && $('scheduleStart').value;
    var end = $('scheduleEnd') && $('scheduleEnd').value;
    if (!start) return;
    try {
      var res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
        body: JSON.stringify({ name: name, scheduledStart: new Date(start).toISOString(), scheduledEnd: end ? new Date(end).toISOString() : null })
      });
      var data = await res.json();
      if (!res.ok) { if (err) { err.textContent = data.error || 'Failed'; err.classList.remove('hidden'); } return; }
      if ($('scheduleName')) $('scheduleName').value = '';
      loadScheduled();
    } catch (ex) { if (err) { err.textContent = ex.message; err.classList.remove('hidden'); } }
  });

  if ($('localMediaVideo')) $('localMediaVideo').addEventListener('timeupdate', function () {
    if (!currentContent || currentContent.type !== 'local-video') return;
    if (currentContent.remoteHolderId !== (currentMeeting && currentMeeting.participantId)) return;
    var vid = $('localMediaVideo');
    if (!vid) return;
    sendWS({ type: 'content-update', media: { currentTime: vid.currentTime, playing: !vid.paused } });
  });

  function pdfGo(delta) {
    if (!currentContent || currentContent.type !== 'pdf') return;
    var myId = currentMeeting && currentMeeting.participantId;
    var canControl = currentContent.remoteHolderId === myId || currentContent.ownerId === myId;
    if (!canControl && currentContent.scrollMode === 'uniform') return;
    var next = (pdfPageNum || 1) + delta;
    if (pdfDoc) next = Math.max(1, Math.min(next, pdfDoc.numPages));
    renderPdfPage(next);
    if (canControl) sendWS({ type: 'content-update', page: next });
  }
  if ($('pdfPrevBtn')) $('pdfPrevBtn').addEventListener('click', function () { pdfGo(-1); });
  if ($('pdfNextBtn')) $('pdfNextBtn').addEventListener('click', function () { pdfGo(1); });
  document.addEventListener('keydown', function (e) {
    if (!currentContent) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (currentContent.type === 'pdf') {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); pdfGo(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); pdfGo(-1); }
    }
  });
  // Manual "site blocked" helper: double-click iframe area opens fallback
  if ($('contentFrame')) {
    $('contentFrame').addEventListener('load', function () {
      // After short delay, if URL share and user reports blank, they can use Open in new tab
      var c = currentContent;
      if (c && c.type === 'url' && c.url) {
        var ext = $('contentOpenExternal');
        if (ext) ext.href = c.url;
      }
    });
  }

  restoreSession().then(function () { tryRejoinFromUrl(); });
})();
