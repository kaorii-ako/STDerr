// Shared Hack Club AI config, sourced from HACKCLUB_API_KEY in the environment.
// Every user shares the admin's key — no per-user keys or persistence.

/**
 * Return the shared Hack Club AI config from HACKCLUB_API_KEY env var.
 */
function getDefault() {
  const apiKey = process.env.HACKCLUB_API_KEY;
  if (!apiKey) return null;
  return { provider: 'hackclub', apiKey };
}

module.exports = { getDefault };
