// netlify/functions/planGear.js
// Full gear planning pipeline — no OpenAI, pure planner output.

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
  buildProfileFromGoal,
  buildNeutralProfile,
} = require('../../tools/buildProfile');

const {
  loadAllItems,
  searchItems,
} = require('../../tools/gearsearch');

const {
  loadCraftingAugments,
} = require('../../tools/craftingAugmentSearch');

const {
  buildCraftingAugmentPlan,
} = require('../../tools/craftingAugmentPlan');

const {
  buildStackAwareGearset,
} = require('../../tools/gearSetBuilder');

const {
  loadAllAugments,
} = require('../../tools/augmentSearch');

const {
  buildAugmentGapPlan,
} = require('../../tools/augmentGapPlanner');

const {
  buildAugmentSlotPlan,
} = require('../../tools/augmentSlotPlanner');

const {
  validateGearset,
  blocksOffhand,
} = require('../../tools/gearsetValidator');

const {
  buildSummary,
  compactSelectedGearItem,
} = require('../../tools/buildSummary');

const {
  buildEffectCatalog,
  normalizeEffectSelections,
  applyEffectSelectionsToProfile,
} = require('../../tools/effectCatalog');

// ---------------------------------------------------------------------------
// Slot query helpers (mirrors testgearsetbuilder.js logic)
// ---------------------------------------------------------------------------

const TWO_HANDED_SUBTYPES = [
  'falchion', 'great_axe', 'great_club', 'great_sword',
  'maul', 'quarterstaff', 'long_bow', 'short_bow',
];

// Keyword relevance is only the first-stage filter. Keep a wider pool so the
// stack-aware builder can choose complementary effects instead of receiving a
// shortlist dominated by repeated copies of the requested primary stat.
const SEARCH_CANDIDATE_LIMIT_PER_SLOT = 50;

function shouldSkipOffhand(buildProfile) {
  const subtypes = buildProfile.preferredWeaponSubtypes || [];
  if (subtypes.includes('handwraps')) return true;
  return subtypes.some((s) => TWO_HANDED_SUBTYPES.includes(s));
}

function buildGearGroups(items, buildProfile, lockedItems = {}) {
  const includeOffhand = !shouldSkipOffhand(buildProfile);
  const base = {
    maxLevel: buildProfile.maxLevel || 34,
    priorityTerms: buildProfile.priorityTerms || [],
    secondaryTerms: buildProfile.secondaryTerms || [],
    avoidTerms: buildProfile.avoidTerms || [],
    buildProfile,
  };

  const shouldInclude = [
    ...(buildProfile.priorityTerms || []),
    ...(buildProfile.secondaryTerms || []),
  ];

  const slotDefs = [
    {
      groupId: 'head', label: 'Head', slot: 'head', limit: 12,
    },
    {
      groupId: 'eyes', label: 'Eyes', slot: 'eyes', limit: 12,
    },
    {
      groupId: 'neck', label: 'Neck', slot: 'neck', limit: 12,
    },
    {
      groupId: 'trinket', label: 'Trinket', slot: 'trinket', limit: 12,
    },
    {
      groupId: 'back', label: 'Back', slot: 'back', limit: 12,
    },
    {
      groupId: 'wrists', label: 'Wrists', slot: 'wrists', limit: 12,
    },
    {
      groupId: 'hands', label: 'Hands', slot: 'hands', limit: 12,
    },
    {
      groupId: 'waist', label: 'Waist', slot: 'waist', limit: 12,
    },
    {
      groupId: 'feet', label: 'Feet', slot: 'feet', limit: 12,
    },
    {
      groupId: 'finger', label: 'Finger', slot: 'finger', limit: 14,
    },
    {
      groupId: 'armor', label: 'Body / Armor', slot: 'armor', limit: 12,
    },
  ];

  const preferredWeaponSubtypes = buildProfile.preferredWeaponSubtypes || [];

  if (preferredWeaponSubtypes.length > 0) {
    slotDefs.push({
      groupId: 'weapon',
      label: 'Weapon / Preferred Weapon',
      slot: 'weapon',
      itemSubtypes: preferredWeaponSubtypes,
      limit: 12,
    });
  } else {
    slotDefs.push({
      groupId: 'weapon',
      label: 'Weapon',
      slot: 'weapon',
      limit: 12,
    });
  }

  if (includeOffhand) {
    slotDefs.push({
      groupId: 'offhand',
      label: 'Offhand',
      slot: 'offhand',
      limit: 12,
    });
  }

  const groups = slotDefs.map((def) => {
    const query = {
      ...base,
      slot: def.slot,
      shouldInclude,
      limit: Math.max(
        def.limit,
        SEARCH_CANDIDATE_LIMIT_PER_SLOT,
      ),
      ...(def.itemSubtypes ? { itemSubtypes: def.itemSubtypes } : {}),
    };

    const searchedCandidates = searchItems(items, query);
    const fullCandidates = def.groupId === 'weapon' && includeOffhand
      ? searchedCandidates.filter((item) => !blocksOffhand(item))
      : searchedCandidates;
    const requestedLock = lockedItems[def.groupId] || null;
    const lockedCandidate = requestedLock
      ? fullCandidates.find((item) => item.itemKey === requestedLock)
      : null;

    return {
      groupId: def.groupId,
      label: def.label,
      slot: def.slot,
      requestedLimit: def.limit,
      fullCandidates,
      requestedLock,
      lockedItemKey: lockedCandidate?.itemKey || null,
    };
  });

  const lockedWeaponGroup = groups.find(
    (group) => group.groupId === 'weapon' && group.lockedItemKey,
  );
  const lockedWeapon = lockedWeaponGroup?.fullCandidates.find(
    (item) => item.itemKey === lockedWeaponGroup.lockedItemKey,
  );

  if (lockedWeapon && blocksOffhand(lockedWeapon)) {
    return groups.filter((group) => group.groupId !== 'offhand');
  }

  return groups;
}

