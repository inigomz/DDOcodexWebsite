// testaugmentgapplanner.js

const fs = require('fs');
const path = require('path');

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadAllItems,
  searchItems
} = require('../tools/gearsearch');

const {
  loadAllAugments,
  getAugmentCandidatesForItems
} = require('../tools/augmentSearch');

const {
  loadCraftingAugments
} = require('../tools/craftingAugmentSearch');

const {
  buildCraftingAugmentPlan
} = require('../tools/craftingAugmentPlan');

const {
  buildStackAwareGearset
} = require('../tools/gearSetBuilder');

const {
  selectAugmentsForItems
} = require('../tools/augmentSelection');

const {
  validateGearset
} = require('../tools/gearsetValidator');

const {
  buildAugmentGapPlan,
  compactAugmentGapPlanForAI
} = require('../tools/augmentGapPlanner');

const {
  buildAugmentSlotPlan,
  compactAugmentSlotPlanForAI
} = require('../tools/augmentSlotPlanner');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const items = loadAllItems();
const normalAugments = loadAllAugments();
const craftingAugments = loadCraftingAugments();

const craftingAugmentPlan = buildCraftingAugmentPlan({
  craftingAugments,
  buildProfile,
  systems: ['Lamordia'],
  limitPerSlot: 5,
  minimumScore: 40
});

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
  return (buildProfile.preferredWeaponSubtypes || [])
    .includes('handwraps');
}

function getCandidateQueries(buildProfile) {
  const base = createBaseQuery(buildProfile);
  const shouldInclude = getGeneralShouldInclude(buildProfile);

  const queries = [
    ['Eyes', 'eyes', 5],
    ['Neck', 'neck', 5],
    ['Trinket', 'trinket', 5],
    ['Finger', 'finger', 8],
    ['Hands', 'hands', 5],
    ['Body / Armor', 'armor', 5],
    ['Feet', 'feet', 5],
    ['Waist', 'waist', 5],
    ['Wrists', 'wrists', 5],
    ['Back', 'back', 5],
    ['Head', 'head', 5]
  ].map(([label, slot, limit]) => ({
    label,
    requestedLimit: limit,
    query: {
      ...base,
      slot,
      shouldInclude,
      limit: Math.max(limit * 4, 20)
    }
  }));

  queries.push({
    label: 'Weapon / Preferred Weapon',
    requestedLimit: 5,
    query: {
      ...base,
      slot: 'weapon',
      itemSubtypes: buildProfile.preferredWeaponSubtypes || [],
      shouldInclude,
      limit: 20
    }
  });

  if (!shouldSkipOffhand(buildProfile)) {
    queries.push({
      label: 'Offhand',
      requestedLimit: 5,
      query: {
        ...base,
        slot: 'offhand',
        shouldInclude,
        limit: 20
      }
    });
  }

  return queries;
}

function buildGearGroups() {
  return getCandidateQueries(buildProfile).map(group => ({
    label: group.label,
    requestedLimit: group.requestedLimit,
    fullCandidates: searchItems(items, group.query)
  }));
}

function writeJsonFile(filepath, data) {
  fs.writeFileSync(
    filepath,
    JSON.stringify(data, null, 2)
  );
}

function compactValidationResult(validationResult) {
  return {
    valid: validationResult.valid,

    errorCount: (validationResult.errors || []).length,
    warningCount: (validationResult.warnings || []).length,
    stackingConflictCount:
      (validationResult.stackingConflicts || []).length,

    errors: validationResult.errors || [],
    warnings: validationResult.warnings || [],

    activeSetBonuses: validationResult.activeSetBonuses || [],
    setProgress: validationResult.setProgress || [],

    stackingConflicts:
      (validationResult.stackingConflicts || []).map(conflict => ({
        stackKey: conflict.stackKey,
        bonusType: conflict.bonusType,
        stat: conflict.stat,
        winningBonus: conflict.winningBonus
          ? {
              raw: conflict.winningBonus.raw,
              value: conflict.winningBonus.value,
              source: conflict.winningBonus.source
            }
          : null,
        suppressedBonuses:
          (conflict.suppressedBonuses || []).map(bonus => ({
            raw: bonus.raw,
            value: bonus.value,
            source: bonus.source
          }))
      }))
  };
}

function printGapSummary(title, compactGapPlan, gapPlanOutputFile) {
  console.log('');
  console.log(title);
  console.log('Gap counts:', compactGapPlan.counts);
  console.log(`Saved full gap plan to: ${gapPlanOutputFile}`);

  console.log('\nTop open gaps:');
  for (const gap of compactGapPlan.highestPriorityOpenGaps.slice(0, 12)) {
    console.log(
      `- ${gap.label}: current ${gap.currentValue}, minimum ${gap.minimumValue}, target ${gap.targetValue}, status ${gap.status}`
    );
  }

  console.log('\nBest recommendations:');
  for (const rec of compactGapPlan.bestRecommendations.slice(0, 15)) {
    const location = rec.itemName
      ? ` on ${rec.itemName}`
      : '';

    console.log(
      `- ${rec.name}${location}: ${rec.effect} -> ${rec.targetLabel} (score ${rec.score.toFixed(2)})`
    );
  }
}

