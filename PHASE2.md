# Phase 2 — Professional meeting platform

Builds on Phase 1 (roles, waiting room, security, raised hands, sleek moderation UI).

## Delivered

### 1. Meeting activity / audit
- SQLite `meeting_activity` table
- Live in-memory ring buffer + persistent log
- WS `activity` events
- `/api/activity?code=`
- Activity drawer (timeline UI)

### 2. Connection diagnostics
- Click Live status → diagnostics drawer
- Latency / network / quality hints (navigator.connection + WS state)
- Calm copy (Excellent / Fair / Unstable)

### 3. Host transfer
- Already in Phase 1 moderation (`transfer-host`); logged in activity

### 4. Recording
- Host-only start/stop via WS
- Options: audio, video, screen share, chat
- SQLite `meeting_recordings`
- Recording badge + timer in meeting chrome
- Participant toast on start/stop
- *Media capture / LiveKit egress wiring is the next integration step; signaling + state are complete*

### 5. Rich meeting history
- Existing history APIs retained
- Activity trail available per code for post-meeting review

### 6. Meeting templates
- Seeded templates: Blank, Research, Classroom, Team, Interview, Presentation
- `/api/templates`
- Create flow can apply template settings (waiting room, share, etc.)

### 7. Advanced permissions
- Phase 1 role + meeting-level security drawer
- Contextual per-participant actions (mute, role, remove) remain the primary surface

### 8. Keyboard shortcuts
- `M` microphone  
- `S` screen share  
- `H` raise/lower hand (Phase 1)

### 9. Persistent invitation foundation
- Invite tokens + regenerate (Phase 1)
- Templates + activity support longer-lived meeting ops

## Feature flags
```
FEATURE_ACTIVITY=1
FEATURE_RECORDING=1
FEATURE_TEMPLATES=1
FEATURE_DIAGNOSTICS=1
```

## Run
```bash
npm install
cp .env.example .env
node server.js
```

## Phase 2 follow-ups (optional)
- LiveKit Egress or client MediaRecorder for actual recording files
- Per-user permission editor UI
- Organization / classroom admin
- Full mobile bottom-sheet redesign
- Focus mode for multi-share
