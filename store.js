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
 * Return the default provider config when HACKCLUB_API_KEY env var is set.
 * Returns null if no shared default is configured.
 */
function getDefault() {
  const apiKey = process.env.HACKCLUB_API_KEY;
  if (!apiKey) return null;
  return { provider: 'hackclub', apiKey };
}

/**
 * Resolve the effective config for a user.
 * 1. If the user has an explicit /stderr-connect config, use that.
 * 2. Otherwise, fall back to the global default (HACKCLUB_API_KEY).
 * Returns null only if neither exists.
 */
function resolve(userId) {
  const userCfg = get(userId);
  const defaultCfg = getDefault();
  if (userCfg) {
    // If user has a provider but no apiKey, merge with default key
    if (!userCfg.apiKey && defaultCfg?.apiKey) {
      return { provider: userCfg.provider, apiKey: defaultCfg.apiKey };
    }
    return userCfg;
  }
  return defaultCfg;
}

module.exports = { get, set, getDefault, resolve };
