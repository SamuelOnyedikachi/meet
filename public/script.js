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

  function updateAuthUI() {
    if (currentUser) {
      authArea?.classList.add('hidden');
      userArea?.classList.remove('hidden');
      if (userLabel) userLabel.textContent = currentUser.username;
      if (createYourName && !createYourName.value) createYourName.value = currentUser.username;
      if (joinYourName && !joinYourName.value) joinYourName.value = currentUser.username;
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

  async function restoreSession() {
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
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          login: $('loginIdentity')?.value?.trim(),
          password: $('loginPassword')?.value,
        }),
      });
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('meet_token', authToken);
      updateAuthUI();
      closeAuthModal();
    } catch (err) {
      showError(loginError, err.message);
    }
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(signupError);
    try {
      const data = await api('/api/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: $('signupUsername')?.value?.trim(),
          email: $('signupEmail')?.value?.trim(),
          password: $('signupPassword')?.value,
        }),
      });
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
    if (!wsStatusEl) {
      wsStatusEl = document.createElement('div');
      wsStatusEl.id = 'wsDebugStatus';
      wsStatusEl.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:99999;font:11px/1.4 monospace;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,0.75);color:#fff;max-width:60vw;opacity:0.85;pointer-events:none;';
      document.body.appendChild(wsStatusEl);
    }
    wsStatusEl.textContent = 'WS: ' + text;
    wsStatusEl.style.background = isError ? 'rgba(180,30,30,0.85)' : 'rgba(0,0,0,0.75)';
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
      } catch (_) {}
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ----- LiveKit -----

  async function loadConfig() {
    try {
      const cfg = await api('/api/config');
      livekitUrl = cfg.livekitUrl || null;
    } catch (_) {}
  }

  async function connectLiveKit() {
    if (!LK || !currentMeeting) return;

    let tokenData;
    try {
      tokenData = await api('/api/livekit-token', {
        method: 'POST',
        body: JSON.stringify({
          code: currentMeeting.code,
          participantId: currentMeeting.participantId,
          participantName: currentMeeting.participantName || 'Guest',
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
        }
      })
      .on(LK.RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === LK.Track.Source.ScreenShare) {
          isSharing = false;
          updateShareButton();
          sendWS({ type: 'stop-share' });
          const me = participants.find(p => p.id === currentMeeting?.participantId);
          if (me) me.sharing = false;
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
    if (p.id === currentMeeting.participantId) {
      if (isSharing) await stopShare();
      else await startShare();
      return;
    }
    if (!p.sharing) return;
    if (watchingId === p.id) return;
    await watchParticipant(p.id);
  }

  // ----- Meeting lifecycle -----

  async function showMeeting(data, isHost) {
    currentMeeting = {
      code: data.code,
      letters: data.letters,
      numbers: data.numbers,
      name: data.name,
      participantId: data.participantId,
      participantName: isHost
        ? (createYourName?.value || currentUser?.username || 'Host').trim() || 'Host'
        : (joinYourName?.value || currentUser?.username || 'Guest').trim() || 'Guest',
      isHost: !!isHost,
    };
    participants = data.participants || [];

    homeView?.classList.add('hidden');
    historyView?.classList.add('hidden');
    meetingView?.classList.remove('hidden');
    leaveBtn?.classList.remove('hidden');
    if (meetingBadge) {
      meetingBadge.textContent = formatCode(data.letters, data.numbers);
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

  if (resizer && col1) {
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
      if (!dragging || !meetingView) return;
      const rect = meetingView.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(15, Math.min(50, pct));
      col1.style.flex = `0 0 ${pct}%`;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  copyCodeBtn?.addEventListener('click', async () => {
    if (!currentMeeting) return;
    try {
      await navigator.clipboard.writeText(currentMeeting.letters + currentMeeting.numbers);
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
    const yourName = (createYourName?.value || currentUser?.username || 'Host').trim() || 'Host';
    if (name.length < 2) {
      showError(createError, 'Please enter a meeting name (min 2 characters)');
      return;
    }
    createBtn.disabled = true;
    try {
      const data = await api('/api/create', {
        method: 'POST',
        body: JSON.stringify({ name, participantName: yourName }),
      });
      await showMeeting(data, true);
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
    const yourName = (joinYourName?.value || currentUser?.username || 'Guest').trim() || 'Guest';
    if (letters.length !== 3 || numbers.length !== 3) {
      showError(joinError, 'Enter 3 letters and 3 numbers');
      return;
    }
    joinBtn.disabled = true;
    try {
      const data = await api('/api/join', {
        method: 'POST',
        body: JSON.stringify({ letters, numbers, participantName: yourName }),
      });
      await showMeeting(data, false);
    } catch (e) {
      showError(joinError, e.message);
    } finally {
      joinBtn.disabled = false;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (currentMeeting) {
      const payload = JSON.stringify({
        code: currentMeeting.code,
        participantId: currentMeeting.participantId,
      });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/leave', blob);
      }
    }
  });

  restoreSession();
})();
