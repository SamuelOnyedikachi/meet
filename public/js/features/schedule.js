(function (global) {
  global.MeetRegistry && global.MeetRegistry.register({
    id: 'schedule',
    register(ctx) {
      if (ctx.features && ctx.features.schedule === false) {
        var tab = document.querySelector('.history-tab[data-tab="scheduled"]');
        if (tab) tab.classList.add('hidden');
      }
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
