/** Screen timeline: up to 3 host/cohost images shown as active screens + optional slideshow */
module.exports = {
  id: 'screenTimeline',
  register(ctx) {
    const { broadcast, clients } = ctx;

    function ensure(meeting) {
      if (!meeting.screenTimeline) {
        meeting.screenTimeline = { items: [], slideshow: false };
      }
      return meeting.screenTimeline;
    }

    function canEdit(meeting, participantId) {
      const p = meeting.participants.get(participantId);
      if (!p) return false;
      return !!(p.isHost || p.role === 'host' || p.role === 'cohost' || p.role === 'participant');
    }

    ctx.onWs('screen-timeline-add', ({ msg, participantId, meeting, meetingCode }) => {
      if (!canEdit(meeting, participantId)) return;
      const st = ensure(meeting);
      if (!msg.item || !msg.item.dataUrl) return;
      if (st.items.length >= 3) return;
      const item = {
        id: String(msg.item.id || ('st-' + Date.now())).slice(0, 64),
        dataUrl: String(msg.item.dataUrl).slice(0, 2_500_000),
        ownerId: participantId,
        ownerName: String(msg.item.ownerName || meeting.participants.get(participantId)?.name || 'Host').slice(0, 64),
      };
      st.items.push(item);
      broadcast(meetingCode, { type: 'screen-timeline-add', item });
    });

    ctx.onWs('screen-timeline-remove', ({ msg, participantId, meeting, meetingCode }) => {
      if (!canEdit(meeting, participantId)) return;
      const st = ensure(meeting);
      const id = msg.id;
      st.items = st.items.filter((x) => x.id !== id);
      broadcast(meetingCode, { type: 'screen-timeline-remove', id });
    });

    ctx.onWs('screen-timeline-slideshow', ({ msg, participantId, meeting, meetingCode }) => {
      if (!canEdit(meeting, participantId)) return;
      const st = ensure(meeting);
      st.slideshow = !!msg.on;
      broadcast(meetingCode, { type: 'screen-timeline-slideshow', on: st.slideshow });
    });

    ctx.onRegister((ws, meeting) => {
      if (!meeting) return;
      const st = ensure(meeting);
      try {
        ws.send(JSON.stringify({
          type: 'screen-timeline-state',
          items: st.items,
          slideshow: st.slideshow,
        }));
      } catch (_) {}
    });
  },
};
