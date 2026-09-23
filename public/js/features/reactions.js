(function (global) {
  global.MeetRegistry && global.MeetRegistry.register({
    id: 'reactions',
    register(ctx) {
      if (ctx.bus) ctx.bus.on('ws:reaction', function () {});
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
