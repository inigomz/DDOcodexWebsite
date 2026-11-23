const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ddocodexweb';
const invalidTokenCodes = new Set([
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/id-token-expired'
]);

function authResponse(statusCode, error) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error })
  };
}

async function requireUser(event) {
  const headers = Object.entries(event.headers || {});
  const authorization = headers.find(([name]) => name.toLowerCase() === 'authorization')?.[1];
  const match = typeof authorization === 'string' && /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return { response: authResponse(401, 'Sign in to continue.') };
  }

  try {
    const app = getApps().find(app => app.name === 'ddo-auth') ||
      initializeApp({ projectId }, 'ddo-auth');
    // The Admin SDK checks the signature, expiry, and Firebase project.
    const user = await getAuth(app).verifyIdToken(match[1]);
    return { user };
  } catch (error) {
    if (invalidTokenCodes.has(error.code)) {
      return { response: authResponse(401, 'Invalid or expired sign-in token.') };
    }
    console.error('Firebase token verification unavailable:', error.code);
    return { response: authResponse(503, 'Sign-in verification is temporarily unavailable.') };
  }
}

async function requireAdmin(event) {
  const result = await requireUser(event);
  if (result.user && result.user.admin !== true) {
    return { response: authResponse(403, 'Admin access is required.') };
  }
  return result;
}

module.exports = { authResponse, requireUser, requireAdmin };
