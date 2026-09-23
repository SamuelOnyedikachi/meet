module.exports = {
  id: 'mute',
  register(ctx) {
    const { broadcast, getParticipantsList, getClient } = ctx;

    ctx.onWs('mute-participant', ({ msg, participantId, meeting, meetingCode }) => {
      const targetId = msg.targetId;
      const target = meeting.participants.get(targetId);
      if (!target) return;
      target.mutedByHost = true;
      const tws = getClient(targetId);
      if (tws && tws.readyState === 1) {
        try {
          tws.send(
            JSON.stringify({
              type: 'force-mute',
              by: participantId,
              byName: meeting.participants.get(participantId)?.name,
            })
          );
        } catch (_) {}
      }
      broadcast(meetingCode, {
        type: 'participants',
        participants: getParticipantsList(meeting),
      });
    });

    ctx.onWs('unmute-self', ({ participantId, meeting, meetingCode }) => {
      const p = meeting.participants.get(participantId);
      if (p) p.mutedByHost = false;
      broadcast(meetingCode, {
        type: 'participants',
        participants: getParticipantsList(meeting),
      });
    });
  },
};
