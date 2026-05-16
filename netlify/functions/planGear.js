// netlify/functions/planGear.js
// Full gear planning pipeline — no OpenAI, pure planner output.

'use strict';

const path = require('path');

// Data is bundled via netlify.toml included_files.
// In local dev (netlify dev), __dirname is the real source path so
// walking up two levels reaches the repo root.
// In production (zisi bundle), included_files are copied relative to the
// repo root into the bundle, so we search upward from __dirname until we
// find the itemlist_enriched directory.
function repoRoot() {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'itemlist_enriched');
    try {
      require('fs').accessSync(candidate);
      return dir;
    } catch {
      dir = path.dirname(dir);
    }
  }
  // Final fallback — two levels up from netlify/functions/
  return path.join(__dirname, '..', '..');
}

const {
  buildProfileFromGoal
} = require('../../tools/buildProfile');

const {
  loadAllItems,
  searchItems
} = require('../../tools/gearsearch');

const {
  loadCraftingAugments
} = require('../../tools/craftingAugmentSearch');

const {
  buildCraftingAugmentPlan
} = require('../../tools/craftingAugmentPlan');

const {
  buildStackAwareGearset
} = require('../../tools/gearSetBuilder');

const {
  loadAllAugments
} = require('../../tools/augmentSearch');

const {
  buildAugmentGapPlan
} = require('../../tools/augmentGapPlanner');

const {
  buildAugmentSlotPlan
} = require('../../tools/augmentSlotPlanner');

const {
  validateGearset
} = require('../../tools/gearsetValidator');

const {
  buildSummary
} = require('../../tools/buildSummary');

// ---------------------------------------------------------------------------
// Slot query helpers (mirrors testgearsetbuilder.js logic)
// ---------------------------------------------------------------------------

const TWO_HANDED_SUBTYPES = [
  'falchion', 'great_axe', 'great_club', 'great_sword',
  'maul', 'quarterstaff', 'long_bow', 'short_bow'
];

function shouldSkipOffhand(buildProfile) {
  const subtypes = buildProfile.preferredWeaponSubtypes || [];
  if (subtypes.includes('handwraps')) return true;
  return subtypes.some(s => TWO_HANDED_SUBTYPES.includes(s));
}

