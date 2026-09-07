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
      if (createYourName && !createYourName.value) createYourName.value = name;
      if (joinYourName && !joinYourName.value) joinYourName.value = name;
    } else {
      authArea?.classList.remove('hidden');
      userArea?.classList.add('hidden');
    }
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
        renderParticipants();
        renderCards();
        if ((msg.type === 'participant-left' || msg.type === 'share-stopped') && watchingId === msg.participantId) {
          clearBigView();
        }
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
    room = new LK.Room({
      adaptiveStream: false,
      dynacast: true,
      // Prefer VP8 for widest compatibility (avoid intermittent AV1 black screens)
      publishDefaults: {
        videoCodec: 'vp8',
        screenShareEncoding: {
          maxBitrate: 3_000_000,
          maxFramerate: 30,
        },
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
      })
      .on(LK.RoomEvent.Disconnected, (reason) => {
        console.warn('[LiveKit] disconnected', reason);
      });

    try {
      console.log('[LiveKit] connecting to', url);
      await room.connect(url, tokenData.token);
      console.log('[LiveKit] connect OK, state=', room.state);
      micOn = false;
      updateMicButton();
      // Pick up any screen shares that were already published before we joined
      attachExistingRemoteScreenTracks();
    } catch (e) {
      console.error('[LiveKit] connect failed', e);
      alert('Could not connect to media server: ' + (e.message || e));
      room = null;
    }
  }

  function attachExistingRemoteScreenTracks() {
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (
          publication.track &&
          publication.source === LK.Track.Source.ScreenShare &&
          publication.track.kind === LK.Track.Kind.Video
        ) {
          handleTrackSubscribed(publication.track, publication, participant);
        }
      });
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
        mediaStreamTrack: track.mediaStreamTrack
          ? {
              id: track.mediaStreamTrack.id,
              readyState: track.mediaStreamTrack.readyState,
              enabled: track.mediaStreamTrack.enabled,
              muted: track.mediaStreamTrack.muted,
              label: track.mediaStreamTrack.label,
            }
          : null,
      });
      // Request highest available quality for screen content
      try {
        if (publication.setVideoQuality && LK.VideoQuality) {
          publication.setVideoQuality(LK.VideoQuality.HIGH);
        }
        if (typeof publication.setSubscribed === 'function' && !publication.isSubscribed) {
          publication.setSubscribed(true);
        }
      } catch (_) {}
      const p = participants.find(x => x.id === identity);
      if (p && !p.sharing) { p.sharing = true; renderCards(); }
      // Auto-watch if nothing is currently selected, or if we were already waiting for this person
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

  function attachScreenToBigView(track, identity) {
    const existing = document.getElementById('lkScreenVideo');
    if (existing) {
      try { track.detach(existing); } catch (_) {}
      existing.remove();
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
      'z-index:1',
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
    const lkVid = document.getElementById('lkScreenVideo');
    if (lkVid) try { lkVid.remove(); } catch (_) {}
    if (remoteVideo) {
      remoteVideo.style.display = '';
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

  async function startShare() {
    if (!room?.localParticipant) { alert('Not connected to media server yet.'); return; }
    try {
      // createScreenTracks gives us the MediaStreamTrack so we can log + set contentHint
      // before publish. Falls back to setScreenShareEnabled if createScreenTracks is unavailable.
      if (typeof room.localParticipant.createScreenTracks === 'function') {
        const tracks = await room.localParticipant.createScreenTracks({
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
          contentHint: 'detail',
        });
        for (const t of tracks) {
          if (t.mediaStreamTrack && t.kind === 'video') {
            try { t.mediaStreamTrack.contentHint = 'detail'; } catch (_) {}
          }
          console.log('[LiveKit] publishing screen track', {
            kind: t.kind,
            source: t.source,
            id: t.mediaStreamTrack?.id,
            readyState: t.mediaStreamTrack?.readyState,
            label: t.mediaStreamTrack?.label,
          });
          await room.localParticipant.publishTrack(t, {
            source: t.kind === 'video' ? LK.Track.Source.ScreenShare : LK.Track.Source.ScreenShareAudio,
            videoCodec: 'vp8',
            simulcast: false,
          });
        }
      } else {
        await room.localParticipant.setScreenShareEnabled(true, {
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
          contentHint: 'detail',
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
    if (watchingId === remoteId) return;
    // Detach any previous screen video without wiping the new watchingId
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

  function renderParticipants() {
    if (!participantList) return;
    participantList.innerHTML = '';
    if (participantCount) participantCount.textContent = String(participants.length);
    participants.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'participant-item';
      if (p.isHost) li.classList.add('host');
      if (p.id === currentMeeting?.participantId) li.classList.add('me');
      li.innerHTML = `
        <span class="p-name">${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">Host</span>' : ''}${p.id === currentMeeting?.participantId ? ' <span class="me-tag">(you)</span>' : ''}</span>
        ${p.sharing ? '<span class="live-dot" title="Sharing screen"></span>' : ''}
      `;
      participantList.appendChild(li);
    });
  }

  function renderCards() {
    if (!screenCards) return;
    screenCards.innerHTML = '';
    participants.forEach((p) => {
      const sharing = p.sharing || (p.id === currentMeeting?.participantId && isSharing);
      const card = document.createElement('div');
      card.className = 'screen-card';
      if (sharing) card.classList.add('sharing');
      if (watchingId === p.id) card.classList.add('watching', 'active');
      card.innerHTML = `
        <i class="fa-solid fa-desktop card-icon"></i>
        <span class="card-name">${escapeHtml(p.name)}</span>
        <span class="card-status">${sharing ? 'LIVE' : ''}</span>
      `;
      card.addEventListener('click', () => onCardClick(p));
      screenCards.appendChild(card);
    });
  }

  async function onCardClick(p) {
    if (!currentMeeting) return;
    // Own card: if already sharing, show own screen in the main view (do not stop sharing).
    // Start sharing only when not currently sharing.
    if (p.id === currentMeeting.participantId) {
      const sharing = isSharing || p.sharing;
      if (sharing) {
        if (watchingId === p.id) return;
        await watchParticipant(p.id);
        return;
      }
      await startShare();
      return;
    }
    if (!p.sharing) return;
    if (watchingId === p.id) return;
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

  restoreSession().then(() => tryRejoinFromUrl());
})();
