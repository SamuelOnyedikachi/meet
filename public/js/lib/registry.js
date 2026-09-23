/**
 * Phase 2 client plugin registry
 */
(function (global) {
  const plugins = new Map();

  global.MeetRegistry = {
    register(plugin) {
      if (!plugin || !plugin.id) return;
      plugins.set(plugin.id, plugin);
    },
    get(id) {
      return plugins.get(id);
    },
    all() {
      return Array.from(plugins.values());
    },
    /**
     * @param {object} ctx - { bus, features, api, sendWS, $ }
     */
    boot(ctx) {
      const features = (ctx && ctx.features) || {};
      for (const plugin of plugins.values()) {
        if (features[plugin.id] === false) {
          console.log('[MeetRegistry] skip', plugin.id);
          continue;
        }
        if (typeof plugin.register === 'function') {
          try {
            plugin.register(ctx);
            console.log('[MeetRegistry] registered', plugin.id);
          } catch (e) {
            console.error('[MeetRegistry] failed', plugin.id, e);
          }
        }
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
