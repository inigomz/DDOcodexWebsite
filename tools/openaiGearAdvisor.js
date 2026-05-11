// openaiGearAdvisor.js

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

const OpenAI = require('openai');

const {
  buildProfileFromGoal,
  compactBuildProfileForAI
} = require('./buildProfile');

const {
  loadAllItems,
  searchItems,
  compactItemForAI
} = require('./gearsearch');

const {
  loadAllAugments,
  getAugmentCandidatesForItems
} = require('./augmentSearch');

const {
  selectAugmentsForItems
} = require('./augmentSelection');

const {
  validateGearset
} = require('./gearsetValidator');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';

function getUserGoal() {
  const argGoal = process.argv.slice(2).join(' ').trim();

  if (argGoal) {
    return argGoal;
  }

  return 'Level 34 Wisdom-based Monk using handwraps, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';
}

function createBaseQuery(buildProfile) {
  return {
    maxLevel: buildProfile.maxLevel || 34,
    priorityTerms: buildProfile.priorityTerms || [],
    secondaryTerms: buildProfile.secondaryTerms || [],
    avoidTerms: buildProfile.avoidTerms || [],
    buildProfile
  };
}

function getGeneralShouldInclude(buildProfile) {
  return [
    ...(buildProfile.priorityTerms || []),
    ...(buildProfile.secondaryTerms || [])
  ];
}

function shouldSkipOffhand(buildProfile) {
  const preferredWeaponSubtypes =
    buildProfile.preferredWeaponSubtypes || [];

  // Handwraps builds should not use an offhand item.
  if (preferredWeaponSubtypes.includes('handwraps')) {
    return true;
  }

  // Two-handed weapon preferences should also block offhand.
  const twoHandedWeaponSubtypes = [
    'falchion',
    'great_axe',
    'great_club',
    'great_sword',
    'maul',
    'quarterstaff',
    'long_bow',
    'short_bow'
  ];

  return preferredWeaponSubtypes.some(subtype =>
    twoHandedWeaponSubtypes.includes(subtype)
  );
}

