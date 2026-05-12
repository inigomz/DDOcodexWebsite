// swapOptimizer.js

const {
  buildAugmentGapPlan
} = require('./augmentGapPlanner');

const {
  buildAugmentSlotPlan
} = require('./augmentSlotPlanner');

const {
  validateGearset
} = require('./gearsetValidator');

const {
  scoreGearset,
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

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function getItemKey(item = {}) {
  return item.itemKey || item.key || item.link || item.name;
}

/**
 * Evaluates a candidate gearset by running the full final pipeline:
 * gap plan -> slot plan -> validation -> final gap plan.
 */
function evaluateGearset({
  candidateEquippedItems,
  normalAugments,
  craftingAugmentPlan,
  buildProfile
}) {
  const gapPlan = buildAugmentGapPlan({
    equippedItems: candidateEquippedItems,
    selectedAugments: [],
    craftingAssignments: [],
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  const slotPlan = buildAugmentSlotPlan({
    augmentGapPlan: gapPlan,
    selectedAugments: [],
    equippedItems: candidateEquippedItems
  });

  const validationResult = validateGearset({
    equippedItems: candidateEquippedItems,
    selectedAugments: slotPlan.selectedAugmentsForValidation,
    craftingAssignments: slotPlan.craftingAssignments,
    buildProfile
  });

  const finalGapPlan = buildAugmentGapPlan({
    equippedItems: candidateEquippedItems,
    selectedAugments: slotPlan.selectedAugmentsForValidation,
    craftingAssignments: slotPlan.craftingAssignments,
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  return {
    equippedItems: candidateEquippedItems,
    gapPlan,
    slotPlan,
    validationResult,
    finalGapPlan
  };
}

/**
 * Checks whether validation has hard errors.
 */
function hasHardErrors(validationResult) {
  return Array.isArray(validationResult.errors) &&
    validationResult.errors.length > 0;
}

/**
 * Builds candidate equipped items by replacing exactly one selected item.
 */
function buildCandidateEquippedItems({
  selectedItems = [],
  currentItem,
  backupItem
}) {
  let replaced = false;

  const candidateEquippedItems = selectedItems.map(item => {
    const sameSlot =
      item.slot === currentItem.slot;

    const sameItem =
      getItemKey(item) === getItemKey(currentItem);

    if (!replaced && sameSlot && sameItem) {
      replaced = true;
      return backupItem;
    }

    return item;
  });

  return {
    candidateEquippedItems,
    replaced
  };
}

/**
 * Tries swapping a single slot to a backup candidate.
 * Returns the best swap found, or null if no improvement exists.
 */
function findBestSingleSlotSwap({
  currentGearset,
  normalAugments,
  craftingAugmentPlan,
  buildProfile,
  scoringOptions = {}
}) {
  const currentEvaluation = evaluateGearset({
    candidateEquippedItems: currentGearset.selectedItems,
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  const currentScoreBreakdown = scoreGearsetDetailed(
    currentEvaluation,
    scoringOptions
  );

  const currentScore = currentScoreBreakdown.score;

  let bestSwap = null;
  let bestScore = currentScore;
  let bestScoreBreakdown = currentScoreBreakdown;

  for (const slotSelection of currentGearset.slotSelections || []) {
    const currentItem = slotSelection.selectedItem;
    const backupItems = slotSelection.backupItems || [];

    if (!currentItem || backupItems.length === 0) {
      continue;
    }

    for (const backupItem of backupItems) {
      const {
        candidateEquippedItems,
        replaced
      } = buildCandidateEquippedItems({
        selectedItems: currentGearset.selectedItems,
        currentItem,
        backupItem
      });

      if (!replaced) {
        continue;
      }

      const candidateEvaluation = evaluateGearset({
        candidateEquippedItems,
        normalAugments,
        craftingAugmentPlan,
        buildProfile
      });

      if (hasHardErrors(candidateEvaluation.validationResult)) {
        continue;
      }

      const candidateScoreBreakdown = scoreGearsetDetailed(
        candidateEvaluation,
        scoringOptions
      );

      const candidateScore = candidateScoreBreakdown.score;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestScoreBreakdown = candidateScoreBreakdown;

        bestSwap = {
          slotLabel: slotSelection.groupLabel,
          oldItem: currentItem,
          newItem: backupItem,

          oldScore: currentScore,
          newScore: candidateScore,
          improvement: candidateScore - currentScore,

          oldScoreBreakdown:
            compactScoreBreakdown(currentScoreBreakdown),
          newScoreBreakdown:
            compactScoreBreakdown(candidateScoreBreakdown),

          evaluation: candidateEvaluation
        };
      }
    }
  }

  if (!bestSwap) {
    return null;
  }

  return {
    ...bestSwap,
    bestScoreBreakdown:
      compactScoreBreakdown(bestScoreBreakdown)
  };
}

/**
 * Applies a chosen swap to the current gearset.
 */
function applySwap(currentGearset, swap) {
  const oldItemKey = getItemKey(swap.oldItem);
  const newItem = swap.newItem;

  let replaced = false;

  const newSelectedItems = currentGearset.selectedItems.map(item => {
    const sameSlot =
      item.slot === swap.oldItem.slot;

    const sameItem =
      getItemKey(item) === oldItemKey;

    if (!replaced && sameSlot && sameItem) {
      replaced = true;
      return newItem;
    }

    return item;
  });

  const newSlotSelections = currentGearset.slotSelections.map(
    slotSelection => {
      if (slotSelection.groupLabel !== swap.slotLabel) {
        return slotSelection;
      }

      const newBackupItems = [
        swap.oldItem,
        ...(slotSelection.backupItems || [])
          .filter(item =>
            getItemKey(item) !== getItemKey(newItem)
          )
      ];

      return {
        ...slotSelection,
        selectedItem: newItem,
        backupItems: newBackupItems
      };
    }
  );

  return {
    ...currentGearset,
    selectedItems: newSelectedItems,
    slotSelections: newSlotSelections
  };
}

/**
 * Runs the swap optimizer.
 *
 * It repeatedly finds the best single-slot swap and applies it only
 * if the full final build score improves.
 */
function runSwapOptimizer({
  initialGearset,
  normalAugments,
  craftingAugmentPlan,
  buildProfile,
  options = {}
}) {
  const maxPasses = options.maxPasses || 4;
  const scoringOptions = options.scoringOptions || {};

  let currentGearset = initialGearset;
  const swapLog = [];

  for (let pass = 1; pass <= maxPasses; pass++) {
    const bestSwap = findBestSingleSlotSwap({
      currentGearset,
      normalAugments,
      craftingAugmentPlan,
      buildProfile,
      scoringOptions
    });

    if (!bestSwap) {
      break;
    }

    currentGearset = applySwap(currentGearset, bestSwap);

    swapLog.push({
      pass,
      slotLabel: bestSwap.slotLabel,
      oldItemName: bestSwap.oldItem.name,
      newItemName: bestSwap.newItem.name,

      oldScore: bestSwap.oldScore,
      newScore: bestSwap.newScore,
      improvement: bestSwap.improvement,

      oldScoreBreakdown: bestSwap.oldScoreBreakdown,
      newScoreBreakdown: bestSwap.newScoreBreakdown
    });
  }

  const finalEvaluation = evaluateGearset({
    candidateEquippedItems: currentGearset.selectedItems,
    normalAugments,
    craftingAugmentPlan,
    buildProfile
  });

  const finalScoreBreakdown = scoreGearsetDetailed(
    finalEvaluation,
    scoringOptions
  );

  return {
    optimizedGearset: currentGearset,
    swapLog,
    finalEvaluation,
    finalScoreBreakdown:
      compactScoreBreakdown(finalScoreBreakdown),
    swapCount: swapLog.length
  };
}

module.exports = {
  runSwapOptimizer,
  evaluateGearset,

  // Re-exported from gearsetScorer so existing tests can keep importing
  // scoreGearset and countRelevantConflicts from swapOptimizer.js.
  scoreGearset,
  scoreGearsetDetailed,
  compactScoreBreakdown,
  countRelevantConflicts,

  findBestSingleSlotSwap,
  applySwap,

  buildCandidateEquippedItems,
  hasHardErrors,

  cleanText,
  normalizeText
};