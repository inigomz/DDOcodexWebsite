// buildSummary.js


const {
  scoreGearsetDetailed,
  compactScoreBreakdown,
  countRelevantConflicts
} = require('./gearsetScorer');

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function numberOrDefault(value, fallback = 0) {
  const number = Number(value);

  return Number.isNaN(number) ? fallback : number;
}

function getItemKey(item = {}) {
  return item.itemKey || item.key || item.link || item.name;
}

function getItemEffects(item = {}) {
  return unique([
    ...(Array.isArray(item.effectsRaw) ? item.effectsRaw : []),
    ...(Array.isArray(item.effects) ? item.effects : []),
    ...(Array.isArray(item.namedEffects) ? item.namedEffects : []),
    ...(Array.isArray(item.enhancements) ? item.enhancements : [])
  ]
    .map(cleanText)
    .filter(Boolean));
}

function getEvaluationFromInput({
  finalEvaluation,
  optimizedResult,
  baselinePipeline
}) {
  return (
    finalEvaluation ||
    optimizedResult?.finalEvaluation ||
    baselinePipeline ||
    null
  );
}

function getEquippedItems({
  equippedItems,
  optimizedResult,
  finalEvaluation
}) {
  return (
    equippedItems ||
    optimizedResult?.optimizedGearset?.selectedItems ||
    finalEvaluation?.equippedItems ||
    []
  );
}

function compactSelectedGearItem(item = {}) {
  return {
    slot: item.slot || 'unknown',
    name: item.name || 'unknown item',
    link: item.link || null,
    minLevel: item.minLevel ?? null,

    itemKey: getItemKey(item),

    augmentSlots: item.augmentSlots || [],
    craftingSlots: item.craftingSlots || [],

    effects: getItemEffects(item),

    stackAwareScore:
      item.stackAwareScore ?? item.dynamicScore ?? null,

    craftingPotentialScore:
      item.craftingPotentialScore ?? null
  };
}

function compactAugmentAssignment(assignment = {}) {
  return {
    sourceType: assignment.sourceType,

    itemName: assignment.itemName,
    itemKey: assignment.itemKey,

    slotColor: assignment.slotColor || null,

    augmentName: assignment.augmentName,
    augmentLink: assignment.augmentLink || null,

    effect: assignment.effect,
    stackKey: assignment.stackKey,
    value: assignment.value,

    targetId: assignment.targetId,
    targetLabel: assignment.targetLabel,

    currentValue: assignment.currentValue,
    minimumValue: assignment.minimumValue,
    targetValue: assignment.targetValue,

    score: assignment.score
  };
}

function compactCraftingAssignment(assignment = {}) {
  return {
    sourceType: assignment.sourceType,

    itemName: assignment.itemName,
    itemKey: assignment.itemKey,

    craftingSlotKey: assignment.craftingSlotKey,
    craftingSlotInstanceKey: assignment.craftingSlotInstanceKey,
    craftingSlotLabel: assignment.craftingSlotLabel,

    augmentName: assignment.augmentName,
    selectedTier: assignment.selectedTier || null,

    effect: assignment.effect,
    stackKey: assignment.stackKey,
    value: assignment.value,

    targetId: assignment.targetId,
    targetLabel: assignment.targetLabel,

    currentValue: assignment.currentValue,
    minimumValue: assignment.minimumValue,
    targetValue: assignment.targetValue,

    score: assignment.score
  };
}

function getTargetFromCoverageEntry(entry = {}) {
  return entry.target || entry;
}

function compactGap(entry = {}) {
  const target = getTargetFromCoverageEntry(entry);

  return {
    targetId: target.id || entry.targetId || null,
    label: target.label || entry.label || target.id || 'unknown target',
    category: target.category || entry.category || 'unknown',
    priority: numberOrDefault(target.priority ?? entry.priority, 0),

    status: entry.status || 'unknown',

    currentValue: numberOrDefault(entry.currentValue, 0),
    minimumValue: numberOrDefault(entry.minimumValue, 0),
    targetValue: numberOrDefault(entry.targetValue, 0),

    missingToMinimum: numberOrDefault(entry.missingToMinimum, 0),
    missingToTarget: numberOrDefault(entry.missingToTarget, 0),

    bestBonus: entry.bestBonus
      ? {
          raw: entry.bestBonus.raw,
          stackKey: entry.bestBonus.stackKey,
          value: entry.bestBonus.value,
          sourceLabel: entry.bestBonus.sourceLabel
        }
      : null
  };
}

function getSourceLabel(source = {}) {
  if (!source) {
    return 'unknown source';
  }

  if (source.type === 'item') {
    return source.name || 'unknown item';
  }

  if (source.type === 'augment') {
    return `${source.name || 'unknown augment'} slotted into ${source.itemName || 'unknown item'}`;
  }

  if (source.type === 'crafting_augment') {
    return `${source.name || 'unknown crafting augment'} planned for ${source.itemName || 'unknown item'}`;
  }

  if (source.type === 'set_bonus') {
    return `${source.setName || 'unknown set'} set bonus`;
  }

  return source.name || source.itemName || 'unknown source';
}

