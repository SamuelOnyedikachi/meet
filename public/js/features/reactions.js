(function (global) {
  global.MeetFeatures = global.MeetFeatures || {};
  global.MeetFeatures.reactions = {
    id: 'reactions',
    messageTypes: ['reaction'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