function printSlotPlanSummary(compactSlotPlan, slotPlanOutputFile) {
  console.log('');
  console.log('Slot plan counts:', compactSlotPlan.counts);
  console.log(`Saved full slot plan to: ${slotPlanOutputFile}`);

  console.log('\nNormal augment assignments:');
  for (const assignment of compactSlotPlan.normalAssignments.slice(0, 15)) {
    console.log(
      `- ${assignment.augmentName} into ${assignment.itemName} (${assignment.slotColor}): ${assignment.effect} -> ${assignment.targetLabel}`
    );
  }

  console.log('\nCrafting augment assignments:');
  for (const assignment of compactSlotPlan.craftingAssignments.slice(0, 15)) {
    console.log(
      `- ${assignment.augmentName} on ${assignment.itemName}: ${assignment.effect} -> ${assignment.targetLabel}`
    );
  }

  console.log('\nRemaining open normal slots:');
  for (const slot of compactSlotPlan.remainingOpenNormalSlots.slice(0, 15)) {
    console.log(
      `- ${slot.itemName}: ${slot.color}`
    );
  }
}

function printValidationSummary(title, compactValidation, outputFile) {
  console.log('');
  console.log(title);
  console.log(`Saved validation summary to: ${outputFile}`);
  console.log(`- Valid: ${compactValidation.valid}`);
  console.log(`- Errors: ${compactValidation.errorCount}`);
  console.log(`- Warnings: ${compactValidation.warningCount}`);
  console.log(
    `- Stacking conflicts: ${compactValidation.stackingConflictCount}`
  );

  if (compactValidation.errors.length > 0) {
    console.log('\nValidation errors:');
    for (const error of compactValidation.errors.slice(0, 10)) {
      console.log(`- ${error.type || 'error'}: ${error.message || error}`);
    }
  }

  if (compactValidation.stackingConflicts.length > 0) {
    console.log('\nTop stacking conflicts:');
    for (const conflict of compactValidation.stackingConflicts.slice(0, 10)) {
      const suppressed = (conflict.suppressedBonuses || [])
        .map(bonus => bonus.raw)
        .join(', ');

      console.log(
        `- ${conflict.stackKey}: ${conflict.winningBonus?.raw || 'unknown'} suppresses ${suppressed}`
      );
    }
  }
}

function main() {
  const gearGroups = buildGearGroups();

  const stackAwareResult = buildStackAwareGearset({
    gearGroups,
    buildProfile,
    craftingAugmentPlan
  });

  const equippedItems = stackAwareResult.selectedItems;

  const itemsWithNormalAugmentSlots = equippedItems.filter(item =>
    Array.isArray(item.augmentSlots) &&
    item.augmentSlots.length > 0
  );

  const augmentCandidateGroups = getAugmentCandidatesForItems(
    itemsWithNormalAugmentSlots,
    normalAugments,
    {
      goal,
      maxLevel: buildProfile.maxLevel || 34,
      limitPerSlot: 5
    }
  );

  const initiallySelectedAugments = selectAugmentsForItems({
    items: itemsWithNormalAugmentSlots,
    augmentCandidateGroups,
    buildProfile,
    allowRedundant: false
  });

  const initialGapPlan = buildAugmentGapPlan({
    equippedItems,
    selectedAugments: initiallySelectedAugments,
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  const compactInitialGapPlan =
    compactAugmentGapPlanForAI(initialGapPlan);

  const slotPlan = buildAugmentSlotPlan({
  augmentGapPlan: initialGapPlan,
  selectedAugments: initiallySelectedAugments,
  equippedItems
});

  const compactSlotPlan = compactAugmentSlotPlanForAI(slotPlan);

  const finalSelectedAugments =
    slotPlan.selectedAugmentsForValidation;

  const finalValidation = validateGearset({
  equippedItems,
  selectedAugments: finalSelectedAugments,
  craftingAssignments: slotPlan.craftingAssignments,
  buildProfile
});

  const compactFinalValidation =
    compactValidationResult(finalValidation);

  const finalGapPlanAfterNormalAugments = buildAugmentGapPlan({
  equippedItems,
  selectedAugments: finalSelectedAugments,
  craftingAssignments: slotPlan.craftingAssignments,
  normalAugments,
  craftingAugmentPlan,
  buildProfile
});

  const compactFinalGapPlanAfterNormalAugments =
    compactAugmentGapPlanForAI(finalGapPlanAfterNormalAugments);

  const outputDir = path.join(__dirname, '..', 'testoutput');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const initialGapPlanOutputFile = path.join(
    outputDir,
    'augment_gap_plan_test_output.json'
  );

  const slotPlanOutputFile = path.join(
    outputDir,
    'augment_slot_plan_test_output.json'
  );

  const finalValidationOutputFile = path.join(
    outputDir,
    'final_validation_test_output.json'
  );

  const finalGapPlanOutputFile = path.join(
    outputDir,
    'final_augment_gap_plan_test_output.json'
  );

  writeJsonFile(initialGapPlanOutputFile, compactInitialGapPlan);
  writeJsonFile(slotPlanOutputFile, compactSlotPlan);
  writeJsonFile(finalValidationOutputFile, compactFinalValidation);
  writeJsonFile(
    finalGapPlanOutputFile,
    compactFinalGapPlanAfterNormalAugments
  );

  console.log(`Loaded ${items.length} items.`);
  console.log(`Loaded ${normalAugments.length} normal augments.`);
  console.log(`Loaded ${craftingAugments.length} crafting augments.`);

  printGapSummary(
    'Initial gap plan',
    compactInitialGapPlan,
    initialGapPlanOutputFile
  );

  printSlotPlanSummary(
    compactSlotPlan,
    slotPlanOutputFile
  );

  printValidationSummary(
    'Final validation after normal augment assignments',
    compactFinalValidation,
    finalValidationOutputFile
  );

  printGapSummary(
    'Final gap plan after normal augment assignments',
    compactFinalGapPlanAfterNormalAugments,
    finalGapPlanOutputFile
  );

  console.log('');
  console.log('Note: crafting assignments are saved in the slot plan, but they are not yet applied to final validation/gap coverage. The next code update should connect craftingAssignments into augmentGapPlanner/gearsetValidator as planned crafting effects.');
}

main();