(function (global) {
  global.MeetFeatures = global.MeetFeatures || {};
  global.MeetFeatures.schedule = {
    id: 'schedule',
    api: ['/api/schedule'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
