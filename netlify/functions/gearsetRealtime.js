const { authResponse, jsonResponse, requireAdmin, requireUser } = require('../lib/auth');
const { adminChannel, ownerChannel, getRealtimeRest } = require('../lib/gearsetEvents');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  }

  const scope = event.queryStringParameters?.scope;
  if (!['owner', 'admin'].includes(scope)) return authResponse(400, 'Invalid realtime scope.');
  const authorize = scope === 'admin' ? requireAdmin : requireUser;
  const { response, user } = await authorize(event, true);
  if (response) return response;

  try {
    const ably = getRealtimeRest();
    if (!ably) {
      console.error('Gearset WebSocket authorization: ABLY_API_KEY is missing from the functions environment.');
      return authResponse(503, 'Live updates are not configured.');
    }

    const channel = scope === 'admin' ? adminChannel : ownerChannel(user.uid);
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: ownerChannel(user.uid),
      ttl: 5 * 60 * 1000,
      capability: { [channel]: ['subscribe'] }
    });
    return jsonResponse(200, { channel, tokenRequest });
  } catch (error) {
    console.error('Gearset WebSocket authorization failed:', error.code || error.name);
    return authResponse(503, 'Live updates are temporarily unavailable.');
  }
};
