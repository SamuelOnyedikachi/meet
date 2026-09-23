const { WebSocketServer } = require('ws');
const {
  getMeeting,
  getParticipantsList,
  getContentState,
  broadcast,
  setClient,
  deleteClient,
  getClient,
  clients,
} = require('../rooms/store');
const { endMeeting } = require('../rooms/lifecycle');

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/' });

  server.on('upgrade', (req) => {
    console.log(
      `[WS UPGRADE] ${new Date().toISOString()} url=${req.url} origin=${req.headers.origin || '-'} ` +
      `host=${req.headers.host || '-'} upgrade-header=${req.headers.upgrade || '-'}`
    );
  });

wss.on('connection', (ws, req) => {
  let participantId = null;
  let meetingCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'register') {
      participantId = msg.participantId;
      meetingCode = (msg.code || '').toUpperCase();

      const old = clients.get(participantId);
      if (old && old !== ws) {
        try { old.close(); } catch (_) {}
      }
      clients.set(participantId, ws);

      const meeting = meetings.get(meetingCode);
      if (meeting) {
        meeting.lastActivity = Date.now();
        if (!Array.isArray(meeting.chatHistory)) meeting.chatHistory = [];
        ws.send(JSON.stringify({
          type: 'participants',
          participants: getParticipantsList(meeting),
        }));
        ws.send(JSON.stringify({
          type: 'content-state',
          content: getContentState(meeting),
        }));
        // Catch-up chat for late joiners (last 100 messages)
        if (meeting.chatHistory.length) {
          ws.send(JSON.stringify({
            type: 'chat-history',
            messages: meeting.chatHistory.slice(-100),
          }));
        }
      }
      return;
    }

    if (!participantId || !meetingCode) return;
    const meeting = meetings.get(meetingCode);
    if (!meeting) return;
    meeting.lastActivity = Date.now();

    if (msg.type === 'start-share') {
      const p = meeting.participants.get(participantId);
      if (p) {
        p.sharing = true;
        broadcast(meetingCode, {
          type: 'share-started',
          participantId,
          participants: getParticipantsList(meeting),
        });
      }
      return;
    }

    if (msg.type === 'stop-share') {
      const p = meeting.participants.get(participantId);
      if (p) {
        p.sharing = false;
        broadcast(meetingCode, {
          type: 'share-stopped',
          participantId,
          participants: getParticipantsList(meeting),
        });
      }
      return;
    }

    // Chat message
    if (msg.type === 'chat') {
      const p = meeting.participants.get(participantId);
      if (!p) return;
      const text = String(msg.text || '').trim().slice(0, 500);
      if (!text) return;
      const chatMsg = {
        type: 'chat',
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        participantId,
        name: p.name,
        text,
        at: Date.now(),
      };
      if (!Array.isArray(meeting.chatHistory)) meeting.chatHistory = [];
      meeting.chatHistory.push(chatMsg);
      if (meeting.chatHistory.length > 200) {
        meeting.chatHistory = meeting.chatHistory.slice(-150);
      }
      broadcast(meetingCode, chatMsg);
      return;
    }

    // Emoji reaction
    if (msg.type === 'reaction') {
      const p = meeting.participants.get(participantId);
      if (!p) return;
      const emoji = String(msg.emoji || '').slice(0, 8);
      if (!emoji) return;
      broadcast(meetingCode, {
        type: 'reaction',
        participantId,
        name: p.name,
        emoji,
        at: Date.now(),
      });
      return;
    }

    // Device type update
    if (msg.type === 'device') {
      const p = meeting.participants.get(participantId);
      if (p) {
        p.device = ['mobile', 'tablet', 'desktop'].includes(msg.device) ? msg.device : 'desktop';
        broadcast(meetingCode, {
          type: 'participants',
          participants: getParticipantsList(meeting),
        });
      }
      return;
    }

    // Mute another participant's mic (host or any user can request)
    if (msg.type === 'mute-participant') {
      const targetId = msg.targetId;
      const target = meeting.participants.get(targetId);
      if (!target) return;
      target.mutedByHost = true;
      const tws = clients.get(targetId);
      if (tws && tws.readyState === 1) {
        try {
          tws.send(JSON.stringify({
            type: 'force-mute',
            by: participantId,
            byName: meeting.participants.get(participantId)?.name,
          }));
        } catch (_) {}
      }
      broadcast(meetingCode, {
        type: 'participants',
        participants: getParticipantsList(meeting),
      });
      return;
    }

    if (msg.type === 'unmute-self') {
      const p = meeting.participants.get(participantId);
      if (p) p.mutedByHost = false;
      broadcast(meetingCode, {
        type: 'participants',
        participants: getParticipantsList(meeting),
      });
      return;
    }

    // Shared content: URL, local-video meta, document
    if (msg.type === 'content-start') {
      const p = meeting.participants.get(participantId);
      if (!p) return;
      const ctype = msg.contentType || 'url';
      meeting.content = {
        type: ctype,
        title: String(msg.title || 'Shared content').slice(0, 80),
        url: msg.url || null,
        ownerId: participantId,
        remoteHolderId: participantId,
        scrollMode: msg.scrollMode === 'free' ? 'free' : 'uniform',
        scroll: msg.scroll || { x: 0, y: 0 },
        page: msg.page || 1,
        media: msg.media || null,
        fileMeta: msg.fileMeta || null,
      };
      broadcast(meetingCode, {
        type: 'content-state',
        content: getContentState(meeting),
      });
      return;
    }

    if (msg.type === 'content-stop') {
      if (!meeting.content) return;
      const isOwner = meeting.content.ownerId === participantId;
      const isHost = meeting.participants.get(participantId)?.isHost;
      if (!isOwner && !isHost) return;
      meeting.content = null;
      broadcast(meetingCode, {
        type: 'content-state',
        content: null,
      });
      return;
    }

    if (msg.type === 'content-update') {
      if (!meeting.content) return;
      const holder = meeting.content.remoteHolderId;
      const isHolder = holder === participantId;
      const isOwner = meeting.content.ownerId === participantId;
      if (!isHolder && !isOwner) return;
      if (msg.scroll) meeting.content.scroll = msg.scroll;
      if (msg.page != null) meeting.content.page = msg.page;
      if (msg.media) meeting.content.media = { ...meeting.content.media, ...msg.media };
      if (msg.scrollMode) meeting.content.scrollMode = msg.scrollMode === 'free' ? 'free' : 'uniform';
      if (msg.title) meeting.content.title = String(msg.title).slice(0, 80);
      broadcast(meetingCode, {
        type: 'content-update',
        content: getContentState(meeting),
        from: participantId,
      }, participantId);
      return;
    }

    // Remote handoff: give control to another user
    if (msg.type === 'remote-handoff') {
      if (!meeting.content) return;
      const targetId = msg.targetId;
      const isOwner = meeting.content.ownerId === participantId;
      const isHolder = meeting.content.remoteHolderId === participantId;
      const isHost = meeting.participants.get(participantId)?.isHost;
      if (!isOwner && !isHolder && !isHost) return;
      if (targetId && !meeting.participants.has(targetId)) return;
      meeting.content.remoteHolderId = targetId || meeting.content.ownerId;
      broadcast(meetingCode, {
        type: 'content-state',
        content: getContentState(meeting),
      });
      return;
    }

    // Claim remote when holder is offline or anyone can pick up
    if (msg.type === 'remote-claim') {
      if (!meeting.content) return;
      const holderId = meeting.content.remoteHolderId;
      const holderOnline = holderId && clients.has(holderId) && clients.get(holderId)?.readyState === 1;
      const isOwner = meeting.content.ownerId === participantId;
      // Owner can always reclaim; others only if holder offline
      if (isOwner || !holderOnline) {
        meeting.content.remoteHolderId = participantId;
        broadcast(meetingCode, {
          type: 'content-state',
          content: getContentState(meeting),
        });
      }
      return;
    }

    // Host ends the meeting for everyone
    if (msg.type === 'end-meeting') {
      const p = meeting.participants.get(participantId);
      if (p && p.isHost) {
        endMeeting(meetingCode, 'host-ended');
      }
      return;
    }
  });

  ws.on('close', () => {
    if (participantId && clients.get(participantId) === ws) {
      clients.delete(participantId);
      // Notify others of offline so remote can be claimed
      if (meetingCode) {
        const meeting = meetings.get(meetingCode);
        if (meeting) {
          broadcast(meetingCode, {
            type: 'participants',
            participants: getParticipantsList(meeting),
          });
          // If content remote holder went offline, keep state but others can claim
          if (meeting.content && meeting.content.remoteHolderId === participantId) {
            broadcast(meetingCode, {
              type: 'content-state',
              content: getContentState(meeting),
            });
          }
        }
      }
    }
  });

  ws.on('error', () => {
    if (participantId && clients.get(participantId) === ws) {
      clients.delete(participantId);
    }
  });
});

  return wss;
}

module.exports = { attachWebSocket };
