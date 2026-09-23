(function (global) {
  global.MeetRegistry && global.MeetRegistry.register({
    id: 'chat',
    register(ctx) {
      const bus = ctx.bus;
      if (!bus) return;
      // Core app still owns DOM; plugin documents protocol + future UI mount points
      bus.on('ws:chat', function () {});
      bus.on('ws:chat-history', function () {});
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
