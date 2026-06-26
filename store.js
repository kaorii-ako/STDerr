// Per-Slack-user config persistence. Maps user_id -> { provider, apiKey }.
// Plaintext JSON on disk — keep users.json out of version control (.gitignore).

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'users.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function get(userId) {
  return load()[userId] || null;
}

function set(userId, config) {
  const data = load();
  data[userId] = config;
  save(data);
}

module.exports = { get, set };
