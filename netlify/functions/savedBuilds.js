const { authResponse, jsonResponse, requireUser } = require('../lib/auth');
const { getSavedBuilds, validBuildId, buildKey, listBuilds } = require('../lib/savedBuilds');
const { notifyGearsetChange } = require('../lib/gearsetEvents');

const maxBodyBytes = 512 * 1024;

exports.handler = async function handler(event) {
  const method = event.httpMethod;
  if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT, PATCH, DELETE' });
  }

  // Check account status as well as token validity so a deleted user's cached token is rejected.
  const { response, user } = await requireUser(event, true);
  if (response) return response;

  const { id, after } = event.queryStringParameters || {};
  if ((id !== undefined && !validBuildId(id)) || (method !== 'GET' && !id)) {
    return authResponse(400, 'A valid build ID is required.');
  }
  if (after && (typeof after !== 'string' || after.length > 165 || !after.startsWith(`${user.uid}:`))) {
    return authResponse(400, 'Invalid page cursor.');
  }

  const ownerUid = user.uid;
  const key = id && buildKey(ownerUid, id);
  let build;
  if (method === 'PUT' || method === 'PATCH') {
    if (Buffer.byteLength(event.body || '') > maxBodyBytes) {
      return authResponse(413, 'This gearset is too large to save.');
    }
    try {
      build = JSON.parse(event.body);
    } catch {
      return authResponse(400, 'Invalid JSON body.');
    }
    if (typeof build?.name !== 'string' || !build.name.trim() || build.name.trim().length > 100) {
      return authResponse(400, 'Provide a gearset name of 1 to 100 characters.');
    }
    if (method === 'PUT' &&
        (!Array.isArray(build.summary?.selectedGear) || typeof build.summary?.textSummary !== 'string')) {
      return authResponse(400, 'Provide a generated gearset.');
    }
  }

  try {
    const collection = await getSavedBuilds();
    if (method === 'GET' && !id) {
      return jsonResponse(200, await listBuilds(collection, after, ownerUid));
    }
    if (method === 'GET') {
      const document = await collection.findOne({ _id: key, ownerUid }, { projection: { _id: 0 } });
      return document ? jsonResponse(200, document) : authResponse(404, 'Gearset not found.');
    }
    if (method === 'DELETE') {
      const result = await collection.deleteOne({ _id: key, ownerUid });
      if (!result.deletedCount) return authResponse(404, 'Gearset not found.');
      await notifyGearsetChange(ownerUid);
      return jsonResponse(200, { deleted: true });
    }

    const updatedAt = new Date();
    const name = build.name.trim();
    if (method === 'PATCH') {
      const result = await collection.updateOne({ _id: key, ownerUid }, { $set: { name, updatedAt } });
      if (!result.matchedCount) return authResponse(404, 'Gearset not found.');
      await notifyGearsetChange(ownerUid);
      return jsonResponse(200, { id, name, updatedAt });
    }
    // The unique key combines the verified UID and build ID, so retries target the same document.
    const result = await collection.updateOne({ _id: key }, {
      $set: { name, summary: build.summary, updatedAt },
      $setOnInsert: { id, ownerUid, createdAt: updatedAt }
    }, { upsert: true });
    await notifyGearsetChange(ownerUid);
    return jsonResponse(result.upsertedCount ? 201 : 200, { id, name, updatedAt });
  } catch (error) {
    console.error('Saved gearset operation failed:', error.code || error.name);
    return authResponse(503, 'Saved gearsets are temporarily unavailable.');
  }
};
