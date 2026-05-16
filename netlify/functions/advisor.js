// netlify/functions/advisor.js
// Calls OpenAI with a build summary and returns advisor text.
// Requires OPENAI_API_KEY and optionally OPENAI_MODEL in Netlify env vars.

'use strict';

require('dotenv').config();

const {
  generateGearAdvice,
  buildLocalFallbackAdvice,
  normalizeBuildSummary,
  validateBuildSummary
} = require('../../tools/openaiGearAdvisor');

// ---------------------------------------------------------------------------
// Dynamic advisor instructions — uses the actual buildProfile, not hardcoded
// ---------------------------------------------------------------------------

function buildDynamicAdvisorInstructions(buildProfile = {}) {
  const buildTypes = (buildProfile.buildTypes || []).join(', ') || 'unknown';
  const primaryStats = (buildProfile.primaryStats || []).join(', ') || 'unknown';
  const preferredWeapons = (buildProfile.preferredWeaponSubtypes || []).join(', ') || 'any';
  const armorPref = buildProfile.armorPreference || {};
  const armorTypes = (armorPref.preferredArmorTypes || []).join(', ') || 'any';
  const maxLevel = buildProfile.maxLevel || 34;

  return [
    'You are a DDO (Dungeons & Dragons Online) gear advisor.',
    'You are reviewing a final optimized gearset summary produced by an automated gear planner.',
    'You are only giving advice on gear from Dungeons and Dragons Online.',
    'Do not invent gear, augments, set bonuses, or effects that are not present in the summary.',
    `Prioritize advice based on the provided buildProfile: level ${maxLevel}, build types: ${buildTypes}, primary stats: ${primaryStats}, preferred weapons: ${preferredWeapons}, preferred armor: ${armorTypes}.`,
    'Explain whether the build is structurally valid.',
    'Explain the normal augment assignments and crafting augment assignments.',
    'Explain the most important remaining gaps.',
    'Explain the remaining stacking conflicts without exaggerating them.',
    'Distinguish between serious problems and acceptable leftovers.',
    'Keep the advice actionable and easy to read.'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  if (!body.summary) {
    return jsonResponse(400, { error: 'Missing required field: summary' });
  }

  const useOpenAI = process.env.USE_OPENAI_ADVISOR !== 'false' &&
    Boolean(process.env.OPENAI_API_KEY);

  try {
    const summary = normalizeBuildSummary(body.summary);
    validateBuildSummary(summary);

    let advice;

    if (useOpenAI) {
      // Override the instructions to use the actual build profile
      const dynamicInstructions =
        buildDynamicAdvisorInstructions(summary.buildProfile);

      const result = await generateGearAdvice({
        buildSummary: summary,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        // Pass a custom client override so we can inject dynamic instructions.
        // generateGearAdvice accepts a pre-built client; we pass null and let
        // it create one, but we patch the instructions via the prompt approach.
        client: null,
        _instructionsOverride: dynamicInstructions
      });

      advice = result.advice;
    }

    // Fall back to local if OpenAI is disabled or returned nothing
    if (!advice) {
      advice = buildLocalFallbackAdvice(summary);
    }

    return jsonResponse(200, { advice });

  } catch (err) {
    console.error('advisor error:', err);
    return jsonResponse(500, {
      error: 'Advisor failed.',
      detail: err.message
    });
  }
};