function buildGearGroups(items, buildProfile) {
  const base = {
    maxLevel: buildProfile.maxLevel || 34,
    priorityTerms: buildProfile.priorityTerms || [],
    secondaryTerms: buildProfile.secondaryTerms || [],
    avoidTerms: buildProfile.avoidTerms || [],
    buildProfile
  };

  const shouldInclude = [
    ...(buildProfile.priorityTerms || []),
    ...(buildProfile.secondaryTerms || [])
  ];

  const slotDefs = [
    { label: 'Head',    slot: 'head',    limit: 12 },
    { label: 'Eyes',    slot: 'eyes',    limit: 12 },
    { label: 'Neck',    slot: 'neck',    limit: 12 },
    { label: 'Trinket', slot: 'trinket', limit: 12 },
    { label: 'Back',    slot: 'back',    limit: 12 },
    { label: 'Wrists',  slot: 'wrists',  limit: 12 },
    { label: 'Hands',   slot: 'hands',   limit: 12 },
    { label: 'Waist',   slot: 'waist',   limit: 12 },
    { label: 'Feet',    slot: 'feet',    limit: 12 },
    { label: 'Finger',  slot: 'finger',  limit: 14 },
    { label: 'Body / Armor', slot: 'armor', limit: 12 }
  ];

  const preferredWeaponSubtypes = buildProfile.preferredWeaponSubtypes || [];

  if (preferredWeaponSubtypes.length > 0) {
    slotDefs.push({
      label: 'Weapon / Preferred Weapon',
      slot: 'weapon',
      itemSubtypes: preferredWeaponSubtypes,
      limit: 12
    });
  } else {
    slotDefs.push({ label: 'Weapon', slot: 'weapon', limit: 12 });
  }

  if (!shouldSkipOffhand(buildProfile)) {
    slotDefs.push({ label: 'Offhand', slot: 'offhand', limit: 12 });
  }

  return slotDefs.map(def => {
    const query = {
      ...base,
      slot: def.slot,
      shouldInclude,
      limit: def.limit,
      ...(def.itemSubtypes ? { itemSubtypes: def.itemSubtypes } : {})
    };

    const fullCandidates = searchItems(items, query);

    return {
      label: def.label,
      slot: def.slot,
      requestedLimit: def.limit,
      fullCandidates
    };
  });
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
// Lazy-loaded data (cached across warm invocations)
// ---------------------------------------------------------------------------

let _items = null;
let _augments = null;
let _craftingAugments = null;

function getItems() {
  if (!_items) {
    const itemDir = path.join(repoRoot(), 'itemlist_enriched');
    _items = loadAllItems(itemDir);
  }
  return _items;
}

function getAugments() {
  if (!_augments) {
    const augmentDir = path.join(repoRoot(), 'augmentlist');
    _augments = loadAllAugments(augmentDir);
  }
  return _augments;
}

function getCraftingAugments() {
  if (!_craftingAugments) {
    const craftingFile = path.join(
      repoRoot(),
      'augmentlist',
      'viktranium_experiment_crafting.json'
    );
    _craftingAugments = loadCraftingAugments(craftingFile);
  }
  return _craftingAugments;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

exports.handler = async function handler(event) {
  // Handle CORS preflight
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

  const goal = String(body.goal || '').trim();
  if (!goal) {
    return jsonResponse(400, { error: 'Missing required field: goal' });
  }

  try {
    // 1. Build profile
    const buildProfile = buildProfileFromGoal(goal);

    // 2. Load data
    const items = getItems();
    const augments = getAugments();
    const craftingAugments = getCraftingAugments();

    // 3. Crafting augment plan (needed by gear set builder for scoring)
    const craftingAugmentPlan = buildCraftingAugmentPlan({
      craftingAugments,
      buildProfile,
      systems: ['Lamordia'],
      limitPerSlot: 5,
      minimumScore: 40
    });

    // 4. Gear groups (candidates per slot)
    const gearGroups = buildGearGroups(items, buildProfile);

    // 5. Stack-aware gear selection
    const gearset = buildStackAwareGearset({
      gearGroups,
      buildProfile,
      craftingAugmentPlan
    });

    const equippedItems = gearset.selectedItems;

    // 6. Baseline gap plan (no augments yet)
    const baselineGapPlan = buildAugmentGapPlan({
      equippedItems,
      selectedAugments: [],
      craftingAssignments: [],
      normalAugments: augments,
      craftingAugmentPlan,
      buildProfile
    });

    // 7. Augment slot plan
    const slotPlan = buildAugmentSlotPlan({
      augmentGapPlan: baselineGapPlan,
      selectedAugments: [],
      equippedItems
    });

    // 8. Validation
    const validationResult = validateGearset({
      equippedItems,
      selectedAugments: slotPlan.selectedAugmentsForValidation,
      craftingAssignments: slotPlan.craftingAssignments,
      buildProfile
    });

    // 9. Final gap plan (with augments applied)
    const finalGapPlan = buildAugmentGapPlan({
      equippedItems,
      selectedAugments: slotPlan.selectedAugmentsForValidation,
      craftingAssignments: slotPlan.craftingAssignments,
      normalAugments: augments,
      craftingAugmentPlan,
      buildProfile
    });

    // 10. Build summary
    const summary = buildSummary({
      goal,
      buildProfile,
      equippedItems,
      finalEvaluation: {
        equippedItems,
        finalGapPlan,
        slotPlan,
        validationResult
      }
    });

    return jsonResponse(200, { summary });

  } catch (err) {
    console.error('planGear error:', err);
    return jsonResponse(500, {
      error: 'Gear planning failed.',
      detail: err.message
    });
  }
};
