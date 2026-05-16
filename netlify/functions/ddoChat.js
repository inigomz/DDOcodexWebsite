// netlify/functions/ddoChat.js
// DDO-only chatbot endpoint. Strictly refuses non-DDO questions.

'use strict';

require('dotenv').config();

let OpenAI = null;
try { OpenAI = require('openai'); } catch { OpenAI = null; }

const SYSTEM_PROMPT = `You are DDO Codex Assistant, an expert on the MMORPG "Dungeons & Dragons Online" (DDO) by Standing Stone Games.

You ONLY answer questions about DDO. This includes:
- Classes, races, and builds
- Items, gear, augments, filigrees, and crafting
- Quests, raids, and adventure packs
- Game mechanics (enhancements, feats, spells, combat)
- Named item sets and set bonuses
- Reincarnation (TR, ETR, ITR)
- Servers, updates, and game history

If the user asks about anything unrelated to DDO, respond with:
"I can only answer questions about Dungeons & Dragons Online. Please ask me something DDO-related!"

Be concise, accurate, and helpful. Use DDO terminology correctly.`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return jsonResponse(400, { error: 'Missing required field: message' });
  }

  // history is an array of {role, content} pairs (max last 10 turns)
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  if (!OpenAI) {
    return jsonResponse(503, { error: 'OpenAI package not available.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(503, { error: 'OPENAI_API_KEY is not configured.' });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 600,
      temperature: 0.7
    });

    const reply = completion.choices[0]?.message?.content?.trim() || 'No response.';

    return jsonResponse(200, { reply });

  } catch (err) {
    console.error('ddoChat error:', err);
    return jsonResponse(500, { error: 'Chat failed.', detail: err.message });
  }
};
