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
  loadAllAugments
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

const {
  runSwapOptimizer,
  scoreGearset,
  countRelevantConflicts
} = require('../tools/swapOptimizer');

const {
  buildSummary: buildSummaryTool,
  compactSummaryForAI
} = require('../tools/buildSummary');

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
    relevantConflictCount:
      countRelevantConflicts(validationResult.stackingConflicts || []),

    errors: validationResult.errors || [],
    warnings: validationResult.warnings || [],

    activeSetBonuses: validationResult.activeSetBonuses || [],
    setProgress: validationResult.setProgress || [],
    craftingAssignments: validationResult.craftingAssignments || [],

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

function compactSelectedItems(equippedItems = []) {
  return equippedItems.map(item => ({
    slot: item.slot,
    name: item.name,
    link: item.link,
    minLevel: item.minLevel,
    stackAwareScore: item.stackAwareScore,
    dynamicScore: item.dynamicScore,
    craftingSlots: item.craftingSlots || [],
    augmentSlots: item.augmentSlots || [],
    effectsRaw: item.effectsRaw || item.namedEffects || []
  }));
}

function buildCompletedPipeline(equippedItems) {
  const initialGapPlan = buildAugmentGapPlan({
    equippedItems,
    selectedAugments: [],
    craftingAssignments: [],
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  const slotPlan = buildAugmentSlotPlan({
    augmentGapPlan: initialGapPlan,
    selectedAugments: [],
    equippedItems
  });

  const validationResult = validateGearset({
    equippedItems,
    selectedAugments: slotPlan.selectedAugmentsForValidation,
    craftingAssignments: slotPlan.craftingAssignments,
    buildProfile
  });

  const finalGapPlan = buildAugmentGapPlan({
    equippedItems,
    selectedAugments: slotPlan.selectedAugmentsForValidation,
    craftingAssignments: slotPlan.craftingAssignments,
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  return {
    equippedItems,
    initialGapPlan,
    slotPlan,
    validationResult,
    finalGapPlan
  };
}

function compactPipelineForOutput(pipeline) {
  const compactInitialGapPlan =
    compactAugmentGapPlanForAI(pipeline.initialGapPlan);

  const compactSlotPlan =
    compactAugmentSlotPlanForAI(pipeline.slotPlan);

  const compactValidation =
    compactValidationResult(pipeline.validationResult);

  const compactFinalGapPlan =
    compactAugmentGapPlanForAI(pipeline.finalGapPlan);

  return {
    score: scoreGearset({
      finalGapPlan: pipeline.finalGapPlan,
      validationResult: pipeline.validationResult,
      slotPlan: pipeline.slotPlan
    }),

    selectedItems: compactSelectedItems(pipeline.equippedItems),

    initialGapPlan: compactInitialGapPlan,
    slotPlan: compactSlotPlan,
    validation: compactValidation,
    finalGapPlan: compactFinalGapPlan
  };
}

function compactSwapOptimizerResult(optimizerResult) {
  return {
    swapCount: optimizerResult.swapCount,
    swapLog: optimizerResult.swapLog,
    finalScoreBreakdown: optimizerResult.finalScoreBreakdown || null,

    optimizedSelectedItems:
      compactSelectedItems(
        optimizerResult.optimizedGearset.selectedItems
      ),

    finalScore: scoreGearset(optimizerResult.finalEvaluation),

    finalCounts: {
      metTargetCount:
        optimizerResult.finalEvaluation.finalGapPlan.counts.metTargetCount,
      openGapCount:
        optimizerResult.finalEvaluation.finalGapPlan.counts.openGapCount,
      normalAssignmentCount:
        optimizerResult.finalEvaluation.slotPlan.counts.normalAssignmentCount,
      craftingAssignmentCount:
        optimizerResult.finalEvaluation.slotPlan.counts.craftingAssignmentCount,
      stackingConflictCount:
        optimizerResult.finalEvaluation.validationResult.stackingConflicts.length,
      relevantConflictCount:
        countRelevantConflicts(
          optimizerResult.finalEvaluation.validationResult.stackingConflicts
        ),
      errorCount:
        optimizerResult.finalEvaluation.validationResult.errors.length,
      warningCount:
        optimizerResult.finalEvaluation.validationResult.warnings.length
    }
  };
}

function printGapSummary(title, compactGapPlan, gapPlanOutputFile) {
  console.log('');
  console.log(title);
  console.log('Gap counts:', compactGapPlan.counts);
  console.log(`Saved gap plan to: ${gapPlanOutputFile}`);

  console.log('\nTop open gaps:');
  for (const gap of compactGapPlan.highestPriorityOpenGaps.slice(0, 12)) {
    console.log(
      `- ${gap.label}: current ${gap.currentValue}, minimum ${gap.minimumValue}, target ${gap.targetValue}, status ${gap.status}`
    );
  }
}

function printSlotPlanSummary(title, compactSlotPlan, slotPlanOutputFile) {
  console.log('');
  console.log(title);
  console.log('Slot plan counts:', compactSlotPlan.counts);
  console.log(`Saved slot plan to: ${slotPlanOutputFile}`);

  console.log('\nNormal augment assignments:');
  for (const assignment of compactSlotPlan.normalAssignments.slice(0, 12)) {
    console.log(
      `- ${assignment.augmentName} into ${assignment.itemName} (${assignment.slotColor}): ${assignment.effect} -> ${assignment.targetLabel}`
    );
  }

  console.log('\nCrafting augment assignments:');
  for (const assignment of compactSlotPlan.craftingAssignments.slice(0, 12)) {
    console.log(
      `- ${assignment.augmentName} on ${assignment.itemName}: ${assignment.effect} -> ${assignment.targetLabel}`
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
  console.log(
    `- Relevant conflicts: ${compactValidation.relevantConflictCount}`
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

function printSelectedItems(title, equippedItems = []) {
  console.log('');
  console.log(title);

  for (const item of equippedItems) {
    console.log(`- ${item.slot}: ${item.name}`);
  }
}

function printComparison({
  baselinePipeline,
  optimizedResult
}) {
  const baselineScore = scoreGearset({
    finalGapPlan: baselinePipeline.finalGapPlan,
    validationResult: baselinePipeline.validationResult,
    slotPlan: baselinePipeline.slotPlan
  });

  const optimizedScore = scoreGearset(
    optimizedResult.finalEvaluation
  );

  const baselineValidation =
    baselinePipeline.validationResult;

  const optimizedValidation =
    optimizedResult.finalEvaluation.validationResult;

  const baselineFinalGap =
    baselinePipeline.finalGapPlan;

  const optimizedFinalGap =
    optimizedResult.finalEvaluation.finalGapPlan;

  const baselineSlotPlan =
    baselinePipeline.slotPlan;

  const optimizedSlotPlan =
    optimizedResult.finalEvaluation.slotPlan;

  console.log('');
  console.log('=== Baseline vs Optimized Comparison ===');

  console.log(`Score: ${baselineScore} -> ${optimizedScore}`);
  console.log(
    `Met targets: ${baselineFinalGap.counts.metTargetCount} -> ${optimizedFinalGap.counts.metTargetCount}`
  );
  console.log(
    `Open gaps: ${baselineFinalGap.counts.openGapCount} -> ${optimizedFinalGap.counts.openGapCount}`
  );
  console.log(
    `Normal assignments: ${baselineSlotPlan.counts.normalAssignmentCount} -> ${optimizedSlotPlan.counts.normalAssignmentCount}`
  );
  console.log(
    `Crafting assignments: ${baselineSlotPlan.counts.craftingAssignmentCount} -> ${optimizedSlotPlan.counts.craftingAssignmentCount}`
  );
  console.log(
    `Stacking conflicts: ${baselineValidation.stackingConflicts.length} -> ${optimizedValidation.stackingConflicts.length}`
  );
  console.log(
    `Relevant conflicts: ${countRelevantConflicts(baselineValidation.stackingConflicts)} -> ${countRelevantConflicts(optimizedValidation.stackingConflicts)}`
  );
  console.log(
    `Errors: ${baselineValidation.errors.length} -> ${optimizedValidation.errors.length}`
  );
  console.log(`Swaps made: ${optimizedResult.swapCount}`);

  if (optimizedResult.swapLog.length > 0) {
    console.log('\nSwap log:');

    for (const swap of optimizedResult.swapLog) {
      console.log(
        `- Pass ${swap.pass}: ${swap.slotLabel}: ${swap.oldItemName} -> ${swap.newItemName} (${swap.oldScore} -> ${swap.newScore})`
      );
    }
  }
}

function main() {
  const outputDir = path.join(__dirname, '..', 'testoutput');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Loaded ${items.length} items.`);
  console.log(`Loaded ${normalAugments.length} normal augments.`);
  console.log(`Loaded ${craftingAugments.length} crafting augments.`);

  const gearGroups = buildGearGroups();

  const stackAwareResult = buildStackAwareGearset({
    gearGroups,
    buildProfile,
    craftingAugmentPlan
  });

  const baselinePipeline =
    buildCompletedPipeline(stackAwareResult.selectedItems);

  const optimizedResult = runSwapOptimizer({
    initialGearset: stackAwareResult,
    normalAugments,
    craftingAugmentPlan,
    buildProfile,
    options: {
      maxPasses: 3
    }
  });

  const buildSummary = buildSummaryTool({
    goal,
    buildProfile,
    baselinePipeline,
    optimizedResult,
    options: {
      gapLimit: 15,
      conflictLimit: 10
    }
  });

  const compactBuildSummary =
    compactSummaryForAI(buildSummary);

  const baselineOutput =
    compactPipelineForOutput(baselinePipeline);

  const optimizedPipeline = {
    equippedItems: optimizedResult.optimizedGearset.selectedItems,
    initialGapPlan: optimizedResult.finalEvaluation.gapPlan,
    slotPlan: optimizedResult.finalEvaluation.slotPlan,
    validationResult: optimizedResult.finalEvaluation.validationResult,
    finalGapPlan: optimizedResult.finalEvaluation.finalGapPlan
  };

  const optimizedOutput =
    compactPipelineForOutput(optimizedPipeline);

  const swapOptimizerOutput =
    compactSwapOptimizerResult(optimizedResult);

  const baselineInitialGapPlanOutputFile = path.join(
    outputDir,
    'augment_gap_plan_test_output.json'
  );

  const baselineSlotPlanOutputFile = path.join(
    outputDir,
    'augment_slot_plan_test_output.json'
  );

  const baselineValidationOutputFile = path.join(
    outputDir,
    'final_validation_test_output.json'
  );

  const baselineFinalGapPlanOutputFile = path.join(
    outputDir,
    'final_augment_gap_plan_test_output.json'
  );

  const optimizedInitialGapPlanOutputFile = path.join(
    outputDir,
    'optimized_augment_gap_plan_test_output.json'
  );

  const optimizedSlotPlanOutputFile = path.join(
    outputDir,
    'optimized_augment_slot_plan_test_output.json'
  );

  const optimizedValidationOutputFile = path.join(
    outputDir,
    'optimized_final_validation_test_output.json'
  );

  const optimizedFinalGapPlanOutputFile = path.join(
    outputDir,
    'optimized_final_augment_gap_plan_test_output.json'
  );

  const swapOptimizerOutputFile = path.join(
    outputDir,
    'swap_optimizer_test_output.json'
  );

  const buildSummaryOutputFile = path.join(
    outputDir,
    'build_summary_test_output.json'
  );

  const buildSummaryTextOutputFile = path.join(
    outputDir,
    'build_summary_test_output.txt'
  );

  writeJsonFile(
    baselineInitialGapPlanOutputFile,
    baselineOutput.initialGapPlan
  );

  writeJsonFile(
    baselineSlotPlanOutputFile,
    baselineOutput.slotPlan
  );

  writeJsonFile(
    baselineValidationOutputFile,
    baselineOutput.validation
  );

  writeJsonFile(
    baselineFinalGapPlanOutputFile,
    baselineOutput.finalGapPlan
  );

  writeJsonFile(
    optimizedInitialGapPlanOutputFile,
    optimizedOutput.initialGapPlan
  );

  writeJsonFile(
    optimizedSlotPlanOutputFile,
    optimizedOutput.slotPlan
  );

  writeJsonFile(
    optimizedValidationOutputFile,
    optimizedOutput.validation
  );

  writeJsonFile(
    optimizedFinalGapPlanOutputFile,
    optimizedOutput.finalGapPlan
  );

  writeJsonFile(
    swapOptimizerOutputFile,
    swapOptimizerOutput
  );

  writeJsonFile(
    buildSummaryOutputFile,
    compactBuildSummary
  );

  fs.writeFileSync(
    buildSummaryTextOutputFile,
    buildSummary.textSummary
  );

  printSelectedItems(
    'Baseline selected items',
    baselinePipeline.equippedItems
  );

  printGapSummary(
    'Baseline initial gap plan',
    baselineOutput.initialGapPlan,
    baselineInitialGapPlanOutputFile
  );

  printSlotPlanSummary(
    'Baseline slot plan',
    baselineOutput.slotPlan,
    baselineSlotPlanOutputFile
  );

  printValidationSummary(
    'Baseline final validation',
    baselineOutput.validation,
    baselineValidationOutputFile
  );

  printGapSummary(
    'Baseline final gap plan',
    baselineOutput.finalGapPlan,
    baselineFinalGapPlanOutputFile
  );

  printSelectedItems(
    'Optimized selected items',
    optimizedResult.optimizedGearset.selectedItems
  );

  printGapSummary(
    'Optimized initial gap plan',
    optimizedOutput.initialGapPlan,
    optimizedInitialGapPlanOutputFile
  );

  printSlotPlanSummary(
    'Optimized slot plan',
    optimizedOutput.slotPlan,
    optimizedSlotPlanOutputFile
  );

  printValidationSummary(
    'Optimized final validation',
    optimizedOutput.validation,
    optimizedValidationOutputFile
  );

  printGapSummary(
    'Optimized final gap plan',
    optimizedOutput.finalGapPlan,
    optimizedFinalGapPlanOutputFile
  );

  printComparison({
    baselinePipeline,
    optimizedResult
  });

  console.log('');
  console.log(`Saved swap optimizer summary to: ${swapOptimizerOutputFile}`);
  console.log(`Saved build summary to: ${buildSummaryOutputFile}`);
  console.log(`Saved text build summary to: ${buildSummaryTextOutputFile}`);
}

main();