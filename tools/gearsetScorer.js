// gearsetScorer.js

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function numberOrDefault(value, fallback = 0) {
  const number = Number(value);

  return Number.isNaN(number) ? fallback : number;
}

function getTargetFromCoverageEntry(entry = {}) {
  return entry.target || entry;
}

function getTargetPriority(entry = {}) {
  const target = getTargetFromCoverageEntry(entry);

  return numberOrDefault(
    target.priority ??
    entry.priority,
    50
  );
}

function getTargetCategory(entry = {}) {
  const target = getTargetFromCoverageEntry(entry);

  return target.category || entry.category || 'unknown';
}

function getTargetLabel(entry = {}) {
  const target = getTargetFromCoverageEntry(entry);

  return target.label || entry.label || target.id || entry.targetId || 'unknown';
}

function getMissingToTarget(entry = {}) {
  return Math.max(
    0,
    numberOrDefault(
      entry.missingToTarget,
      numberOrDefault(entry.targetValue, 0) -
        numberOrDefault(entry.currentValue, 0)
    )
  );
}

function getMissingToMinimum(entry = {}) {
  return Math.max(
    0,
    numberOrDefault(
      entry.missingToMinimum,
      numberOrDefault(entry.minimumValue, 0) -
        numberOrDefault(entry.currentValue, 0)
    )
  );
}

function getCategoryMultiplier(category) {
  const normalized = normalizeText(category);

  if (normalized === 'primary_stat') {
    return 1.35;
  }

  if (normalized === 'tactical_dc') {
    return 1.45;
  }

  if (normalized === 'survivability') {
    return 1.05;
  }

  if (normalized === 'monk') {
    return 1.15;
  }

  if (normalized === 'melee_damage') {
    return 0.95;
  }

  if (normalized === 'melee_accuracy') {
    return 0.9;
  }

  if (normalized === 'set_bonus') {
    return .55;
  }

  return 1.0;
}

function getStatusMultiplier(status) {
  if (status === 'missing') {
    return 1.35;
  }

  if (status === 'below_minimum') {
    return 1.15;
  }

  if (status === 'below_target') {
    return 0.75;
  }

  return 0;
}

function isIntentionalAugmentUpgrade(conflict = {}) {
  const winningSource = conflict.winningBonus?.source?.type;

  const suppressedBonuses = conflict.suppressedBonuses || [];

  if (
    winningSource !== 'augment' &&
    winningSource !== 'crafting_augment'
  ) {
    return false;
  }

  if (suppressedBonuses.length === 0) {
    return false;
  }

  const allSuppressedAreBaseSources =
    suppressedBonuses.every(bonus => {
      const type = bonus.source?.type;

      return type === 'item' || type === 'set_bonus';
    });

  if (!allSuppressedAreBaseSources) {
    return false;
  }

  const winningValue = numberOrDefault(
    conflict.winningBonus?.value,
    0
  );

  const bestSuppressedValue = Math.max(
    ...suppressedBonuses.map(bonus =>
      numberOrDefault(bonus.value, 0)
    )
  );

  return winningValue >= bestSuppressedValue;
}

function countRelevantConflicts(stackingConflicts = []) {
  let count = 0;

  for (const conflict of stackingConflicts || []) {
    if (isIntentionalAugmentUpgrade(conflict)) {
      continue;
    }

    count += (conflict.suppressedBonuses || []).length;
  }

  return count;
}

function getRelevantConflicts(stackingConflicts = []) {
  return (stackingConflicts || []).filter(conflict =>
    !isIntentionalAugmentUpgrade(conflict)
  );
}

function getTargetStackKeys(target = {}) {
  return [
    target.stackKey,
    ...(target.stackKeys || []),
    ...(target.acceptedStackKeys || []),
    ...(target.alternateStackKeys || [])
  ].filter(Boolean);
}

function getPriorityForStackKey(finalGapPlan, stackKey) {
  if (!stackKey || !finalGapPlan) {
    return 50;
  }

  const targets = finalGapPlan.targets || [];

  const matchingTarget = targets.find(target =>
    getTargetStackKeys(target).includes(stackKey)
  );

  if (matchingTarget) {
    return numberOrDefault(matchingTarget.priority, 50);
  }

  const coverageEntries = [
    ...(finalGapPlan.coverage || []),
    ...(finalGapPlan.openGaps || []),
    ...(finalGapPlan.metTargets || []),
    ...(finalGapPlan.underfilledTargets || []),
    ...(finalGapPlan.missingTargets || [])
  ];

  const matchingCoverage = coverageEntries.find(entry => {
    const target = getTargetFromCoverageEntry(entry);

    return getTargetStackKeys(target).includes(stackKey);
  });

  if (matchingCoverage) {
    return getTargetPriority(matchingCoverage);
  }

  return 50;
}