function getCandidateQueries(buildProfile) {
  const base = createBaseQuery(buildProfile);
  const generalShouldInclude = getGeneralShouldInclude(buildProfile);

  const preferredWeaponSubtypes =
    buildProfile.preferredWeaponSubtypes || [];

  const queries = [
    {
      label: 'Eyes',
      query: {
        ...base,
        slot: 'eyes',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Neck',
      query: {
        ...base,
        slot: 'neck',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Trinket',
      query: {
        ...base,
        slot: 'trinket',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Finger',
      query: {
        ...base,
        slot: 'finger',
        shouldInclude: generalShouldInclude,
        limit: 8
      }
    },
    {
      label: 'Hands',
      query: {
        ...base,
        slot: 'hands',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Body / Armor',
      query: {
        ...base,
        slot: 'armor',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Feet',
      query: {
        ...base,
        slot: 'feet',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Waist',
      query: {
        ...base,
        slot: 'waist',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Wrists',
      query: {
        ...base,
        slot: 'wrists',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Back',
      query: {
        ...base,
        slot: 'back',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    },
    {
      label: 'Head',
      query: {
        ...base,
        slot: 'head',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    }
  ];

  if (preferredWeaponSubtypes.length > 0) {
    queries.push({
      label: 'Weapon / Preferred Weapon',
      query: {
        ...base,
        slot: 'weapon',
        itemSubtypes: preferredWeaponSubtypes,
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    });
  } else {
    queries.push({
      label: 'Weapon',
      query: {
        ...base,
        slot: 'weapon',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    });
  }

  if (!shouldSkipOffhand(buildProfile)) {
    queries.push({
      label: 'Offhand',
      query: {
        ...base,
        slot: 'offhand',
        shouldInclude: generalShouldInclude,
        limit: 5
      }
    });
  }

  return queries;
}

function compactValidationForAI(validationResult) {
  return {
    valid: validationResult.valid,

    errors: (validationResult.errors || []).map(error => ({
      type: error.type,
      message: error.message
    })),

    warnings: (validationResult.warnings || []).map(warning => ({
      type: warning.type,
      message: warning.message
    })),

    activeSetBonuses: (validationResult.activeSetBonuses || []).map(bonus => ({
      setId: bonus.setId,
      setName: bonus.setName,
      tier: bonus.tier,
      piecesEquipped: bonus.piecesEquipped,
      piecesRequired: bonus.piecesRequired,
      effect: bonus.effect
    })),

    setProgress: (validationResult.setProgress || []).map(set => ({
      setId: set.setId,
      setName: set.setName,
      tier: set.tier,
      piecesEquipped: set.piecesEquipped,
      equippedPieces: (set.equippedPieces || []).map(piece => ({
        name: piece.name,
        slot: piece.slot,
        tier: piece.tier
      })),
      activeBonuses: (set.activeBonuses || []).map(bonus => ({
        piecesRequired: bonus.piecesRequired,
        effect: bonus.effect
      })),
      inactiveBonuses: (set.inactiveBonuses || []).map(bonus => ({
        piecesRequired: bonus.piecesRequired,
        effect: bonus.effect
      }))
    }))
  };
}

function buildPlannerData(items, augments, buildProfile) {
  const queryGroups = getCandidateQueries(buildProfile);

  const gearGroups = queryGroups.map(group => {
    const fullCandidates = searchItems(items, group.query);

    const compactCandidates = fullCandidates.map(item =>
      compactItemForAI(item, buildProfile)
    );

    return {
      label: group.label,
      fullCandidates,
      candidates: compactCandidates
    };
  });

  const primaryFullItems = gearGroups
    .map(group => group.fullCandidates[0])
    .filter(Boolean);

  const primaryCompactItems = gearGroups
    .map(group => group.candidates[0])
    .filter(Boolean);

  const primaryItemsWithAugmentSlots = primaryFullItems.filter(item =>
    Array.isArray(item.augmentSlots) &&
    item.augmentSlots.length > 0
  );

  const augmentCandidateGroups = getAugmentCandidatesForItems(
    primaryItemsWithAugmentSlots,
    augments,
    {
      goal: buildProfile.goal,
      maxLevel: buildProfile.maxLevel || 34,
      limitPerSlot: 5
    }
  );

  const selectedAugments = selectAugmentsForItems({
    items: primaryItemsWithAugmentSlots,
    augmentCandidateGroups,
    buildProfile,
    allowRedundant: false
  });

  const selectedAugmentsByItemKey = new Map();

  for (const result of selectedAugments) {
    selectedAugmentsByItemKey.set(result.itemKey, result);
  }

  const validationResult = validateGearset({
    equippedItems: primaryFullItems,
    selectedAugments,
    buildProfile
  });

  const candidateBundle = gearGroups.map(group => {
    const primaryItem = group.candidates[0];

    return {
      label: group.label,
      candidates: group.candidates,
      selectedAugmentsForPrimaryItem:
        primaryItem
          ? selectedAugmentsByItemKey.get(primaryItem.itemKey) || null
          : null
    };
  });

  return {
    candidateBundle,
    equippedItems: primaryCompactItems,
    selectedAugments,
    validationSummary: compactValidationForAI(validationResult)
  };
}

function buildPrompt(buildProfile, candidateBundle, validationSummary) {
  const compactProfile = compactBuildProfileForAI(buildProfile);

  return `
You are helping build a Dungeons & Dragons Online gear planner.

Important rules:
- Do not invent items.
- Do not invent augments.
- Only recommend items from the candidate lists.
- Augments have already been selected by validation code.
- Do not choose new augments.
- Do not replace selected augments with different augments.
- Use the validation summary as the source of truth for legal status, active set bonuses, inactive set progress, errors, and warnings.
- If validationSummary.valid is false, clearly explain the validation errors.
- If validationSummary.valid is true, say the proposed primary gearset is valid.
- If selectedAugmentsForPrimaryItem is null, say no augment selection was provided.
- If selectedAugmentsForPrimaryItem has openSlots, mention those slots as open.
- Keep item effects, augment choices, and set bonuses separate.
- Never list an augment as an item effect.
- Never list a set bonus as an item effect.
- If a line says "Pieces Equipped", treat it as a set bonus requirement, not an item effect.
- Use the build profile priorities when judging whether an item is useful.
- Do not claim an effect helps the build unless it matches the build profile priorityTerms or secondaryTerms.
- Effects matching priorityTerms are more important than effects matching secondaryTerms.
- Effects matching avoidTerms should usually be ignored.
- Crafting slots are compatibility metadata, not automatic effects.
- Normal augment slots are empty unless selectedAugmentsForPrimaryItem contains a selected augment for that slot.
- Do not assume set bonuses are active just because an item belongs to a set.
- Active set bonuses must come only from validationSummary.activeSetBonuses.
- Incomplete set bonuses must be described as "not active".
- Do not mix Heroic, Epic, and Legendary set bonus values.
- Avoid duplicate sections.
- Avoid repeating the same sentence.

Build profile:
${JSON.stringify(compactProfile, null, 2)}

Validation summary:
${JSON.stringify(validationSummary, null, 2)}

Candidate items and selected augments by slot:
${JSON.stringify(candidateBundle, null, 2)}

Return EVERY slot group from the candidate data, in the same order.

Do not skip a slot group.

For each slot group:
- If candidates is not empty, recommend:
  - Primary Item = candidates[0]
  - Backup Item = candidates[1] if it exists
- If candidates is empty, write "No candidates found."
- If the primary item has no useful item effects, write "No direct useful item effects found."
- If the backup item has no useful item effects, write "No direct useful item effects found."
- If selectedAugmentsForPrimaryItem exists, list its selectedAugments and openSlots.
- If selectedAugmentsForPrimaryItem is null, write "No augment selection provided."
- Do not choose augments for backup items.

Return ONLY this structure:

Validation:
- Valid:
- Errors:
- Warnings:

Slot Recommendations:
- Slot Name:
  - Primary Item:
    - Name:
    - Useful item effects:
    - Selected augments:
    - Open augment slots:
  - Backup Item:
    - Name:
    - Useful item effects:
    - Selected augments: not selected

Active Set Bonuses:
- List only validationSummary.activeSetBonuses.
- If none, write "None active."

Inactive Set Progress:
- List sets from validationSummary.setProgress that are not active.
- Include pieces equipped and pieces required when available.

Weaknesses:
- List missing stats, weak slots, augment gaps, duplicate-stat risks, validation warnings, or tradeoffs.

Summary:
- Keep this under 5 sentences.
`;
}

async function askOpenAIForGearAdvice(
  buildProfile,
  candidateBundle,
  validationSummary
) {
  const prompt = buildPrompt(
    buildProfile,
    candidateBundle,
    validationSummary
  );

  const response = await client.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: 2400
  });

  return response.output_text;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is not set.');
    console.error('Expected .env location:');
    console.error(path.join(__dirname, '..', '.env'));
    console.error('');
    console.error('Example .env content:');
    console.error('OPENAI_API_KEY=your_api_key_here');
    process.exit(1);
  }

  const goal = getUserGoal();
  const buildProfile = buildProfileFromGoal(goal);

  const items = loadAllItems();
  const augments = loadAllAugments();

  const plannerData = buildPlannerData(
    items,
    augments,
    buildProfile
  );

  console.log(`Loaded ${items.length} items.`);
  console.log(`Loaded ${augments.length} augments.`);
  console.log(`Using model: ${MODEL}`);
  console.log(`Goal: ${goal}`);
  console.log(`Build types: ${buildProfile.buildTypes.join(', ')}`);
  console.log(`Primary stats: ${buildProfile.primaryStats.join(', ') || 'none'}`);
  console.log('');

  console.log('Candidate counts by slot:');
  for (const group of plannerData.candidateBundle) {
    console.log(`${group.label}: ${group.candidates.length} candidates`);
  }
  console.log('');

  console.log(`Validation: ${plannerData.validationSummary.valid ? 'valid' : 'invalid'}`);

  if (plannerData.validationSummary.errors.length > 0) {
    console.log('Validation errors:');
    for (const error of plannerData.validationSummary.errors) {
      console.log(`- ${error.type}: ${error.message}`);
    }
  }

  if (plannerData.validationSummary.warnings.length > 0) {
    console.log('Validation warnings:');
    for (const warning of plannerData.validationSummary.warnings) {
      console.log(`- ${warning.type}: ${warning.message}`);
    }
  }

  console.log('');

  const advice = await askOpenAIForGearAdvice(
    buildProfile,
    plannerData.candidateBundle,
    plannerData.validationSummary
  );

  console.log('=== OpenAI Gear Advice ===');
  console.log(advice);
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERROR:', err.message);
  });
}

module.exports = {
  buildPlannerData,
  buildPrompt,
  askOpenAIForGearAdvice
};