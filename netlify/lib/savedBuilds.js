const { MongoClient } = require('mongodb');

const pageSize = 25;
const metadata = { _id: 1, id: 1, ownerUid: 1, name: 1, updatedAt: 1 };
let connection;

async function getSavedBuilds() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MongoDB connection configuration.');

  if (!connection) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
    connection = client.connect().catch(async error => {
      connection = undefined;
      await client.close().catch(() => {});
      throw error;
    });
  }
  const client = await connection;
  return client.db(process.env.MONGODB_DB || 'ddocodex').collection('savedGearsets');
}

function validBuildId(id) {
  return typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
}

function buildKey(uid, id) {
  return `${uid}:${id}`;
}

async function listBuilds(collection, after, ownerUid) {
  const filter = {};
  if (ownerUid !== undefined) filter.ownerUid = ownerUid;
  if (after) filter._id = { $gt: after };
  const rows = await collection.find(filter, { projection: metadata })
    .sort({ _id: 1 }).limit(pageSize + 1).toArray();
  const page = rows.slice(0, pageSize);
  return {
    builds: page.map(({ _id, ...build }) => build),
    next: rows.length > pageSize ? page.at(-1)._id : null
  };
}

module.exports = { getSavedBuilds, validBuildId, buildKey, listBuilds, pageSize };
