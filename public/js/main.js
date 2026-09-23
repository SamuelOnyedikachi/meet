/**
 * Client entry — Phase 1
 * Loads feature manifests then core app (behavior unchanged).
 * Phase 2 will call MeetFeatures[id].register(ctx) instead of monolithic app.
 */
(function () {
  if (window.MeetBus) {
    window.MeetBus.emit('app:boot', { phase: 1 });
  }
  const ids = window.MeetFeatures ? Object.keys(window.MeetFeatures) : [];
  console.log('[modular] Phase 1 client features:', ids.join(', ') || '(none)');
})();
