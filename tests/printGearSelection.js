// tests/printGearSelection.js
//
// Simple runner that executes the gear planning pipeline for a given goal,
// prints a console summary similar to the UI's gear results panel, and
// stores the full summary as a JSON file under testoutput/.
//
// Usage:
//   node tests/printGearSelection.js
//   node tests/printGearSelection.js "Level 34 Wisdom monk handwraps tactical DC"
//   node tests/printGearSelection.js --out my_run.json "<goal>"

const fs = require('fs');
const path = require('path');

const {
  buildProfileFromGoal,
} = require('../tools/buildProfile');

const {
  loadAllItems,
  searchItems,
} = require('../tools/gearsearch');

const {
  loadCraftingAugments,
} = require('../tools/craftingAugmentSearch');

const {
  buildCraftingAugmentPlan,
} = require('../tools/craftingAugmentPlan');

const {
  buildStackAwareGearset,
} = require('../tools/gearSetBuilder');

const {
  loadAllAugments,
} = require('../tools/augmentSearch');

const {
  buildAugmentGapPlan,
} = require('../tools/augmentGapPlanner');

const {
  buildAugmentSlotPlan,
} = require('../tools/augmentSlotPlanner');

const {
  validateGearset,
} = require('../tools/gearsetValidator');

const {
  buildSummary,
} = require('../tools/buildSummary');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    out: null,
    goal: null,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--out' || arg === '-o') {
      args.out = argv[++i] || null;
      continue;
    }

    positional.push(arg);
  }

  if (positional.length > 0) {
    args.goal = positional.join(' ');
  }

  return args;
}

const DEFAULT_GOAL = 'Level 34 Wisdom-based Monk using handwraps and cloth armor, '
  + 'focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, '
  + 'and survivability.';

// ---------------------------------------------------------------------------
// Slot grouping (mirrors planGear.js)
// ---------------------------------------------------------------------------

const TWO_HANDED_SUBTYPES = [
  'falchion', 'great_axe', 'great_club', 'great_sword',
  'maul', 'quarterstaff', 'long_bow', 'short_bow',
];

function shouldSkipOffhand(buildProfile) {
  const subtypes = buildProfile.preferredWeaponSubtypes || [];
  if (subtypes.includes('handwraps')) return true;
  return subtypes.some((s) => TWO_HANDED_SUBTYPES.includes(s));
}

