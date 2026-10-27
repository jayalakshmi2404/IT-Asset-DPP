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

  const anchorProvider = String(env.ANCHOR_PROVIDER || 'none').trim().toLowerCase();
  if (!['none', 'mock', 'ethereum'].includes(anchorProvider)) {
    problems.push('ANCHOR_PROVIDER must be "none", "mock" or "ethereum".');
  }
  // mock needs no RPC URL or key and never sends a transaction, so nothing else is checked for it.
  if (anchorProvider === 'ethereum') {
    if (!/^(https?|wss?):\/\//.test(env.ANCHOR_RPC_URL || '')) problems.push('ANCHOR_RPC_URL must be an http(s):// or ws(s):// endpoint when ANCHOR_PROVIDER=ethereum.');
    if (/<[^>]*>|your[-_ ]|placeholder/i.test(env.ANCHOR_RPC_URL || '')) problems.push('ANCHOR_RPC_URL still contains a placeholder.');
    if (!/^0x[0-9a-fA-F]{64}$/.test(env.ANCHOR_PRIVATE_KEY || '')) problems.push('ANCHOR_PRIVATE_KEY must be a 0x-prefixed 32-byte key when ANCHOR_PROVIDER=ethereum.');
    if (/<[^>]*>|your[-_ ]|placeholder/i.test(env.ANCHOR_PRIVATE_KEY || '')) problems.push('ANCHOR_PRIVATE_KEY still contains a placeholder.');
    const minConf = Number(env.ANCHOR_MIN_CONFIRMATIONS || 1);
    if (!Number.isInteger(minConf) || minConf < 1) problems.push('ANCHOR_MIN_CONFIRMATIONS must be an integer of at least 1.');
    // Only the Sepolia test network is supported. Mainnet and other networks are refused on purpose.
    const network = String(env.ANCHOR_NETWORK || 'sepolia').trim().toLowerCase();
    if (network !== 'sepolia') problems.push('ANCHOR_NETWORK must be "sepolia". Mainnet and other networks are not supported.');
    const chainId = Number(env.ANCHOR_CHAIN_ID || 11155111);
    if (!Number.isInteger(chainId) || chainId < 1) problems.push('ANCHOR_CHAIN_ID must be a positive integer (11155111 is Ethereum Sepolia).');
    else if (chainId !== 11155111) problems.push('ANCHOR_CHAIN_ID must be 11155111 (Ethereum Sepolia). Mainnet and other networks are refused.');
  }

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
