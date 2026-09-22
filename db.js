const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'meet.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meeting_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    host_user_id INTEGER,
    host_display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    max_participants INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_meeting_history_host ON meeting_history(host_user_id);
  CREATE INDEX IF NOT EXISTS idx_meeting_history_code ON meeting_history(code);
  CREATE INDEX IF NOT EXISTS idx_meeting_history_created ON meeting_history(created_at DESC);

  CREATE TABLE IF NOT EXISTS meeting_participants_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_history_id INTEGER NOT NULL,
    user_id INTEGER,
    display_name TEXT NOT NULL,
    participant_id TEXT,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    left_at TEXT,
    FOREIGN KEY (meeting_history_id) REFERENCES meeting_history(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mpl_meeting ON meeting_participants_log(meeting_history_id);
  CREATE INDEX IF NOT EXISTS idx_mpl_user ON meeting_participants_log(user_id);

  CREATE TABLE IF NOT EXISTS scheduled_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    host_user_id INTEGER NOT NULL,
    host_display_name TEXT,
    scheduled_start TEXT NOT NULL,
    scheduled_end TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    ended_at TEXT,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scheduled_host ON scheduled_meetings(host_user_id);
  CREATE INDEX IF NOT EXISTS idx_scheduled_start ON scheduled_meetings(scheduled_start);
  CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_meetings(status);
`);

function createUser({ username, email, passwordHash }) {
  const stmt = db.prepare(
    `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`
  );
  const info = stmt.run(username, email, passwordHash);
  return getUserById(info.lastInsertRowid);
}

function getUserById(id) {
  return db.prepare(
    `SELECT id, username, email, created_at FROM users WHERE id = ?`
  ).get(id);
}

function getUserByEmail(email) {
  return db.prepare(
    `SELECT id, username, email, password_hash, created_at FROM users WHERE email = ? COLLATE NOCASE`
  ).get(email);
}

function getUserByUsername(username) {
  return db.prepare(
    `SELECT id, username, email, password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE`
  ).get(username);
}

function findUserByLogin(login) {
  const byEmail = getUserByEmail(login);
  if (byEmail) return byEmail;
  return getUserByUsername(login);
}

function startMeetingHistory({ code, name, hostUserId, hostDisplayName }) {
  const stmt = db.prepare(`
    INSERT INTO meeting_history (code, name, host_user_id, host_display_name, max_participants)
    VALUES (?, ?, ?, ?, 1)
  `);
  const info = stmt.run(code, name, hostUserId || null, hostDisplayName || null);
  return info.lastInsertRowid;
}

function logParticipantJoin({ meetingHistoryId, userId, displayName, participantId }) {
  const stmt = db.prepare(`
    INSERT INTO meeting_participants_log (meeting_history_id, user_id, display_name, participant_id)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(meetingHistoryId, userId || null, displayName, participantId || null);
  return info.lastInsertRowid;
}

function logParticipantLeave({ meetingHistoryId, participantId }) {
  db.prepare(`
    UPDATE meeting_participants_log
    SET left_at = datetime('now')
    WHERE meeting_history_id = ? AND participant_id = ? AND left_at IS NULL
  `).run(meetingHistoryId, participantId);
}

function updateMaxParticipants(meetingHistoryId, count) {
  db.prepare(`
    UPDATE meeting_history
    SET max_participants = MAX(max_participants, ?)
    WHERE id = ?
  `).run(count, meetingHistoryId);
}

function endMeetingHistory(meetingHistoryId) {
  db.prepare(`
    UPDATE meeting_history SET ended_at = datetime('now') WHERE id = ? AND ended_at IS NULL
  `).run(meetingHistoryId);
  db.prepare(`
    UPDATE meeting_participants_log SET left_at = datetime('now')
    WHERE meeting_history_id = ? AND left_at IS NULL
  `).run(meetingHistoryId);
}

function getHistoryForUser(userId, limit = 50) {
  return db.prepare(`
    SELECT DISTINCT
      mh.id,
      mh.code,
      mh.name,
      mh.host_user_id,
      mh.host_display_name,
      mh.created_at,
      mh.ended_at,
      mh.max_participants,
      CASE WHEN mh.host_user_id = ? THEN 1 ELSE 0 END AS was_host
    FROM meeting_history mh
    LEFT JOIN meeting_participants_log mpl ON mpl.meeting_history_id = mh.id
    WHERE mh.host_user_id = ? OR mpl.user_id = ?
    ORDER BY mh.created_at DESC
    LIMIT ?
  `).all(userId, userId, userId, limit);
}

function getMeetingParticipantsLog(meetingHistoryId) {
  return db.prepare(`
    SELECT id, user_id, display_name, participant_id, joined_at, left_at
    FROM meeting_participants_log
    WHERE meeting_history_id = ?
    ORDER BY joined_at ASC
  `).all(meetingHistoryId);
}

function getMeetingHistoryById(id) {
  return db.prepare(`SELECT * FROM meeting_history WHERE id = ?`).get(id);
}

// ----- Scheduled meetings -----

function createScheduledMeeting({ code, name, hostUserId, hostDisplayName, scheduledStart, scheduledEnd }) {
  const stmt = db.prepare(`
    INSERT INTO scheduled_meetings (code, name, host_user_id, host_display_name, scheduled_start, scheduled_end, status)
    VALUES (?, ?, ?, ?, ?, ?, 'scheduled')
  `);
  const info = stmt.run(code, name, hostUserId, hostDisplayName || null, scheduledStart, scheduledEnd || null);
  return getScheduledById(info.lastInsertRowid);
}

function getScheduledById(id) {
  return db.prepare(`SELECT * FROM scheduled_meetings WHERE id = ?`).get(id);
}

function getScheduledByCode(code) {
  return db.prepare(`SELECT * FROM scheduled_meetings WHERE code = ?`).get(code);
}

function getScheduledForUser(userId, limit = 50) {
  return db.prepare(`
    SELECT * FROM scheduled_meetings
    WHERE host_user_id = ?
    ORDER BY
      CASE status
        WHEN 'scheduled' THEN 0
        WHEN 'live' THEN 1
        WHEN 'ended' THEN 2
        ELSE 3
      END,
      scheduled_start ASC
    LIMIT ?
  `).all(userId, limit);
}

function updateScheduledStatus(id, status, extra = {}) {
  const sets = ['status = ?'];
  const vals = [status];
  if (extra.startedAt) {
    sets.push('started_at = ?');
    vals.push(extra.startedAt);
  }
  if (extra.endedAt) {
    sets.push('ended_at = ?');
    vals.push(extra.endedAt);
  }
  vals.push(id);
  db.prepare(`UPDATE scheduled_meetings SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getScheduledById(id);
}

function deleteScheduled(id, userId) {
  return db.prepare(`DELETE FROM scheduled_meetings WHERE id = ? AND host_user_id = ?`).run(id, userId);
}

module.exports = {
  db,
  DB_PATH,
  createUser,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  findUserByLogin,
  startMeetingHistory,
  logParticipantJoin,
  logParticipantLeave,
  updateMaxParticipants,
  endMeetingHistory,
  getHistoryForUser,
  getMeetingParticipantsLog,
  getMeetingHistoryById,
  createScheduledMeeting,
  getScheduledById,
  getScheduledByCode,
  getScheduledForUser,
  updateScheduledStatus,
  deleteScheduled,
};
