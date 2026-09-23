# Phase 2 — Plugins completed

## Server plugins (`src/plugins/`)

| Plugin | Flag | Responsibility |
|--------|------|----------------|
| chat | FEATURE_CHAT | chat + chat-history on register |
| reactions | FEATURE_REACTIONS | emoji broadcast |
| mute | FEATURE_MUTE | mute-participant, unmute-self |
| deviceIcons | FEATURE_DEVICE_ICONS | device type on roster |
| content | FEATURE_CONTENT (default off) | content-*/remote-* WS |

**Core (not plugins):** register, start-share, stop-share, end-meeting, HTTP create/join/auth/LiveKit.

Disable example:
```
FEATURE_CHAT=0
FEATURE_SCHEDULE=0
```

`/api/config` returns `{ features: { chat, reactions, ... } }`.

## Client

- `js/lib/registry.js` — MeetRegistry.register / boot
- Feature scripts register with `id` + `register(ctx)`
- `MeetBoot(features)` from `/api/config`
- Core UI/logic remains `js/core/app.js` (behavior stable)

## Create meeting fix

- Restored missing `endMeeting` import in HTTP routes (broke leave / empty room)
- Avoided `src/config.js` vs `src/config/` directory collision
- HTTP handler errors now logged and return JSON 500 instead of hanging

## Deploy

Copy entire `src/`, `public/`, `server.js`, `db.js`. Confirm container logs show:
```
[features] {"chat":true,...}
[plugins] registered: chat
...
Meet is running at ...
```
