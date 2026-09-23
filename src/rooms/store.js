/** Active meetings (runtime only). code -> meeting object */
const meetings = new Map();
/** participantId -> WebSocket */
const clients = new Map();

function getMeeting(code) {
  return meetings.get(String(code || '').toUpperCase());
}

function setMeeting(code, meeting) {
  meetings.set(String(code).toUpperCase(), meeting);
  return meeting;
}

function deleteMeeting(code) {
  meetings.delete(String(code || '').toUpperCase());
}

function allMeetings() {
  return meetings;
}

function getClient(participantId) {
  return clients.get(participantId);
}

function setClient(participantId, ws) {
  clients.set(participantId, ws);
}

function deleteClient(participantId) {
  clients.delete(participantId);
}

function hasClient(participantId) {
  const ws = clients.get(participantId);
  return !!(ws && ws.readyState === 1);
}

function getParticipantsList(meeting) {
  if (!meeting) return [];
  return Array.from(meeting.participants.values()).map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    sharing: !!p.sharing,
    userId: p.userId || null,
    device: p.device || 'desktop',
    mutedByHost: !!p.mutedByHost,
    online: hasClient(p.id),
  }));
}

function getContentState(meeting) {
  if (!meeting || !meeting.content) return null;
  const c = meeting.content;
  return {
    type: c.type,
    title: c.title,
    url: c.url || null,
    ownerId: c.ownerId,
    remoteHolderId: c.remoteHolderId,
    scrollMode: c.scrollMode || 'uniform',
    scroll: c.scroll || null,
    page: c.page || null,
    media: c.media || null,
    fileMeta: c.fileMeta || null,
  };
}

function broadcast(code, message, excludeId = null) {
  const meeting = getMeeting(code);
  if (!meeting) return;
  const payload = JSON.stringify(message);
  for (const [pid] of meeting.participants) {
    if (pid === excludeId) continue;
    const ws = clients.get(pid);
    if (ws && ws.readyState === 1) {
      try {
        ws.send(payload);
      } catch (_) {}
    }
  }
}

function generateCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let code;
  do {
    let L = '';
    let N = '';
    for (let i = 0; i < 3; i++) L += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 3; i++) N += digits[Math.floor(Math.random() * digits.length)];
    code = L + N;
  } while (meetings.has(code));
  return code;
}

function normalizeParticipantName(raw) {
  const name = String(raw || '').trim().slice(0, 40);
  if (name.length < 2) return null;
  if (/^(guest|host)$/i.test(name)) return null;
  return name;
}

function touchMeeting(code) {
  const meeting = getMeeting(code);
  if (meeting) meeting.lastActivity = Date.now();
}

module.exports = {
  meetings,
  clients,
  getMeeting,
  setMeeting,
  deleteMeeting,
  allMeetings,
  getClient,
  setClient,
  deleteClient,
  hasClient,
  getParticipantsList,
  getContentState,
  broadcast,
  generateCode,
  normalizeParticipantName,
  touchMeeting,
};
