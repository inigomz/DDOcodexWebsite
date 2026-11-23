const { authResponse, requireAdmin } = require('../lib/auth');

// Use the same guard at the entry point of future catalog write functions.
exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    const response = authResponse(405, 'Method not allowed.');
    response.headers.Allow = 'GET';
    return response;
  }

  const { response } = await requireAdmin(event);
  return response || { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
};
