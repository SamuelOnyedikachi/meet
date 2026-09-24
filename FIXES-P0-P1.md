# P0 + P1 fixes (full zip)

## P0 — Critical wiring
1. **Host permissions on create** — `/api/create` returns `permissions`; client also defaults full host perms when `isHost`
2. **Admitted → full meeting** — leave button, badge, polling, LiveKit, roster after waiting-room admit
3. **Force stop share** — menu sends `force-stop-share`; server stops target + notifies client to `stopShare()`
4. **Screen-share permission gate** — `start-share` requires `can(..., 'screenShare')`
5. **People search** — filters In-meeting list by name/role

## P1 — Blueprint core UX
6. **Invite key enforcement** — when `requireInviteKey` / `inviteAccess: 'approval'`, join requires valid `?key=`
7. **Invite drawer** — Share / Invite opens drawer; Copy link + Regenerate (`/api/invite/regenerate`)
8. **Create Advanced settings** — waiting room, guest, share, mic, chat, reactions, require invitation link
9. **Admit all / Decline all / Lower all** — bulk buttons in People panel
10. **Guest label** — shows under join name when not logged in
11. **Rejoin bar** — session + URL code match → Rejoin with same participantId when possible

## How to verify
- Create as host → Security button visible; participant ⋯ works
- Advanced: enable waiting room → second user waits → Admit → full meeting
- Require invitation link → join without key fails; with `?key=` works
- Raise hand → Lower all works
- Stop sharing on someone else → their share stops
- Share button → invite drawer → copy / regenerate

## Still later (not in this zip)
- Camera, chat-as-drawer, full visual redesign, LiveKit recording files, SQLite persistent membership, per-user permission editor