function normalizeLockedItems(lockedItems) {
  if (!lockedItems || Array.isArray(lockedItems) || typeof lockedItems !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(lockedItems)
      .slice(0, 20)
      .map(([groupId, itemKey]) => [
        String(groupId).slice(0, 50),
        String(itemKey).slice(0, 300),
      ])
      .filter(([groupId, itemKey]) => groupId && itemKey),
  );
}

function buildCandidateGroups(gearset, buildProfile) {
  return (gearset.slotSelections || []).map((selection) => {
    const selectedItemKey = selection.selectedItem?.itemKey
      || selection.selectedItem?.link
      || selection.selectedItem?.name;
    const seen = new Set();
    const candidates = [
      selection.selectedItem,
      ...(selection.backupItems || []),
    ]
      .filter((item) => {
        const itemKey = item?.itemKey || item?.link || item?.name;

        if (!itemKey || seen.has(itemKey)) {
          return false;
        }

        seen.add(itemKey);
        return true;
      })
      .slice(0, 5)
      .map((item) => compactSelectedGearItem(item, buildProfile));

    return {
      groupId: selection.groupId,
      label: selection.groupLabel,
      slot: selection.selectedItem?.slot || null,
      selectedItemKey,
      lockedItemKey: selection.lockedItemKey,
      candidates,
    };
  });
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Lazy-loaded data (cached across warm invocations)
// ---------------------------------------------------------------------------

let _items = null;
let _augments = null;
let _craftingAugments = null;
let _effectCatalog = null;

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
      'viktranium_experiment_crafting.json',
    );
    _craftingAugments = loadCraftingAugments(craftingFile);
  }
  return _craftingAugments;
}

function getEffectCatalog() {
  if (!_effectCatalog) {
    _effectCatalog = buildEffectCatalog(getItems(), getAugments());
  }

  return _effectCatalog;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

exports.handler = async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return jsonResponse(200, {
      effects: getEffectCatalog(),
    });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use GET or POST.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const goal = String(body.goal || '').trim();
  const useNaturalLanguage = body.useNaturalLanguage !== false;

  if (useNaturalLanguage && !goal) {
    return jsonResponse(400, { error: 'Missing required field: goal' });
  }

  try {
    // 1. Build profile
    const effectSelections = normalizeEffectSelections(
      body.effectSelections,
      getEffectCatalog(),
    );

    if (!useNaturalLanguage && effectSelections.length === 0) {
      return jsonResponse(400, {
        error: 'Select at least one effect when build parsing is disabled.',
      });
    }

    const buildProfile = {
      ...applyEffectSelectionsToProfile(
        useNaturalLanguage
          ? buildProfileFromGoal(goal)
          : buildNeutralProfile(),
        effectSelections,
      ),
      useNaturalLanguage,
    };
    const lockedItems = normalizeLockedItems(body.lockedItems);

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
      minimumScore: 40,
    });

    // 4. Gear groups (candidates per slot)
    const gearGroups = buildGearGroups(items, buildProfile, lockedItems);
    const groupIds = new Set(gearGroups.map((group) => group.groupId));
    const invalidLockIds = [
      ...Object.keys(lockedItems).filter((groupId) => !groupIds.has(groupId)),
      ...gearGroups
        .filter((group) => group.requestedLock && !group.lockedItemKey)
        .map((group) => group.groupId),
    ];

    if (invalidLockIds.length > 0) {
      return jsonResponse(400, {
        error: 'One or more locked items are not valid candidates.',
        invalidLocks: Array.from(new Set(invalidLockIds)),
      });
    }

    // 5. Stack-aware gear selection (augment-first scoring)
    const gearset = buildStackAwareGearset({
      gearGroups,
      buildProfile,
      craftingAugmentPlan,
      normalAugments: augments,
    });

    const equippedItems = gearset.selectedItems;

    // 6. Baseline gap plan (no augments yet)
    const baselineGapPlan = buildAugmentGapPlan({
      equippedItems,
      selectedAugments: [],
      craftingAssignments: [],
      normalAugments: augments,
      craftingAugmentPlan,
      buildProfile,
    });

    // 7. Augment slot plan
    const slotPlan = buildAugmentSlotPlan({
      augmentGapPlan: baselineGapPlan,
      selectedAugments: [],
      equippedItems,
    });

    // 8. Validation
    const validationResult = validateGearset({
      equippedItems,
      selectedAugments: slotPlan.selectedAugmentsForValidation,
      craftingAssignments: slotPlan.craftingAssignments,
      buildProfile,
    });

    // 9. Final gap plan (with augments applied)
    const finalGapPlan = buildAugmentGapPlan({
      equippedItems,
      selectedAugments: slotPlan.selectedAugmentsForValidation,
      craftingAssignments: slotPlan.craftingAssignments,
      normalAugments: augments,
      craftingAugmentPlan,
      buildProfile,
    });

    // 10. Build summary
    const summary = buildSummary({
      goal: useNaturalLanguage ? goal : 'Selected effects only',
      buildProfile,
      equippedItems,
      finalEvaluation: {
        equippedItems,
        finalGapPlan,
        slotPlan,
        validationResult,
      },
    });

    const candidateGroups = buildCandidateGroups(
      gearset,
      buildProfile,
    );

    return jsonResponse(200, {
      summary,
      candidateGroups,
      effectSelections,
      useNaturalLanguage,
    });
  } catch (err) {
    console.error('planGear error:', err);
    return jsonResponse(500, {
      error: 'Gear planning failed.',
      detail: err.message,
    });
  }
};
