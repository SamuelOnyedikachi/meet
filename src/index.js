/**
 * Meet server — Phase 1 modular entry
 * Wires config, HTTP routes, WebSocket hub, and lifecycle cleanup.
 */
const http = require('http');
const db = require('../db');
const config = require('./config');
const { createRequestHandler } = require('./http/routes');
const { attachWebSocket } = require('./ws/hub');
const { cleanupInactiveMeetings } = require('./rooms/lifecycle');
const { isLiveKitConfigured } = require('./livekit/tokens');

function start() {
  const handleRequest = createRequestHandler();
  const server = http.createServer(handleRequest);
  attachWebSocket(server);

  server.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Meet is running at http://0.0.0.0:${config.PORT}`);
    console.log(`[DB] SQLite at ${db.DB_PATH}`);
    if (!isLiveKitConfigured()) {
      console.warn(
        '[WARN] LiveKit env vars not fully set — screenshare/audio need LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.'
      );
    } else {
      console.log(`[LiveKit] clients will connect to ${config.LIVEKIT_URL}`);
    }
    if (config.JWT_SECRET === 'change-me-in-production-meet-secret-key-32chars') {
      console.warn('[WARN] Using default JWT_SECRET — set JWT_SECRET in production.');
    }
    if (config.ACCOUNTS_URL) {
      console.log(`[Accounts] SSO enabled → ${config.ACCOUNTS_URL}`);
    } else {
      console.log('[Accounts] ACCOUNTS_URL not set — using local Meet auth only');
    }
    setInterval(cleanupInactiveMeetings, config.MEETING_CLEANUP_INTERVAL_MS);
    console.log(
      `[meeting] inactivity cleanup every ${config.MEETING_CLEANUP_INTERVAL_MS / 60000} min ` +
        `(kill after ${config.MEETING_INACTIVITY_MS / 3600000}h)`
    );
    console.log('[modular] Phase 1 server modules loaded from src/');
  });

  return server;
}

module.exports = { start };

if (require.main === module) {
  start();
}
