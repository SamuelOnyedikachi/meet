/**
 * Tiny event bus — shared by core + features (Phase 1 foundation for Phase 2 plugins).
 */
(function (global) {
  const listeners = new Map();

  const bus = {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => bus.off(event, fn);
    },
    off(event, fn) {
      const set = listeners.get(event);
      if (set) set.delete(fn);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      set.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error('[bus]', event, e);
        }
      });
    },
    once(event, fn) {
      const wrap = (payload) => {
        bus.off(event, wrap);
        fn(payload);
      };
      return bus.on(event, wrap);
    },
  };

  global.MeetBus = bus;
})(typeof window !== 'undefined' ? window : globalThis);
