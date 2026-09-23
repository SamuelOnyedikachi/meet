(function (global) {
  global.MeetRegistry && global.MeetRegistry.register({
    id: 'mute',
    register(ctx) {
      if (ctx.bus) ctx.bus.on('ws:force-mute', function () {});
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
