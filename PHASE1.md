# Phase 1 — Core meeting experience + moderation

Built on top of the existing Meet modular stack (LiveKit, SQLite, plugins).

## What Phase 1 adds

### Architecture
- **Roles:** host · co-host · participant · guest
- **Permission model:** role defaults → meeting overrides → per-user overrides → server authorization
- **Membership states:** WAITING · ACTIVE · LEFT · REMOVED · BLOCKED
- **Meeting settings:** waiting room, guest access, lock, screen share / mic / chat / reactions / raise-hand gates, invite permissions

### Server
- `src/lib/permissions.js` — role defaults + `can()` / `resolvePermissions()`
- `src/rooms/store.js` — extended meeting object (settings, invite token, blocked sets, raised hands, waiting)
- `src/plugins/moderation.js` — raise/lower hand, ask-unmute, roles, transfer host, remove, admit/decline, lock, security
- `/api/create` — accepts advanced settings, returns invite token + link
- `/api/join` — waiting room, lock, guest access, block/rejoin checks
- `/api/invite/regenerate` — host regenerates secure link token
- WS messages: `raise-hand`, `lower-hand`, `lower-all-hands`, `ask-unmute`, `set-role`, `transfer-host`, `remove-participant`, `admit-participant`, `decline-participant`, `admit-all`, `decline-all`, `update-security`, `lock-meeting`, `unlock-meeting`

### Client UI
- Waiting room view (calm pulse state)
- People panel sections: In meeting · Raised hands · Waiting
- Contextual participant menu (mute, ask unmute, role, remove…)
- Raise-hand control + keyboard **H**
- Security drawer (shield)
- Remove confirmation with “prevent rejoin”
- Toast notifications (admit request, ask-unmute, lock…)
- Design tokens: `#F7F8FC` / `#625BFF` / `#18B981` / restrained danger

## Still on the Phase 1 backlog / polish
- Full visual redesign of home/create (advanced settings collapsed)
- Camera button (LiveKit video path beyond screen+audio)
- Secure link UI (copy / regenerate) in invite surface
- Username/email invite search (Accounts integration)
- Shared-element transitions for multi-share
- Full mobile bottom-sheet pattern for People/Chat/Security

## Phase 2 (next)
Meeting activity timeline, connection diagnostics, recording, templates, rich history, per-user permission editor, keyboard shortcut set, org features.

## Run
```bash
npm install
cp .env.example .env
node server.js
```
