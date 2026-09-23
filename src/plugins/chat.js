/** Plugin: in-meeting chat — text, mentions, images (webp), file attachments */

const MAX_TEXT = 2000;
const MAX_IMAGE_DATA_CHARS = 900_000; // ~0.7MB base64 after client webp compress
const MAX_FILE_DATA_CHARS = 2_800_000; // ~2MB base64 for generic attachments
const MAX_HISTORY = 150;

module.exports = {
  id: 'chat',
  register(ctx) {
    const { broadcast } = ctx;

    ctx.onWs('chat', ({ msg, participantId, meeting, meetingCode }) => {
      const p = meeting.participants.get(participantId);
      if (!p) return;

      const text = String(msg.text || '').trim().slice(0, MAX_TEXT);
      const mentions = Array.isArray(msg.mentions)
        ? msg.mentions
            .slice(0, 20)
            .map((m) => ({
              id: String(m.id || '').slice(0, 80),
              name: String(m.name || '').slice(0, 40),
            }))
            .filter((m) => m.id || m.name)
        : [];

      let attachment = null;
      if (msg.attachment && typeof msg.attachment === 'object') {
        const kind = msg.attachment.kind === 'image' ? 'image' : 'file';
        const name = String(msg.attachment.name || 'file').slice(0, 120);
        const mime = String(msg.attachment.mime || 'application/octet-stream').slice(0, 120);
        const dataUrl = String(msg.attachment.dataUrl || '');
        const maxChars = kind === 'image' ? MAX_IMAGE_DATA_CHARS : MAX_FILE_DATA_CHARS;
        if (dataUrl.startsWith('data:') && dataUrl.length <= maxChars) {
          attachment = {
            kind,
            name,
            mime,
            size: Number(msg.attachment.size) || dataUrl.length,
            dataUrl,
          };
        }
      }

      if (!text && !attachment) return;

      const chatMsg = {
        type: 'chat',
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        participantId,
        name: p.name,
        text,
        mentions,
        attachment,
        at: Date.now(),
      };

      if (!Array.isArray(meeting.chatHistory)) meeting.chatHistory = [];
      meeting.chatHistory.push(chatMsg);
      if (meeting.chatHistory.length > MAX_HISTORY * 1.3) {
        meeting.chatHistory = meeting.chatHistory.slice(-MAX_HISTORY);
      }
      broadcast(meetingCode, chatMsg);
    });

    ctx.onRegister((ws, meeting) => {
      if (!meeting || !Array.isArray(meeting.chatHistory) || !meeting.chatHistory.length) return;
      try {
        // Strip heavy dataUrls from history catch-up if too large overall
        const messages = meeting.chatHistory.slice(-80).map((m) => {
          if (!m.attachment || !m.attachment.dataUrl) return m;
          if (m.attachment.dataUrl.length > 400_000) {
            return {
              ...m,
              attachment: {
                ...m.attachment,
                dataUrl: null,
                omitted: true,
              },
            };
          }
          return m;
        });
        ws.send(JSON.stringify({ type: 'chat-history', messages }));
      } catch (_) {}
    });
  },
};