function calculateWeightedGapPenalty(finalGapPlan, options = {}) {
  const openGaps = finalGapPlan?.openGaps || [];

  const baseGapPenalty =
    options.baseGapPenalty === undefined
      ? 4.5
      : options.baseGapPenalty;

  let totalPenalty = 0;
  const gapDetails = [];

  for (const gap of openGaps) {
    const priority = getTargetPriority(gap);
    const category = getTargetCategory(gap);
    const status = gap.status || 'unknown';

    const missingToTarget = getMissingToTarget(gap);
    const missingToMinimum = getMissingToMinimum(gap);

    const priorityFactor = priority / 10;
    const missingFactor =
      1 +
      missingToTarget * 0.6 +
      missingToMinimum * 0.9;

    const categoryMultiplier =
      getCategoryMultiplier(category);

    const statusMultiplier =
      getStatusMultiplier(status);

    const penalty =
      baseGapPenalty *
      priorityFactor *
      missingFactor *
      categoryMultiplier *
      statusMultiplier;

    totalPenalty += penalty;

    gapDetails.push({
      targetId:
        gap.target?.id ||
        gap.targetId ||
        null,
      label: getTargetLabel(gap),
      category,
      status,
      priority,
      currentValue: gap.currentValue,
      minimumValue: gap.minimumValue,
      targetValue: gap.targetValue,
      missingToMinimum,
      missingToTarget,
      penalty
    });
  }

  return {
    totalPenalty,
    gapDetails: gapDetails.sort((a, b) => b.penalty - a.penalty)
  };
}

function calculateConflictPenalty({
  validationResult,
  finalGapPlan,
  options = {}
}) {
  const conflicts = getRelevantConflicts(
    validationResult?.stackingConflicts || []
  );

  const baseConflictPenalty =
    options.baseConflictPenalty === undefined
      ? 10
      : options.baseConflictPenalty;

  const suppressedBonusPenalty =
    options.suppressedBonusPenalty === undefined
      ? 6
      : options.suppressedBonusPenalty;

  const priorityConflictWeight =
    options.priorityConflictWeight === undefined
      ? 0.22
      : options.priorityConflictWeight;

  let totalPenalty = 0;
  const conflictDetails = [];

  for (const conflict of conflicts) {
    const suppressedCount =
      (conflict.suppressedBonuses || []).length;

    const priority = getPriorityForStackKey(
      finalGapPlan,
      conflict.stackKey
    );

    const penalty =
      baseConflictPenalty +
      suppressedCount * suppressedBonusPenalty +
      priority * priorityConflictWeight;

    totalPenalty += penalty;

    conflictDetails.push({
      stackKey: conflict.stackKey,
      stat: conflict.stat,
      bonusType: conflict.bonusType,
      priority,
      suppressedCount,
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
        })),
      penalty
    });
  }

  return {
    totalPenalty,
    conflictDetails:
      conflictDetails.sort((a, b) => b.penalty - a.penalty)
  };
}

function calculateAssignmentReward(slotPlan, options = {}) {
  const normalAssignmentCount =
    slotPlan?.counts?.normalAssignmentCount || 0;

  const craftingAssignmentCount =
    slotPlan?.counts?.craftingAssignmentCount || 0;

  const normalAssignmentReward =
    options.normalAssignmentReward === undefined
      ? 5
      : options.normalAssignmentReward;

  const craftingAssignmentReward =
    options.craftingAssignmentReward === undefined
      ? 35
      : options.craftingAssignmentReward;

  const reward =
    normalAssignmentCount * normalAssignmentReward +
    craftingAssignmentCount * craftingAssignmentReward;

  return {
    reward,
    normalAssignmentCount,
    craftingAssignmentCount
  };
}

function calculateTargetReward(finalGapPlan, options = {}) {
  const metTargetCount =
    finalGapPlan?.counts?.metTargetCount || 0;

  const metTargetReward =
    options.metTargetReward === undefined
      ? 120
      : options.metTargetReward;

  const metTargets = finalGapPlan?.metTargets || [];

  const highPriorityMetReward =
    metTargets.reduce((sum, entry) => {
      const priority = getTargetPriority(entry);

      return sum + priority * 0.25;
    }, 0);

  return {
    reward:
      metTargetCount * metTargetReward +
      highPriorityMetReward,

    metTargetCount,
    highPriorityMetReward
  };
}

