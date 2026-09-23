const path = require('path');

const PORT = process.env.PORT || 1880;
const PUBLIC = path.join(__dirname, '..', 'public');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-meet-secret-key-32chars';
const JWT_TTL = process.env.JWT_TTL || '30d';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const ACCOUNTS_URL = (process.env.ACCOUNTS_URL || 'https://accounts.collab.name.ng').replace(/\/$/, '');
const ACCOUNTS_JWT_SECRET = process.env.ACCOUNTS_JWT_SECRET || process.env.ACCOUNTS_SECRET_KEY || '';

const MEETING_INACTIVITY_MS = 12 * 60 * 60 * 1000;
const MEETING_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

module.exports = {
  PORT,
  PUBLIC,
  JWT_SECRET,
  JWT_TTL,
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  ACCOUNTS_URL,
  ACCOUNTS_JWT_SECRET,
  MEETING_INACTIVITY_MS,
  MEETING_CLEANUP_INTERVAL_MS,
  MIME,
};
