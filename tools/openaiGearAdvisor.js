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

const {
  buildStackAwareGearset
} = require('./gearSetBuilder');

const {
  analyzeAugmentImpact,
  compactAugmentImpactForAI
} = require('./augmentImpact');

const {
  loadCraftingAugments
} = require('./craftingAugmentSearch');

const {
  buildCraftingAugmentPlan,
  compactCraftingAugmentPlanForAI
} = require('./craftingAugmentPlan');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4o-mini';

function getUserGoal() {
  const argGoal = process.argv.slice(2).join(' ').trim();

  if (argGoal) {
    return argGoal;
  }

  return 'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';
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

  if (preferredWeaponSubtypes.includes('handwraps')) {
    return true;
  }

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

function getCandidateKey(item) {
  return item.itemKey || item.link || item.name;
}

function getExpandedCandidateLimit(limit) {
  return Math.max(limit * 4, 20);
}

function promoteUsefulCandidates(rawCandidates, buildProfile, limit) {
  const selected = [];
  const seen = new Set();

  const usefulCandidates = rawCandidates.filter(item => {
    const compact = compactItemForAI(item, buildProfile);

    return (
      Array.isArray(compact.effects) &&
      compact.effects.length > 0
    );
  });

  for (const item of usefulCandidates) {
    const key = getCandidateKey(item);

    if (seen.has(key)) {
      continue;
    }

    selected.push(item);
    seen.add(key);

    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const item of rawCandidates) {
    const key = getCandidateKey(item);

    if (seen.has(key)) {
      continue;
    }

    selected.push(item);
    seen.add(key);

    if (selected.length >= limit) {
      return selected;
    }
  }

  return selected;
}

function conflictMatchesBuildProfile(conflict, buildProfile) {
  const text = [
    conflict.stackKey,
    conflict.stat,
    conflict.winningBonus?.raw,
    ...(conflict.suppressedBonuses || []).map(bonus => bonus.raw)
  ]
    .join(' ')
    .toLowerCase();

  const importantTerms = [
    ...(buildProfile.primaryStats || []),
    ...(buildProfile.priorityTerms || []),
    ...(buildProfile.secondaryTerms || [])
  ];

  return importantTerms.some(term =>
    text.includes(String(term).toLowerCase())
  );
}

function getIntentionalAugmentUpgradeStackKeys(augmentImpactSummary) {
  const stackKeys = new Set();

  for (const impact of augmentImpactSummary?.augmentImpacts || []) {
    if (impact.impactType === 'upgrades_existing_gear_bonus') {
      stackKeys.add(impact.stackKey);
    }
  }

  return stackKeys;
}

function isIntentionalAugmentUpgradeConflict(
  conflict,
  augmentImpactSummary
) {
  const intentionalUpgradeStackKeys =
    getIntentionalAugmentUpgradeStackKeys(augmentImpactSummary);

  return intentionalUpgradeStackKeys.has(conflict.stackKey);
}

function getBonusSourceLabel(bonus) {
  const source = bonus.source || {};

  if (source.type === 'augment') {
    return `${source.name} slotted into ${source.itemName}`;
  }

  if (source.type === 'item') {
    return source.name;
  }

  if (source.type === 'set_bonus') {
    return `${source.setName} set bonus`;
  }

  return 'unknown source';
}

function compactSetProgress(set) {
  const inactiveBonuses = set.inactiveBonuses || [];

  const nextInactiveBonus = inactiveBonuses
    .slice()
    .sort((a, b) => a.piecesRequired - b.piecesRequired)[0];

  return {
    setId: set.setId,
    setName: set.setName,
    tier: set.tier,
    piecesEquipped: set.piecesEquipped,

    nextBonusPiecesRequired: nextInactiveBonus
      ? nextInactiveBonus.piecesRequired
      : null,

    piecesUntilNextBonus: nextInactiveBonus
      ? Math.max(0, nextInactiveBonus.piecesRequired - set.piecesEquipped)
      : null,

    equippedPieces: (set.equippedPieces || []).map(piece => ({
      name: piece.name,
      slot: piece.slot,
      tier: piece.tier
    })),

    activeBonuses: (set.activeBonuses || []).map(bonus => ({
      piecesRequired: bonus.piecesRequired,
      effect: bonus.effect
    })),

    inactiveBonuses: inactiveBonuses.map(bonus => ({
      piecesRequired: bonus.piecesRequired,
      effect: bonus.effect
    }))
  };
}

function compactValidationForAI(
  validationResult,
  buildProfile,
  augmentImpactSummary = null
) {
  const filteredStackingConflicts =
    (validationResult.stackingConflicts || [])
      .filter(conflict =>
        conflictMatchesBuildProfile(conflict, buildProfile)
      )
      .filter(conflict =>
        !isIntentionalAugmentUpgradeConflict(
          conflict,
          augmentImpactSummary
        )
      )
      .slice(0, 8);

  return {
    valid: validationResult.valid,

    stackingConflictCount: filteredStackingConflicts.length,
    hasProblematicStackingConflicts:
      filteredStackingConflicts.length > 0,

    errors: (validationResult.errors || []).map(error => ({
      type: error.type,
      message: error.message
    })),

    warnings: (validationResult.warnings || [])
      .filter(warning => warning.type !== 'stacking_conflict')
      .map(warning => ({
        type: warning.type,
        message: warning.message,
        stackKey: warning.stackKey || null
      })),

    activeSetBonuses: (validationResult.activeSetBonuses || []).map(bonus => ({
      setId: bonus.setId,
      setName: bonus.setName,
      tier: bonus.tier,
      piecesEquipped: bonus.piecesEquipped,
      piecesRequired: bonus.piecesRequired,
      effect: bonus.effect
    })),

    setProgress: (validationResult.setProgress || []).map(compactSetProgress),

    stackingConflicts: filteredStackingConflicts.map(conflict => ({
      stackKey: conflict.stackKey,
      bonusType: conflict.bonusType,
      stat: conflict.stat,
      winningBonus: {
        raw: conflict.winningBonus.raw,
        value: conflict.winningBonus.value,
        valueText: conflict.winningBonus.valueText,
        source: conflict.winningBonus.source,
        sourceLabel: getBonusSourceLabel(conflict.winningBonus)
      },
      suppressedBonuses: (conflict.suppressedBonuses || []).map(bonus => ({
        raw: bonus.raw,
        value: bonus.value,
        valueText: bonus.valueText,
        source: bonus.source,
        sourceLabel: getBonusSourceLabel(bonus)
      }))
    }))
  };
}

function compactCraftingPlanForPrompt(craftingAugmentPlan) {
  if (!craftingAugmentPlan) {
    return null;
  }

  const compact = compactCraftingAugmentPlanForAI(craftingAugmentPlan);

  return {
    buildMaxLevel: compact.buildMaxLevel,

    usefulCraftingSlots: compact.usefulCraftingSlots
      .slice(0, 8)
      .map(slot => ({
        key: slot.key,
        label: slot.label,
        system: slot.system,
        slotType: slot.slotType,
        itemGroup: slot.itemGroup,
        bestScore: slot.bestScore,
        bestCandidate: slot.bestCandidate,
        stackFamilies: (slot.stackFamilies || []).slice(0, 5)
      })),

    desiredCraftingStackKeys:
      compact.desiredCraftingStackKeys.slice(0, 20)
  };
}

function compactAugmentImpactWithoutFinalStackSummary(
  augmentImpactResult
) {
  const fullAugmentImpactSummary =
    compactAugmentImpactForAI(augmentImpactResult);

  return {
    counts: fullAugmentImpactSummary.counts,
    augmentImpacts: fullAugmentImpactSummary.augmentImpacts
  };
}

function buildPlannerData(
  items,
  augments,
  craftingAugments,
  buildProfile
) {
  const craftingAugmentPlan = buildCraftingAugmentPlan({
    craftingAugments,
    buildProfile,
    systems: ['Lamordia'],
    limitPerSlot: 5,
    minimumScore: 40
  });

  const craftingAugmentPlanSummary =
    compactCraftingPlanForPrompt(craftingAugmentPlan);

  const queryGroups = getCandidateQueries(buildProfile);

  const initialGearGroups = queryGroups.map(group => {
    const requestedLimit = group.query.limit || 5;

    const rawCandidates = searchItems(items, {
      ...group.query,
      limit: getExpandedCandidateLimit(requestedLimit)
    });

    const selectionPoolLimit = Math.max(requestedLimit * 2, 10);

    const fullCandidates = promoteUsefulCandidates(
      rawCandidates,
      buildProfile,
      selectionPoolLimit
    );

    return {
      label: group.label,
      requestedLimit,
      fullCandidates
    };
  });

  const stackAwareResult = buildStackAwareGearset({
    gearGroups: initialGearGroups,
    buildProfile,
    craftingAugmentPlan
  });

  const gearGroups = stackAwareResult.gearGroups.map(group => {
    const requestedLimit = group.requestedLimit || 5;

    const compactCandidates = group.fullCandidates
      .slice(0, requestedLimit)
      .map(item =>
        compactItemForAI(item, buildProfile)
      );

    return {
      ...group,
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

  const augmentImpactResult = analyzeAugmentImpact({
    equippedItems: primaryFullItems,
    selectedAugments,
    buildProfile
  });

  const augmentImpactSummary =
    compactAugmentImpactWithoutFinalStackSummary(
      augmentImpactResult
    );

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
      stackAwareSelection: group.stackAwareSelection || null,
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

    stackAwareSelectionLog: stackAwareResult.selectionLog,
    coveredBonusList: stackAwareResult.coveredBonusList,

    craftingAugmentPlanSummary,
    augmentImpactSummary,

    validationSummary: compactValidationForAI(
      validationResult,
      buildProfile,
      augmentImpactSummary
    )
  };
}

function buildPrompt(
  buildProfile,
  candidateBundle,
  validationSummary,
  augmentImpactSummary,
  craftingAugmentPlanSummary
) {
  const compactProfile = compactBuildProfileForAI(buildProfile);

  return `
You are helping build a Dungeons & Dragons Online gear planner.

Important rules:
- Do not invent items.
- Do not invent augments.
- Only recommend items from the candidate lists.
- Candidate order has already been adjusted by the stack-aware gear selector.
- Treat candidates[0] as the selected primary item after stack-aware scoring.
- The stack-aware gear selector can reward crafting slot potential.
- Crafting augment potential is planning metadata, not an active equipped effect yet.
- Do not list crafting augment potential as an item effect.
- Do not claim a crafting augment is active unless it appears in selected crafting augments. This planner does not select final crafting augments yet.
- If a selected item has stackAwareSelection.craftingPotential.score greater than 0, explain that the item is valuable because it can support those crafting augment systems later.
- Only say a primary item was favored for crafting potential if its stackAwareSelection.craftingPotential.score is greater than 0.
- Augments have already been selected by validation code.
- Do not choose new normal augments.
- Do not replace selected normal augments with different normal augments.
- Use the validation summary as the source of truth for legal status, active set bonuses, inactive set progress, errors, warnings, and stacking conflicts.
- validationSummary.stackingConflictCount is authoritative.
- If validationSummary.stackingConflictCount is greater than 0, you MUST list every entry in validationSummary.stackingConflicts.
- Never write "No problematic stacking conflicts detected" unless validationSummary.stackingConflictCount is exactly 0.
- Use the augment impact summary to distinguish intentional normal augment upgrades from bad duplicate stacking.
- If an augment impact has impactType "upgrades_existing_gear_bonus", describe it as an intentional upgrade, not as a weakness.
- If an augment impact has impactType "adds_new_stack_family", describe it as adding useful coverage.
- If an augment impact has impactType "duplicates_existing_gear_bonus" or "suppressed_by_existing_gear_bonus", describe it as a potential problem.
- Stacking conflicts caused by intentional normal augment upgrades have already been removed from validationSummary.stackingConflicts.
- The remaining validationSummary.stackingConflicts should be treated as problematic or worth reviewing.
- Only list stacking conflicts that appear inside validationSummary.stackingConflicts.
- Do not infer extra stacking conflicts from augmentImpactSummary.
- If validationSummary.valid is false, clearly explain the validation errors.
- If validationSummary.valid is true, say the proposed primary gearset is valid.
- When explaining stacking conflicts, use sourceLabel exactly.
- Do not treat suppressed bonuses as contributing to the final total.
- If selectedAugmentsForPrimaryItem is null, say no normal augment selection was provided.
- If selectedAugmentsForPrimaryItem has openSlots, mention those slots as open.
- Keep item effects, normal augment choices, augment impact, crafting potential, set bonuses, and stacking conflicts separate.
- Never list a normal augment as an item effect.
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
- For inactive sets, use setProgress.nextBonusPiecesRequired as the next required piece count. Do not use available pieces as pieces required.
- Do not mix Heroic, Epic, and Legendary set bonus values.
- Avoid duplicate sections.
- Avoid repeating the same sentence.

Build profile:
${JSON.stringify(compactProfile, null, 2)}

Crafting augment plan summary:
${JSON.stringify(craftingAugmentPlanSummary, null, 2)}

Validation summary:
${JSON.stringify(validationSummary, null, 2)}

Normal augment impact summary:
${JSON.stringify(augmentImpactSummary, null, 2)}

Candidate items and selected normal augments by slot:
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
- If selectedAugmentsForPrimaryItem is null, write "No normal augment selection provided."
- If stackAwareSelection.craftingPotential.score is greater than 0, mention the crafting slot potential separately.
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
    - Selected normal augments:
    - Open normal augment slots:
    - Crafting augment potential:
  - Backup Item:
    - Name:
    - Useful item effects:
    - Selected normal augments: not selected

Crafting Augment Plan:
- Summarize the strongest useful crafting slot systems.
- Explain that this is potential only, not final selected crafting augments.
- Mention selected primary items that were favored because of crafting potential, but only if stackAwareSelection.craftingPotential.score is greater than 0.

Normal Augment Impact:
- Summarize augmentImpactSummary.counts.
- List upgrades from augmentImpactSummary.augmentImpacts.
- Clearly separate intentional normal augment upgrades from problematic duplicate/suppressed augments.

Active Set Bonuses:
- List only validationSummary.activeSetBonuses.
- If none, write "None active."

Inactive Set Progress:
- List sets from validationSummary.setProgress that are not active.
- Use nextBonusPiecesRequired and piecesUntilNextBonus.
- Do not say "1 of 7 pieces" unless nextBonusPiecesRequired is 7.

Stacking Conflicts:
- validationSummary.stackingConflictCount is authoritative.
- If validationSummary.stackingConflictCount is 0, write "No problematic stacking conflicts detected."
- Otherwise, list every conflict in validationSummary.stackingConflicts.
- These conflicts exclude intentional normal augment upgrades.
- For each conflict, state which bonus wins and which bonuses are suppressed.

Weaknesses:
- List missing stats, weak slots, normal augment gaps, problematic duplicate stacking, validation warnings, or tradeoffs.
- Do not list intentional normal augment upgrades as weaknesses.
- Do not list crafting potential as an active benefit.

Summary:
- Keep this under 5 sentences.
`;
}

async function askOpenAIForGearAdvice(
  buildProfile,
  candidateBundle,
  validationSummary,
  augmentImpactSummary,
  craftingAugmentPlanSummary
) {
  const prompt = buildPrompt(
    buildProfile,
    candidateBundle,
    validationSummary,
    augmentImpactSummary,
    craftingAugmentPlanSummary
  );

  const response = await client.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: 3600
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
  const craftingAugments = loadCraftingAugments();

  const plannerData = buildPlannerData(
    items,
    augments,
    craftingAugments,
    buildProfile
  );

  console.log(`Loaded ${items.length} items.`);
  console.log(`Loaded ${augments.length} normal augments.`);
  console.log(`Loaded ${craftingAugments.length} crafting augments.`);
  console.log(`Using model: ${MODEL}`);
  console.log(`Goal: ${goal}`);
  console.log(`Build types: ${buildProfile.buildTypes.join(', ')}`);
  console.log(`Primary stats: ${buildProfile.primaryStats.join(', ') || 'none'}`);
  console.log('');

  if (plannerData.craftingAugmentPlanSummary) {
    console.log('Top crafting augment slot systems:');

    for (const slot of plannerData.craftingAugmentPlanSummary.usefulCraftingSlots.slice(0, 6)) {
      console.log(
        `- ${slot.label}: ${slot.bestCandidate.name} (${slot.bestCandidate.stackKey}, score ${slot.bestScore})`
      );
    }

    console.log('');
  }

  console.log('Candidate counts by slot:');
  for (const group of plannerData.candidateBundle) {
    console.log(`${group.label}: ${group.candidates.length} candidates`);
  }
  console.log('');

  if (plannerData.stackAwareSelectionLog.length > 0) {
    console.log('Stack-aware selections:');

    for (const entry of plannerData.stackAwareSelectionLog) {
      const craftingScore = entry.craftingPotential?.score || 0;

      const craftingText = craftingScore > 0
        ? `, crafting potential ${craftingScore.toFixed(2)}`
        : '';

      console.log(
        `- ${entry.slotLabel}: ${entry.selectedItem} (${entry.score.toFixed(2)}${craftingText})`
      );
    }

    console.log('');
  }

  if (plannerData.augmentImpactSummary) {
    console.log('Normal augment impact:');
    console.log(
      `- Adds new stack family: ${plannerData.augmentImpactSummary.counts.addsNewStackFamily}`
    );
    console.log(
      `- Upgrades existing gear bonus: ${plannerData.augmentImpactSummary.counts.upgradesExistingGearBonus}`
    );
    console.log(
      `- Duplicates existing gear bonus: ${plannerData.augmentImpactSummary.counts.duplicatesExistingGearBonus}`
    );
    console.log(
      `- Suppressed by existing gear bonus: ${plannerData.augmentImpactSummary.counts.suppressedByExistingGearBonus}`
    );
    console.log('');
  }

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

  if (plannerData.validationSummary.stackingConflicts.length > 0) {
    console.log('Problematic stacking conflicts:');
    for (const conflict of plannerData.validationSummary.stackingConflicts) {
      const suppressed = conflict.suppressedBonuses
        .map(bonus => bonus.raw)
        .join(', ');

      console.log(
        `- ${conflict.stackKey}: ${conflict.winningBonus.raw} suppresses ${suppressed}`
      );
    }
  }

  console.log('');

  const advice = await askOpenAIForGearAdvice(
    buildProfile,
    plannerData.candidateBundle,
    plannerData.validationSummary,
    plannerData.augmentImpactSummary,
    plannerData.craftingAugmentPlanSummary
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