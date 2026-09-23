(function (global) {
  global.MeetFeatures = global.MeetFeatures || {};
  global.MeetFeatures.mute = {
    id: 'mute',
    messageTypes: ['mute-participant', 'unmute-self', 'force-mute'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
