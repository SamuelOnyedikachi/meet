/**
 * Client entry — Phase 2
 * Feature plugins register via MeetRegistry; core app still in js/core/app.js
 */
(function () {
  window.MeetBoot = function (features) {
    if (!window.MeetRegistry) return;
    window.MeetRegistry.boot({
      bus: window.MeetBus,
      features: features || {},
    });
  };
  // Default boot (before /api/config); core may call MeetBoot again with server flags
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.MeetBoot({});
    });
  } else {
    window.MeetBoot({});
  }
})();
