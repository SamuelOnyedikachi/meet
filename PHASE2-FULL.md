# Meet — Full Phase 2 package (with P0/P1 fixes)

Version **1.5.0-phase2-full**

Includes:
- All Phase 1 core (roles, waiting room, security, raised hands, moderation)
- All P0/P1 wiring fixes
- Phase 2 professional features

## Phase 2 in this build

| Feature | Status |
|---------|--------|
| Persistent membership (SQLite) | Yes — `meeting_membership` on create/join/remove/role |
| Meeting activity timeline | Yes — drawer + API + live events |
| Connection diagnostics | Yes — Live status drawer (+ LiveKit connected hint) |
| Host transfer | Yes |
| Recording signaling | Yes — badge/timer/toasts (no media files yet) |
| Meeting templates | Yes — create + advanced settings |
| Per-user permissions | Yes — participant ⋯ menu toggles mic/share/chat |
| Invite drawer + key enforce | Yes |
| Camera button | Yes — LiveKit publish when room ready; shortcut **V** |
| Chat drawer toggle | Yes — floating panel mode |
| Keyboard | **M** mic · **S** share · **H** hand · **V** camera |

## Run
```bash
npm install
cp .env.example .env
node server.js
```

## Verify checklist
1. Create host → Security + participant menus work
2. Waiting room → Admit → full meeting
3. Require invitation link → `?key=` required
4. ⋯ → toggle Screen share off for a user → they cannot share
5. Activity drawer from more menu
6. Record (host) → badge for everyone
7. Camera button in toolbar
8. Rejoin after leave (logged-in / same session)
