// Per-Slack-user config persistence. Maps user_id -> { provider, apiKey }.
// Plaintext JSON on disk — keep users.json out of version control (.gitignore).
//
// When HACKCLUB_API_KEY is set in the environment, new users are automatically
// routed to Hack Club AI without needing to run /stderr-connect first.

const fs = require('fs');
const path = require('path');
const os = require('os');

const FILE = path.join(__dirname, 'users.json');

// In-memory cache to avoid reading disk on every get().
// Keeps reads fast and reduces the window for race conditions.
let cache = null;
let cacheLoaded = false;

function loadFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Atomically write JSON data to disk.
 * Writes to a temp file first, then renames — a crash mid-write won't
 * corrupt the original file.
 */
function saveAtomic(data) {
  const tmp = path.join(os.tmpdir(), `users-${Date.now()}-${process.pid}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function ensureLoaded() {
  if (!cacheLoaded) {
    cache = loadFromDisk();
    cacheLoaded = true;
  }
}

function get(userId) {
  ensureLoaded();
  return cache[userId] || null;
}

function set(userId, config) {
  ensureLoaded();
  cache[userId] = config;
  saveAtomic(cache);
}

/**
 * Return the shared Hack Club AI config from HACKCLUB_API_KEY env var.
 * All users share the same key — no per-user provider selection.
 */
function getDefault() {
  const apiKey = process.env.HACKCLUB_API_KEY;
  if (!apiKey) return null;
  return { provider: 'hackclub', apiKey };
}

function remove(userId) {
  ensureLoaded();
  if (cache[userId]) {
    delete cache[userId];
    saveAtomic(cache);
    return true;
  }
  return false;
}

/**
 * Per-user key first (set via /stderr-connect), then the shared
 * HACKCLUB_API_KEY from .env as a fallback.
 */
function resolve(userId) {
  const user = get(userId);
  if (user && user.apiKey) return user;
  return getDefault();
}

module.exports = { get, set, remove, getDefault, resolve };