function buildGearGroups(items, buildProfile) {
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
    { label: 'Head', slot: 'head', limit: 12 },
    { label: 'Eyes', slot: 'eyes', limit: 12 },
    { label: 'Neck', slot: 'neck', limit: 12 },
    { label: 'Trinket', slot: 'trinket', limit: 12 },
    { label: 'Back', slot: 'back', limit: 12 },
    { label: 'Wrists', slot: 'wrists', limit: 12 },
    { label: 'Hands', slot: 'hands', limit: 12 },
    { label: 'Waist', slot: 'waist', limit: 12 },
    { label: 'Feet', slot: 'feet', limit: 12 },
    { label: 'Finger', slot: 'finger', limit: 14 },
    { label: 'Body / Armor', slot: 'armor', limit: 12 },
  ];

  const preferredWeaponSubtypes = buildProfile.preferredWeaponSubtypes || [];

  if (preferredWeaponSubtypes.length > 0) {
    slotDefs.push({
      label: 'Weapon / Preferred Weapon',
      slot: 'weapon',
      itemSubtypes: preferredWeaponSubtypes,
      limit: 12,
    });
  } else {
    slotDefs.push({ label: 'Weapon', slot: 'weapon', limit: 12 });
  }

  if (!shouldSkipOffhand(buildProfile)) {
    slotDefs.push({ label: 'Offhand', slot: 'offhand', limit: 12 });
  }

  return slotDefs.map((def) => {
    const query = {
      ...base,
      slot: def.slot,
      shouldInclude,
      limit: def.limit,
      ...(def.itemSubtypes ? { itemSubtypes: def.itemSubtypes } : {}),
    };

    return {
      label: def.label,
      slot: def.slot,
      requestedLimit: def.limit,
      fullCandidates: searchItems(items, query),
    };
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function planGearForGoal(goal) {
  const buildProfile = buildProfileFromGoal(goal);

  const items = loadAllItems(
    path.join(__dirname, '..', 'itemlist_enriched'),
  );
  const augments = loadAllAugments(
    path.join(__dirname, '..', 'augmentlist'),
  );
  const craftingAugments = loadCraftingAugments(
    path.join(__dirname, '..', 'augmentlist', 'viktranium_experiment_crafting.json'),
  );

  const craftingAugmentPlan = buildCraftingAugmentPlan({
    craftingAugments,
    buildProfile,
    systems: ['Lamordia'],
    limitPerSlot: 5,
    minimumScore: 40,
  });

  const gearGroups = buildGearGroups(items, buildProfile);

  const gearset = buildStackAwareGearset({
    gearGroups,
    buildProfile,
    craftingAugmentPlan,
    normalAugments: augments,
  });

  const equippedItems = gearset.selectedItems;

  const baselineGapPlan = buildAugmentGapPlan({
    equippedItems,
    selectedAugments: [],
    craftingAssignments: [],
    normalAugments: augments,
    craftingAugmentPlan,
    buildProfile,
  });

  const slotPlan = buildAugmentSlotPlan({
    augmentGapPlan: baselineGapPlan,
    selectedAugments: [],
    equippedItems,
  });

  const validationResult = validateGearset({
    equippedItems,
    selectedAugments: slotPlan.selectedAugmentsForValidation,
    craftingAssignments: slotPlan.craftingAssignments,
    buildProfile,
  });

  const finalGapPlan = buildAugmentGapPlan({
    equippedItems,
    selectedAugments: slotPlan.selectedAugmentsForValidation,
    craftingAssignments: slotPlan.craftingAssignments,
    normalAugments: augments,
    craftingAugmentPlan,
    buildProfile,
  });

  const summary = buildSummary({
    goal,
    buildProfile,
    equippedItems,
    finalEvaluation: {
      equippedItems,
      finalGapPlan,
      slotPlan,
      validationResult,
    },
  });

  return summary;
}

// ---------------------------------------------------------------------------
// Pretty console output (mirrors the UI panel in the screenshot)
// ---------------------------------------------------------------------------

const SLOT_LABEL_BY_NAME = {
  Head: 'HEAD',
  Eyes: 'EYES',
  Neck: 'NECK',
  Trinket: 'TRINKET',
  Back: 'BACK',
  Wrists: 'WRISTS',
  Hands: 'HANDS',
  Waist: 'WAIST',
  Feet: 'FEET',
  Finger: 'FINGER',
  'Body / Armor': 'ARMOR',
  Weapon: 'WEAPON',
  'Weapon / Preferred Weapon': 'WEAPON',
  Offhand: 'OFFHAND',
};

function slotTagFor(item) {
  if (!item) return 'SLOT';
  const slot = String(item.slot || '').toLowerCase();
  if (slot === 'armor') return 'ARMOR';
  if (slot === 'weapon') return 'WEAPON';
  if (slot === 'offhand') return 'OFFHAND';
  return slot.toUpperCase() || 'SLOT';
}

function pad(text, width) {
  const s = String(text);
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function printSummary(summary) {
  const { counts } = summary;
  const { score } = summary.scoreBreakdown;

  const errors = counts.validationErrorCount;
  const validLabel = errors > 0 ? '✗ Invalid Build' : '✓ Valid Build';

  console.log('');
  console.log('='.repeat(72));
  console.log(`${validLabel}    Score: ${score.toFixed(0)}`);

  const buildTypes = summary.buildProfile.buildTypes || [];
  const primaryStats = summary.buildProfile.primaryStats || [];
  const tags = [
    ...buildTypes,
    ...primaryStats.map((s) => `[${s}]`),
  ];

  if (tags.length > 0) {
    console.log(`BUILD: ${tags.join('  ')}`);
  }

  console.log('-'.repeat(72));
  console.log(
    `  ${pad(counts.metTargetCount, 4)}  ${pad(counts.openGapCount, 4)}  `
    + `${pad(counts.normalAssignmentCount, 4)}  ${pad(counts.craftingAssignmentCount, 4)}  `
    + `${pad(counts.relevantConflictCount, 4)}`,
  );
  console.log(
    '  TARGETS  OPEN     AUGMENTS  CRAFTING  CONFLICTS',
  );
  console.log(
    '  MET      GAPS',
  );
  console.log('='.repeat(72));

  const gear = summary.selectedGear || [];
  console.log(`SELECTED GEAR (${gear.length})`);
  console.log('-'.repeat(72));

  for (const item of gear) {
    const tag = pad(`[${slotTagFor(item)}]`, 10);
    const name = pad(item.name || 'unknown', 46);
    const ml = item.minLevel != null ? `ML ${item.minLevel}` : 'ML ?';
    console.log(`${tag} ${name} ${ml}`);
  }

  console.log('='.repeat(72));

  if (summary.advisorNotes && summary.advisorNotes.length > 0) {
    console.log('Notes:');
    for (const note of summary.advisorNotes) {
      console.log(`  - ${note}`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function safeFilename(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'gear_run';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const goal = args.goal || DEFAULT_GOAL;

  console.log(`Goal: ${goal}`);
  const startedAt = Date.now();

  const summary = planGearForGoal(goal);
  printSummary(summary);

  const outDir = path.join(__dirname, '..', 'testoutput');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outName = args.out || `gear_selection_${safeFilename(goal)}.json`;
  const outPath = path.isAbsolute(outName)
    ? outName
    : path.join(outDir, outName);

  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Saved full summary -> ${outPath}`);
  console.log(`Done in ${elapsed}s.`);
}

main();
