const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ddocodexweb';
const invalidTokenCodes = new Set([
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found'
]);

function jsonResponse(statusCode, data, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(data)
  };
}

function authResponse(statusCode, error) {
  return jsonResponse(statusCode, { error });
}

function getServerAuth(checkRevoked) {
  const name = checkRevoked ? 'ddo-account-management' : 'ddo-auth';
  let app = getApps().find(app => app.name === name);
  if (!app) {
    const options = { projectId };
    if (checkRevoked) {
      const configuredAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (configuredAccount) {
        const serviceAccount = JSON.parse(configuredAccount);
        if (serviceAccount.project_id !== projectId) {
          throw new Error('Firebase account management credentials must match the Firebase project.');
        }
        options.credential = cert(serviceAccount);
      } else {
        options.credential = applicationDefault();
      }
    }
    app = initializeApp(options, name);
  }
  return getAuth(app);
}

async function requireUser(event, checkRevoked = false) {
  const headers = Object.entries(event.headers || {});
  const authorization = headers.find(([name]) => name.toLowerCase() === 'authorization')?.[1];
  const match = typeof authorization === 'string' && /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return { response: authResponse(401, 'Sign in to continue.') };
  }

  try {
    const auth = getServerAuth(checkRevoked);
    const user = await auth.verifyIdToken(match[1], checkRevoked);
    return { user, auth };
  } catch (error) {
    if (invalidTokenCodes.has(error.code)) {
      return { response: authResponse(401, 'Invalid or expired sign-in token.') };
    }
    console.error('Firebase token verification unavailable:', error.code);
    return { response: authResponse(503, 'Sign-in verification is temporarily unavailable.') };
  }
}

async function requireAdmin(event, checkRevoked = false) {
  const result = await requireUser(event, checkRevoked);
  if (result.response) return result;
  if (result.user && result.user.admin !== true) {
    return { response: authResponse(403, 'Admin access is required.') };
  }
  if (checkRevoked) {
    try {
      // Recheck the current claim before account management, even if the token predates a demotion.
      const account = await result.auth.getUser(result.user.uid);
      if (account.disabled || account.customClaims?.admin !== true) {
        return { response: authResponse(403, 'Admin access is required.') };
      }
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return { response: authResponse(401, 'Invalid or expired sign-in token.') };
      }
      console.error('Firebase admin verification unavailable:', error.code);
      return { response: authResponse(503, 'Sign-in verification is temporarily unavailable.') };
    }
  }
  return result;
}

module.exports = { authResponse, jsonResponse, requireUser, requireAdmin };
