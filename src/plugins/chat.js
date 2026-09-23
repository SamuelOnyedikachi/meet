/** Plugin: in-meeting chat + history for late joiners */
module.exports = {
  id: 'chat',
  register(ctx) {
    const { broadcast, getMeeting } = ctx;

    ctx.onWs('chat', ({ msg, participantId, meeting, meetingCode }) => {
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
    });

    ctx.onRegister((ws, meeting) => {
      if (!meeting || !Array.isArray(meeting.chatHistory) || !meeting.chatHistory.length) return;
      try {
        ws.send(
          JSON.stringify({
            type: 'chat-history',
            messages: meeting.chatHistory.slice(-100),
          })
        );
      } catch (_) {}
    });
  },
};
