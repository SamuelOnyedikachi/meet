# Phase 1 — Modular layout (behavior unchanged)

## Server

```
server.js                 # entry → require('./src').start()
src/
  index.js                # HTTP + WS + cleanup
  config.js
  lib/http.js
  lib/auth.js
  rooms/store.js          # meetings Map, broadcast, codes
  rooms/lifecycle.js      # endMeeting, inactivity cleanup
  livekit/tokens.js
  http/routes.js          # all REST + static
  ws/hub.js               # WebSocket handlers
  features/               # Phase 2 homes (docs only for now)
db.js                     # SQLite (unchanged path)
```

## Client

```
public/js/
  lib/events.js           # MeetBus
  main.js                 # boot log
  features/*.js           # manifests (ids + message types)
  core/app.js             # full app logic (former script.js)
public/script.js          # deprecated stub
```

## Deploy

Dockerfile copies `src/` and `public/`. Still: `node server.js`.

## Phase 2 next

Move handlers from `ws/hub.js` / `core/app.js` into `register(ctx)` plugins + feature flags.
