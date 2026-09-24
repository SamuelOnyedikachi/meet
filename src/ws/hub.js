const { WebSocketServer } = require('ws');
const db = require('../../db');
const config = require('../config');
const { features } = require('../lib/features');
const {
  getMeeting,
  getParticipantsList,
  getWaitingList,
  getRaisedHands,
  getContentState,
  getSecurityState,
  broadcast,
  broadcastToModerators,
  sendToParticipant,
  setClient,
  deleteClient,
  getClient,
  clients,
} = require('../rooms/store');
const { endMeeting } = require('../rooms/lifecycle');
const { registerBuiltinPlugins, loadAll } = require('../plugins');

function createPluginContext() {
  const wsHandlers = new Map();
  const registerHooks = [];

  return {
    config,
    db,
    features,
    clients,
    getMeeting,
    getParticipantsList,
    getWaitingList,
    getRaisedHands,
    getContentState,
    getSecurityState,
    broadcast,
    broadcastToModerators,
    sendToParticipant,
    getClient,
    setClient,
    deleteClient,
    endMeeting,
    onWs(type, handler) {
      if (!wsHandlers.has(type)) wsHandlers.set(type, []);
      wsHandlers.get(type).push(handler);
    },
    onRegister(fn) {
      registerHooks.push(fn);
    },
    _wsHandlers: wsHandlers,
    _registerHooks: registerHooks,
  };
}

function attachWebSocket(server) {
  registerBuiltinPlugins();
  const ctx = createPluginContext();
  loadAll(ctx);

  const wss = new WebSocketServer({ server, path: '/' });

  server.on('upgrade', (req) => {
    console.log(
      `[WS UPGRADE] ${new Date().toISOString()} url=${req.url} origin=${req.headers.origin || '-'} ` +
        `host=${req.headers.host || '-'} upgrade-header=${req.headers.upgrade || '-'}`
    );
  });

  wss.on('connection', (ws) => {
    let participantId = null;
    let meetingCode = null;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'register') {
        participantId = msg.participantId;
        meetingCode = (msg.code || '').toUpperCase();

        const old = clients.get(participantId);
        if (old && old !== ws) {
          try {
            old.close();
          } catch (_) {}
        }
        setClient(participantId, ws);

        const meeting = getMeeting(meetingCode);
        if (meeting) {
          meeting.lastActivity = Date.now();
          if (!Array.isArray(meeting.chatHistory)) meeting.chatHistory = [];
          try {
            const p = meeting.participants.get(participantId);
            ws.send(
              JSON.stringify({
                type: 'participants',
                participants: getParticipantsList(meeting),
                waiting: getWaitingList(meeting),
                raisedHands: getRaisedHands(meeting),
                security: getSecurityState(meeting),
                self: p ? { id: p.id, role: p.role, status: p.status } : null,
              })
            );
          } catch (_) {}
          for (const hook of ctx._registerHooks) {
            try {
              hook(ws, meeting, participantId);
            } catch (e) {
              console.error('[ws] onRegister hook', e.message);
            }
          }
        }
        return;
      }

      if (!participantId || !meetingCode) return;
      const meeting = getMeeting(meetingCode);
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
          if (typeof ctx.logActivity === 'function') {
            try { ctx.logActivity(meeting, 'share_started', p); } catch (_) {}
          }
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
          if (typeof ctx.logActivity === 'function') {
            try { ctx.logActivity(meeting, 'share_stopped', p); } catch (_) {}
          }
        }
        return;
      }

      if (msg.type === 'end-meeting') {
        const p = meeting.participants.get(participantId);
        if (p && p.isHost) {
          endMeeting(meetingCode, 'host-ended');
        }
        return;
      }

      const handlers = ctx._wsHandlers.get(msg.type);
      if (handlers && handlers.length) {
        const payload = { msg, participantId, meeting, meetingCode, ws };
        for (const h of handlers) {
          try {
            h(payload);
          } catch (e) {
            console.error('[ws] plugin handler ' + msg.type + ':', e.message);
          }
        }
      }
    });

    ws.on('close', () => {
      if (participantId && clients.get(participantId) === ws) {
        deleteClient(participantId);
        if (meetingCode) {
          const meeting = getMeeting(meetingCode);
          if (meeting) {
            broadcast(meetingCode, {
              type: 'participants',
              participants: getParticipantsList(meeting),
              waiting: getWaitingList(meeting),
              raisedHands: getRaisedHands(meeting),
            });
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
        deleteClient(participantId);
      }
    });
  });

  return wss;
}

module.exports = { attachWebSocket };