function scoreGearsetDetailed(evaluation, options = {}) {
  const finalGapPlan = evaluation.finalGapPlan;
  const validationResult = evaluation.validationResult;
  const slotPlan = evaluation.slotPlan;

  const targetReward =
    calculateTargetReward(finalGapPlan, options);

  const weightedGapPenalty =
    calculateWeightedGapPenalty(finalGapPlan, options);

  const conflictPenalty =
    calculateConflictPenalty({
      validationResult,
      finalGapPlan,
      options
    });

  const assignmentReward =
    calculateAssignmentReward(slotPlan, options);

  const errorCount =
    validationResult?.errors?.length || 0;

  const warningCount =
    validationResult?.warnings?.length || 0;

  const errorPenalty =
    errorCount *
    (
      options.errorPenalty === undefined
        ? 10000
        : options.errorPenalty
    );

  const warningPenalty =
    warningCount *
    (
      options.warningPenalty === undefined
        ? 0
        : options.warningPenalty
    );

  const openNormalSlotCount =
    finalGapPlan?.counts?.openNormalSlotCount || 0;

  const openNormalSlotPenalty =
    openNormalSlotCount *
    (
      options.openNormalSlotPenalty === undefined
        ? 0
        : options.openNormalSlotPenalty
    );

  const score =
    targetReward.reward +
    assignmentReward.reward -
    weightedGapPenalty.totalPenalty -
    conflictPenalty.totalPenalty -
    errorPenalty -
    warningPenalty -
    openNormalSlotPenalty;

  return {
    score,

    targetReward,
    assignmentReward,

    weightedGapPenalty:
      weightedGapPenalty.totalPenalty,

    conflictPenalty:
      conflictPenalty.totalPenalty,

    errorPenalty,
    warningPenalty,
    openNormalSlotPenalty,

    counts: {
      metTargetCount:
        finalGapPlan?.counts?.metTargetCount || 0,
      openGapCount:
        finalGapPlan?.counts?.openGapCount || 0,
      underfilledTargetCount:
        finalGapPlan?.counts?.underfilledTargetCount || 0,
      missingTargetCount:
        finalGapPlan?.counts?.missingTargetCount || 0,
      normalAssignmentCount:
        slotPlan?.counts?.normalAssignmentCount || 0,
      craftingAssignmentCount:
        slotPlan?.counts?.craftingAssignmentCount || 0,
      stackingConflictCount:
        validationResult?.stackingConflicts?.length || 0,
      relevantConflictCount:
        countRelevantConflicts(
          validationResult?.stackingConflicts || []
        ),
      errorCount,
      warningCount,
      openNormalSlotCount
    },

    topGapPenalties:
      weightedGapPenalty.gapDetails.slice(0, 15),

    topConflictPenalties:
      conflictPenalty.conflictDetails.slice(0, 15)
  };
}

function scoreGearset(evaluation, options = {}) {
  return scoreGearsetDetailed(evaluation, options).score;
}

function compactScoreBreakdown(scoreBreakdown) {
  return {
    score: scoreBreakdown.score,

    counts: scoreBreakdown.counts,

    targetReward:
      scoreBreakdown.targetReward.reward,

    assignmentReward:
      scoreBreakdown.assignmentReward.reward,

    weightedGapPenalty:
      scoreBreakdown.weightedGapPenalty,

    conflictPenalty:
      scoreBreakdown.conflictPenalty,

    errorPenalty:
      scoreBreakdown.errorPenalty,

    warningPenalty:
      scoreBreakdown.warningPenalty,

    openNormalSlotPenalty:
      scoreBreakdown.openNormalSlotPenalty,

    topGapPenalties:
      scoreBreakdown.topGapPenalties,

    topConflictPenalties:
      scoreBreakdown.topConflictPenalties
  };
}

module.exports = {
  scoreGearset,
  scoreGearsetDetailed,
  compactScoreBreakdown,

  calculateWeightedGapPenalty,
  calculateConflictPenalty,
  calculateAssignmentReward,
  calculateTargetReward,

  countRelevantConflicts,
  getRelevantConflicts,
  isIntentionalAugmentUpgrade,

  cleanText,
  normalizeText
};