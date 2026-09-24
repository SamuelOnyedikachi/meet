# v1.5.2 — Moderation surface (A–D)

## Fixed
- **A** Host/co-host permissions sticky via `ensureModPermissions()` / `canModerateNow()`
- **B** Participant ⋯ menu: always for host/cohost, fixed positioning, z-index 3000, outside-click next tick
- **C** Menu actions: mute, ask-unmute, lower hand, stop share, co-host, transfer, remove, admit/decline, per-user perms
- **D** Ready for smoke test after deploy

## Test
1. Create meeting as host
2. Second user joins
3. Click ⋯ on their name → menu with Mute / Remove / etc.
4. Mute and Remove should work
