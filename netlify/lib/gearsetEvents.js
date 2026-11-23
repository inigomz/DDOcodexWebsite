const { createHash } = require('node:crypto');
const { createHttpClient } = require('@ably/pubsub-server');

const adminChannel = 'gearsets:admin';
let client;

function ownerChannel(uid) {
  return `gearsets:owner:${createHash('sha256').update(uid).digest('hex')}`;
}

function getRealtimeRest() {
  if (!process.env.ABLY_API_KEY) return null;
  client ||= createHttpClient({
    key: process.env.ABLY_API_KEY,
    httpOpenTimeout: 2000,
    httpRequestTimeout: 2500,
    httpMaxRetryCount: 0
  });
  return client;
}

async function notifyGearsetChange(uid) {
  try {
    const ably = getRealtimeRest();
    if (!ably) return;

    // MongoDB is authoritative. Socket messages only tell clients to reload the list.
    const results = await Promise.allSettled([ownerChannel(uid), adminChannel].map(channel =>
      ably.channels.get(channel).publish('changed', null)));
    if (results.some(result => result.status === 'rejected')) {
      console.error('A gearset change notification could not be sent.');
    }
  } catch {
    // A notification failure must not turn a committed MongoDB write into a failed save.
    console.error('Gearset notifications are unavailable.');
  }
}

module.exports = { adminChannel, ownerChannel, getRealtimeRest, notifyGearsetChange };