function compactBonus(bonus = {}) {
  return {
    raw: bonus.raw,
    stackKey: bonus.stackKey,
    value: bonus.value,
    sourceType: bonus.source?.type || null,
    sourceLabel: getSourceLabel(bonus.source)
  };
}

function compactStackingConflict(conflict = {}) {
  return {
    stackKey: conflict.stackKey,
    bonusType: conflict.bonusType,
    stat: conflict.stat,

    winningBonus: conflict.winningBonus
      ? compactBonus(conflict.winningBonus)
      : null,

    suppressedBonuses:
      (conflict.suppressedBonuses || []).map(compactBonus)
  };
}

function compactSwapLogEntry(entry = {}) {
  return {
    pass: entry.pass,
    slotLabel: entry.slotLabel,

    oldItemName: entry.oldItemName,
    newItemName: entry.newItemName,

    oldScore: entry.oldScore,
    newScore: entry.newScore,
    improvement: entry.improvement,

    oldCounts: entry.oldScoreBreakdown?.counts || null,
    newCounts: entry.newScoreBreakdown?.counts || null,

    topImprovedGapPenalties:
      entry.newScoreBreakdown?.topGapPenalties?.slice(0, 5) || []
  };
}

function getTopOpenGaps(finalGapPlan, limit) {
  return (finalGapPlan?.openGaps || [])
    .slice()
    .sort((a, b) => {
      const aTarget = getTargetFromCoverageEntry(a);
      const bTarget = getTargetFromCoverageEntry(b);

      return numberOrDefault(bTarget.priority, 0) -
        numberOrDefault(aTarget.priority, 0);
    })
    .slice(0, limit)
    .map(compactGap);
}

function getTopStackingConflicts(validationResult, limit) {
  return (validationResult?.stackingConflicts || [])
    .slice(0, limit)
    .map(compactStackingConflict);
}

function buildCounts({
  finalGapPlan,
  slotPlan,
  validationResult
}) {
  return {
    targetCount:
      finalGapPlan?.counts?.targetCount || 0,

    metTargetCount:
      finalGapPlan?.counts?.metTargetCount || 0,

    openGapCount:
      finalGapPlan?.counts?.openGapCount || 0,

    underfilledTargetCount:
      finalGapPlan?.counts?.underfilledTargetCount || 0,

    missingTargetCount:
      finalGapPlan?.counts?.missingTargetCount || 0,

    openNormalSlotCount:
      finalGapPlan?.counts?.openNormalSlotCount || 0,

    normalAssignmentCount:
      slotPlan?.counts?.normalAssignmentCount || 0,

    craftingAssignmentCount:
      slotPlan?.counts?.craftingAssignmentCount || 0,

    remainingOpenNormalSlotCount:
      slotPlan?.counts?.remainingOpenNormalSlotCount || 0,

    validationErrorCount:
      validationResult?.errors?.length || 0,

    validationWarningCount:
      validationResult?.warnings?.length || 0,

    stackingConflictCount:
      validationResult?.stackingConflicts?.length || 0,

    relevantConflictCount:
      countRelevantConflicts(
        validationResult?.stackingConflicts || []
      )
  };
}

function buildAdvisorNotes(summary) {
  const notes = [];

  if (summary.counts.validationErrorCount > 0) {
    notes.push(
      'The build has hard validation errors and should not be presented as final.'
    );
  } else {
    notes.push(
      'The build is structurally valid.'
    );
  }

  if (summary.counts.craftingAssignmentCount > 0) {
    notes.push(
      `The build uses ${summary.counts.craftingAssignmentCount} planned crafting augment assignment(s).`
    );
  }

  if (summary.counts.openGapCount > 0) {
    const topGap = summary.remainingGaps[0];

    if (topGap) {
      notes.push(
        `The highest-priority remaining gap is ${topGap.label}.`
      );
    }
  }

  if (summary.counts.relevantConflictCount > 0) {
    notes.push(
      `There are ${summary.counts.relevantConflictCount} relevant stacking conflict(s) remaining.`
    );
  }

  return notes;
}

