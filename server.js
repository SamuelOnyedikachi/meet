/**
 * Meet entrypoint (Docker / npm start).
 * Phase 2: modular src/ + plugins
 */
try {
  require('./src').start();
} catch (err) {
  console.error('[FATAL] Meet failed to start:', err);
  process.exit(1);
}
