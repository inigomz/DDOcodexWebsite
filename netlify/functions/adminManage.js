const { authResponse, jsonResponse, requireAdmin } = require('../lib/auth');
const { getSavedBuilds, validBuildId, buildKey, listBuilds, pageSize } = require('../lib/savedBuilds');
const { notifyGearsetChange } = require('../lib/gearsetEvents');

exports.handler = async function handler(event) {
  const method = event.httpMethod;
  if (!['GET', 'DELETE'].includes(method)) {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, DELETE' });
  }

  const { response, auth } = await requireAdmin(event, true);
  if (response) return response;

  const { resource, after, uid, id } = event.queryStringParameters || {};
  if (!['users', 'gearsets'].includes(resource) ||
      (after && (typeof after !== 'string' || after.length > 2048))) {
    return authResponse(400, 'Invalid resource or page cursor.');
  }
  if (method === 'DELETE' && (typeof uid !== 'string' || !uid.length || uid.length > 128 ||
      (resource === 'gearsets' && !validBuildId(id)))) {
    return authResponse(400, 'A valid account or gearset ID is required.');
  }

  try {
    if (resource === 'users') {
      if (method === 'DELETE') {
        await auth.deleteUser(uid);
        return jsonResponse(200, { deleted: true });
      }
      const { users, pageToken } = await auth.listUsers(pageSize, after || undefined);
      return jsonResponse(200, {
        users: users.map(user => ({
          uid: user.uid, displayName: user.displayName, email: user.email,
          role: user.customClaims?.admin === true ? 'Admin' : 'User'
        })),
        next: pageToken || null
      });
    }

    const collection = await getSavedBuilds();
    if (method === 'GET') return jsonResponse(200, await listBuilds(collection, after));
    const result = await collection.deleteOne({ _id: buildKey(uid, id), ownerUid: uid });
    if (!result.deletedCount) return authResponse(404, 'Gearset not found.');
    await notifyGearsetChange(uid);
    return jsonResponse(200, { deleted: true });
  } catch (error) {
    if (error.code === 'auth/user-not-found') return authResponse(404, 'Account not found.');
    if (error.code === 'auth/invalid-page-token') return authResponse(400, 'Invalid page cursor.');
    console.error('Admin operation failed:', error.code || error.name);
    return authResponse(503, 'The admin operation is temporarily unavailable.');
  }
};