function buildTextSummary(summary) {
  const lines = [];

  lines.push('Gearset Summary');
  lines.push('===============');

  if (summary.goal) {
    lines.push(`Goal: ${summary.goal}`);
  }

  lines.push('');
  lines.push('Counts:');
  lines.push(`- Met targets: ${summary.counts.metTargetCount}`);
  lines.push(`- Open gaps: ${summary.counts.openGapCount}`);
  lines.push(`- Normal augment assignments: ${summary.counts.normalAssignmentCount}`);
  lines.push(`- Crafting augment assignments: ${summary.counts.craftingAssignmentCount}`);
  lines.push(`- Stacking conflicts: ${summary.counts.stackingConflictCount}`);
  lines.push(`- Relevant conflicts: ${summary.counts.relevantConflictCount}`);

  lines.push('');
  lines.push('Selected Gear:');

  for (const item of summary.selectedGear) {
    lines.push(`- ${item.slot}: ${item.name}`);
  }

  lines.push('');
  lines.push('Normal Augments:');

  for (const assignment of summary.normalAugments) {
    lines.push(
      `- ${assignment.augmentName} into ${assignment.itemName}: ${assignment.effect}`
    );
  }

  lines.push('');
  lines.push('Crafting Augments:');

  for (const assignment of summary.craftingAugments) {
    lines.push(
      `- ${assignment.augmentName} on ${assignment.itemName}: ${assignment.effect}`
    );
  }

  lines.push('');
  lines.push('Top Remaining Gaps:');

  for (const gap of summary.remainingGaps.slice(0, 10)) {
    lines.push(
      `- ${gap.label}: current ${gap.currentValue}, minimum ${gap.minimumValue}, target ${gap.targetValue}, status ${gap.status}`
    );
  }

  if (summary.swapLog.length > 0) {
    lines.push('');
    lines.push('Optimizer Swaps:');

    for (const swap of summary.swapLog) {
      lines.push(
        `- Pass ${swap.pass}: ${swap.slotLabel}: ${swap.oldItemName} -> ${swap.newItemName}`
      );
    }
  }

  return lines.join('\n');
}

function buildSummary({
  goal = '',
  buildProfile = {},
  baselinePipeline = null,
  optimizedResult = null,
  finalEvaluation = null,
  equippedItems = null,
  options = {}
}) {
  const evaluation = getEvaluationFromInput({
    finalEvaluation,
    optimizedResult,
    baselinePipeline
  });

  if (!evaluation) {
    throw new Error(
      'buildSummary expected finalEvaluation, optimizedResult, or baselinePipeline.'
    );
  }

  const finalGapPlan = evaluation.finalGapPlan;
  const slotPlan = evaluation.slotPlan;
  const validationResult = evaluation.validationResult;

  const selectedItems = getEquippedItems({
    equippedItems,
    optimizedResult,
    finalEvaluation: evaluation
  });

  const gapLimit = options.gapLimit || 15;
  const conflictLimit = options.conflictLimit || 10;

  const scoreBreakdown = scoreGearsetDetailed(
    evaluation,
    options.scoringOptions || {}
  );

  const summary = {
    goal,
    buildProfile: {
      maxLevel: buildProfile.maxLevel,
      buildTypes: buildProfile.buildTypes || [],
      primaryStats: buildProfile.primaryStats || [],
      preferredWeaponSubtypes:
        buildProfile.preferredWeaponSubtypes || [],
      armorPreference:
        buildProfile.armorPreference || null
    },

    scoreBreakdown:
      compactScoreBreakdown(scoreBreakdown),

    counts: buildCounts({
      finalGapPlan,
      slotPlan,
      validationResult
    }),

    selectedGear:
      selectedItems.map(compactSelectedGearItem),

    normalAugments:
      (slotPlan.normalAssignments || [])
        .map(compactAugmentAssignment),

    craftingAugments:
      (slotPlan.craftingAssignments || [])
        .map(compactCraftingAssignment),

    remainingGaps:
      getTopOpenGaps(finalGapPlan, gapLimit),

    remainingStackingConflicts:
      getTopStackingConflicts(validationResult, conflictLimit),

    swapLog:
      (optimizedResult?.swapLog || [])
        .map(compactSwapLogEntry),

    activeSetBonuses:
      validationResult.activeSetBonuses || [],

    advisorNotes: []
  };

  summary.advisorNotes = buildAdvisorNotes(summary);
  summary.textSummary = buildTextSummary(summary);

  return summary;
}

function compactSummaryForAI(summary) {
  return {
    goal: summary.goal,
    buildProfile: summary.buildProfile,
    counts: summary.counts,

    selectedGear:
      summary.selectedGear.map(item => ({
        slot: item.slot,
        name: item.name,
        effects: item.effects,
        augmentSlots: item.augmentSlots,
        craftingSlots: item.craftingSlots
      })),

    normalAugments: summary.normalAugments,
    craftingAugments: summary.craftingAugments,

    remainingGaps: summary.remainingGaps,
    remainingStackingConflicts:
      summary.remainingStackingConflicts,

    swapLog: summary.swapLog,
    advisorNotes: summary.advisorNotes,

    scoreBreakdown: {
      score: summary.scoreBreakdown.score,
      counts: summary.scoreBreakdown.counts,
      topGapPenalties:
        summary.scoreBreakdown.topGapPenalties?.slice(0, 8) || [],
      topConflictPenalties:
        summary.scoreBreakdown.topConflictPenalties?.slice(0, 8) || []
    }
  };
}

module.exports = {
  buildSummary,
  compactSummaryForAI,
  buildTextSummary,

  compactSelectedGearItem,
  compactAugmentAssignment,
  compactCraftingAssignment,
  compactGap,
  compactStackingConflict,

  buildCounts,

  cleanText,
  getItemKey
};