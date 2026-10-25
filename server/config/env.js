/**
 * Startup configuration check. Refuses to boot with missing or placeholder
 * secrets rather than silently running with an insecure default.
 */
const PLACEHOLDER_SECRET = /your-strong-secret|changeme|replace-me|secret-here/i;

function validateConfig(env = process.env) {
  const problems = [];

  const uri = env.MONGODB_URI || '';
  if (!uri) {
    problems.push('MONGODB_URI must be set.');
  } else {
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
    if (/<[^>]*>/.test(uri)) problems.push('MONGODB_URI still contains a <placeholder>. Replace it with your real database user, password and cluster host.');
  }

  if (env.PUBLIC_BASE_URL !== undefined && env.PUBLIC_BASE_URL !== '') {
    let parsed = null;
    try {
      parsed = new URL(env.PUBLIC_BASE_URL);
    } catch {
      /* reported below */
    }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      problems.push('PUBLIC_BASE_URL must be an absolute http:// or https:// URL, for example https://passport.example.org.');
    }
  }

  const secret = env.JWT_SECRET || '';
  if (secret.length < 32) problems.push('JWT_SECRET must be set and at least 32 characters long.');
  if (secret && PLACEHOLDER_SECRET.test(secret)) problems.push('JWT_SECRET still contains a placeholder value.');

  if (env.NODE_ENV === 'production' && env.ALLOW_DEV_SEED === 'true') {
    problems.push('ALLOW_DEV_SEED must not be enabled in production.');
  }

  return problems;
}

function assertConfig(env = process.env) {
  const problems = validateConfig(env);
  if (problems.length) {
    const error = new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
    error.configProblems = problems;
    throw error;
  }
}

module.exports = { validateConfig, assertConfig };
