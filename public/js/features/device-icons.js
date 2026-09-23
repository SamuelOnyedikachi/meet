(function (global) {
  global.MeetRegistry && global.MeetRegistry.register({
    id: 'deviceIcons',
    register(ctx) {
      if (ctx.bus) ctx.bus.on('device:toggle', function () {});
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
