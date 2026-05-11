// gearSetBuilder.js

const {
  parseBonusEffect
} = require('./bonusParser');

const {
  getResolvedItemEffects
} = require('./selectableEffects');

const {
  buildBonusTargets,
  findTargetForStackKey
} = require('./bonusTargets');

const {
  getCraftingSlotKey
} = require('./craftingAugmentPlan');

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function getItemKey(item = {}) {
  return item.itemKey || item.key || item.link || item.name;
}

function normalizeEffectsInput(effects) {
  if (!effects) {
    return [];
  }

  if (Array.isArray(effects)) {
    return effects;
  }

  return [effects];
}

function getBaseItemScore(item = {}) {
  const score = Number(
    item.dynamicScore ??
    item.searchScore ??
    item.score ??
    item.totalScore ??
    item.relevanceScore ??
    0
  );

  return Number.isNaN(score) ? 0 : score;
}

function isSetRequirementLine(effect) {
  const cleaned = cleanText(effect);
  const text = normalizeText(cleaned);

  return (
    text.includes('pieces equipped') ||
    /^\d+\s+pieces?\s+equipped/i.test(cleaned)
  );
}

function getItemEffects(item = {}, buildProfile = {}) {
  try {
    const resolved = getResolvedItemEffects(item, buildProfile);

    if (Array.isArray(resolved) && resolved.length > 0) {
      return unique(
        resolved
          .map(cleanText)
          .filter(Boolean)
      );
    }
  } catch (error) {
    // Fall back to raw item fields below.
  }

  return unique([
    ...normalizeEffectsInput(item.effects),
    ...normalizeEffectsInput(item.effectsRaw),
    ...normalizeEffectsInput(item.enhancements),
    ...normalizeEffectsInput(item.namedEffects),
    ...normalizeEffectsInput(item.itemEffects),
    ...normalizeEffectsInput(item.effectRaw)
  ]
    .map(cleanText)
    .filter(Boolean));
}

function parseBonusWithSource(rawEffect, source) {
  const parsed = parseBonusEffect(rawEffect);

  if (
    !parsed ||
    !parsed.parsed ||
    !parsed.stackKey ||
    parsed.value === null ||
    parsed.value === undefined
  ) {
    return null;
  }

  return {
    ...parsed,
    source,
    sourceLabel: source.name || 'unknown item'
  };
}

function parseItemBonuses(item = {}, buildProfile = {}) {
  const effects = getItemEffects(item, buildProfile)
    .filter(effect => !isSetRequirementLine(effect));

  const bonuses = [];

  for (const effect of effects) {
    const parsed = parseBonusWithSource(
      effect,
      {
        type: 'item',
        name: item.name,
        itemKey: getItemKey(item),
        slot: item.slot
      }
    );

    if (parsed) {
      bonuses.push(parsed);
    }
  }

  return bonuses;
}

function getBonusValue(bonus = {}) {
  const value = Number(bonus.value || 0);

  return Number.isNaN(value) ? 0 : value;
}

function getTargetForBonus(bonus, targets = []) {
  if (!bonus || !bonus.stackKey) {
    return null;
  }

  return findTargetForStackKey(bonus.stackKey, targets);
}

function getTargetPriorityForBonus(bonus, targets = []) {
  const target = getTargetForBonus(bonus, targets);

  if (!target) {
    return 10;
  }

  return Number(target.priority || 10);
}

function getTargetIdForBonus(bonus, targets = []) {
  const target = getTargetForBonus(bonus, targets);

  return target ? target.id : null;
}

function createSelectionState() {
  return {
    bestByStackKey: new Map(),
    bestByTargetId: new Map(),
    selectedItemKeys: new Set()
  };
}

function cloneSelectionState(state) {
  return {
    bestByStackKey: new Map(state.bestByStackKey),
    bestByTargetId: new Map(state.bestByTargetId),
    selectedItemKeys: new Set(state.selectedItemKeys)
  };
}

function addBonusToState(bonus, state, targets = []) {
  if (!bonus || !bonus.stackKey) {
    return;
  }

  const currentStackBest = state.bestByStackKey.get(bonus.stackKey);

  if (
    !currentStackBest ||
    getBonusValue(bonus) > getBonusValue(currentStackBest)
  ) {
    state.bestByStackKey.set(bonus.stackKey, bonus);
  }

  const targetId = getTargetIdForBonus(bonus, targets);

  if (!targetId) {
    return;
  }

  const currentTargetBest = state.bestByTargetId.get(targetId);

  if (
    !currentTargetBest ||
    getBonusValue(bonus) > getBonusValue(currentTargetBest)
  ) {
    state.bestByTargetId.set(targetId, bonus);
  }
}

function addItemToState(item, bonuses, state, targets = []) {
  state.selectedItemKeys.add(getItemKey(item));

  for (const bonus of bonuses || []) {
    addBonusToState(bonus, state, targets);
  }
}

function classifyBonusAgainstState(bonus, state, targets = []) {
  const value = getBonusValue(bonus);
  const currentStackBest = state.bestByStackKey.get(bonus.stackKey);
  const targetId = getTargetIdForBonus(bonus, targets);
  const currentTargetBest = targetId
    ? state.bestByTargetId.get(targetId)
    : null;

  if (!currentStackBest) {
    if (!currentTargetBest) {
      return {
        type: 'new',
        bonus
      };
    }

    const currentTargetValue = getBonusValue(currentTargetBest);

    if (value > currentTargetValue) {
      return {
        type: 'target_upgrade',
        bonus,
        replaced: currentTargetBest
      };
    }

    if (value === currentTargetValue) {
      return {
        type: 'target_duplicate',
        bonus,
        existing: currentTargetBest
      };
    }

    return {
      type: 'target_suppressed',
      bonus,
      existing: currentTargetBest
    };
  }

  const currentStackValue = getBonusValue(currentStackBest);

  if (value > currentStackValue) {
    return {
      type: 'upgrade',
      bonus,
      replaced: currentStackBest
    };
  }

  if (value === currentStackValue) {
    return {
      type: 'duplicate',
      bonus,
      existing: currentStackBest
    };
  }

  return {
    type: 'suppressed',
    bonus,
    existing: currentStackBest
  };
}

function getDefaultOptions(options = {}) {
  return {
    candidateLimitPerGroup: options.candidateLimitPerGroup || 50,

    baseScoreWeight:
      options.baseScoreWeight === undefined
        ? 0.18
        : options.baseScoreWeight,

    newBonusPriorityWeight:
      options.newBonusPriorityWeight === undefined
        ? 1.35
        : options.newBonusPriorityWeight,

    upgradePriorityWeight:
      options.upgradePriorityWeight === undefined
        ? 0.95
        : options.upgradePriorityWeight,

    valueWeight:
      options.valueWeight === undefined
        ? 0.35
        : options.valueWeight,

    upgradeValueWeight:
      options.upgradeValueWeight === undefined
        ? 1.8
        : options.upgradeValueWeight,

    // These are intentionally moderate.
    // Too much duplicate punishment caused the builder to abandon
    // Lamordia-compatible gear and made the final augmented build worse.
    duplicatePenalty:
      options.duplicatePenalty === undefined
        ? 45
        : options.duplicatePenalty,

    suppressedPenalty:
      options.suppressedPenalty === undefined
        ? 65
        : options.suppressedPenalty,

    targetDuplicatePenalty:
      options.targetDuplicatePenalty === undefined
        ? 20
        : options.targetDuplicatePenalty,

    targetSuppressedPenalty:
      options.targetSuppressedPenalty === undefined
        ? 35
        : options.targetSuppressedPenalty,

    duplicatePriorityPenaltyWeight:
      options.duplicatePriorityPenaltyWeight === undefined
        ? 0.75
        : options.duplicatePriorityPenaltyWeight,

    suppressedPriorityPenaltyWeight:
      options.suppressedPriorityPenaltyWeight === undefined
        ? 0.85
        : options.suppressedPriorityPenaltyWeight,

    // Lamordia crafting is very important for this planner.
    // It should influence gear choice strongly enough to keep useful
    // crafting-slot items in the candidate pool.
    craftingPotentialWeight:
      options.craftingPotentialWeight === undefined
        ? 0.65
        : options.craftingPotentialWeight,

    maxCraftingFamiliesPerSlot:
      options.maxCraftingFamiliesPerSlot || 8,

    sameItemPenalty:
      options.sameItemPenalty === undefined
        ? 10000
        : options.sameItemPenalty
  };
}

function scoreClassification(classification, targets, options) {
  const bonus = classification.bonus;
  const priority = getTargetPriorityForBonus(bonus, targets);
  const value = getBonusValue(bonus);

  if (classification.type === 'new') {
    return (
      priority * options.newBonusPriorityWeight +
      value * options.valueWeight
    );
  }

  if (classification.type === 'upgrade') {
    const replacedValue = getBonusValue(classification.replaced);
    const improvement = Math.max(0, value - replacedValue);

    return (
      priority * options.upgradePriorityWeight +
      improvement * options.upgradeValueWeight
    );
  }

  if (classification.type === 'target_upgrade') {
    const replacedValue = getBonusValue(classification.replaced);
    const improvement = Math.max(0, value - replacedValue);

    return (
      priority * 0.55 +
      improvement * options.upgradeValueWeight
    );
  }

  if (classification.type === 'duplicate') {
    return -(
      options.duplicatePenalty +
      priority * options.duplicatePriorityPenaltyWeight
    );
  }

  if (classification.type === 'suppressed') {
    return -(
      options.suppressedPenalty +
      priority * options.suppressedPriorityPenaltyWeight
    );
  }

  if (classification.type === 'target_duplicate') {
    return -(
      options.targetDuplicatePenalty +
      priority * 0.35
    );
  }

  if (classification.type === 'target_suppressed') {
    return -(
      options.targetSuppressedPenalty +
      priority * 0.45
    );
  }

  return 0;
}

function getCraftingPlanForSlotKey(craftingAugmentPlan, slotKey) {
  if (!craftingAugmentPlan || !slotKey) {
    return null;
  }

  if (
    craftingAugmentPlan.slotPlanByKey &&
    typeof craftingAugmentPlan.slotPlanByKey.get === 'function'
  ) {
    const found = craftingAugmentPlan.slotPlanByKey.get(slotKey);

    if (found) {
      return found;
    }
  }

  if (Array.isArray(craftingAugmentPlan.usefulCraftingSlots)) {
    return craftingAugmentPlan.usefulCraftingSlots.find(entry =>
      entry.key === slotKey
    ) || null;
  }

  return null;
}

function getCraftingSlotPlansForItem(item = {}, craftingAugmentPlan) {
  const craftingSlots = Array.isArray(item.craftingSlots)
    ? item.craftingSlots
    : [];

  const plans = [];

  for (const slot of craftingSlots) {
    const key = getCraftingSlotKey(slot);
    const plan = getCraftingPlanForSlotKey(
      craftingAugmentPlan,
      key
    );

    if (!plan) {
      continue;
    }

    plans.push({
      key,
      slot,
      plan
    });
  }

  return plans;
}

function familyToPseudoBonus(family = {}, source = {}) {
  if (!family.stackKey) {
    return null;
  }

  const value = Number(
    family.value ??
    family.bestCandidate?.value ??
    0
  );

  return {
    raw:
      family.bestEffect ||
      family.bestCandidate?.selectedEffectRaw ||
      family.bestCandidate?.effectRaw ||
      family.bestCandidate?.name ||
      family.bestCandidate ||
      family.stackKey,

    parsed: true,
    parser: 'crafting_family_potential',

    bonusType: String(family.stackKey).split(':')[0],
    stat:
      family.stat ||
      String(family.stackKey).split(':').slice(1).join(':') ||
      'Unknown',

    value: Number.isNaN(value) ? 0 : value,
    valueText: String(Number.isNaN(value) ? 0 : value),
    isPercent: String(family.bestEffect || '').includes('%'),
    family: family.stat || 'Unknown',
    stackKey: family.stackKey,

    source,
    sourceLabel: source.name || 'crafting potential'
  };
}

function scoreCraftingPotential({
  item,
  craftingAugmentPlan,
  state,
  targets,
  options
}) {
  const plans = getCraftingSlotPlansForItem(
    item,
    craftingAugmentPlan
  );

  const craftingSlotPotentials = [];
  let totalScore = 0;

  for (const entry of plans) {
    const families = Array.isArray(entry.plan.stackFamilies)
      ? entry.plan.stackFamilies
      : [];

    const familyScores = [];

    for (const family of families.slice(0, options.maxCraftingFamiliesPerSlot)) {
      const pseudoBonus = familyToPseudoBonus(
        family,
        {
          type: 'crafting_potential',
          name: family.bestCandidate || entry.plan.bestCandidate?.name,
          itemName: item.name,
          itemKey: getItemKey(item),
          craftingSlotKey: entry.key
        }
      );

      if (!pseudoBonus) {
        continue;
      }

      const classification = classifyBonusAgainstState(
        pseudoBonus,
        state,
        targets
      );

      let score = scoreClassification(
        classification,
        targets,
        options
      );

      // Crafting is potential during gear selection, so it should not
      // completely override real item effects. However, it must be strong
      // enough to keep Lamordia-compatible gear alive.
      score *= options.craftingPotentialWeight;

      if (score <= 0) {
        continue;
      }

      familyScores.push({
        stackKey: pseudoBonus.stackKey,
        raw: pseudoBonus.raw,
        value: pseudoBonus.value,
        classification: classification.type,
        score
      });
    }

    const bestFamilyScore = familyScores
      .slice()
      .sort((a, b) => b.score - a.score)[0];

    if (!bestFamilyScore) {
      continue;
    }

    totalScore += bestFamilyScore.score;

    craftingSlotPotentials.push({
      key: entry.key,
      label: entry.plan.label,
      bestScore: entry.plan.bestScore,
      scoreContribution: bestFamilyScore.score,
      bestCandidate: entry.plan.bestCandidate || null,
      bestUsefulFamily: bestFamilyScore
    });
  }

  return {
    score: totalScore,
    craftingSlotPotentials
  };
}

function evaluateCandidate({
  item,
  state,
  targets,
  buildProfile,
  craftingAugmentPlan,
  options = {}
}) {
  const resolvedOptions = getDefaultOptions(options);

  const bonuses = parseItemBonuses(item, buildProfile);
  const effects = getItemEffects(item, buildProfile);

  const analysis = {
    newBonuses: [],
    upgradedBonuses: [],
    duplicateBonuses: [],
    suppressedBonuses: [],
    targetUpgradedBonuses: [],
    targetDuplicateBonuses: [],
    targetSuppressedBonuses: []
  };

  let score =
    getBaseItemScore(item) * resolvedOptions.baseScoreWeight;

  if (state.selectedItemKeys.has(getItemKey(item))) {
    score -= resolvedOptions.sameItemPenalty;
  }

  for (const bonus of bonuses) {
    const classification = classifyBonusAgainstState(
      bonus,
      state,
      targets
    );

    score += scoreClassification(
      classification,
      targets,
      resolvedOptions
    );

    if (classification.type === 'new') {
      analysis.newBonuses.push(bonus);
    } else if (classification.type === 'upgrade') {
      analysis.upgradedBonuses.push({
        ...bonus,
        replaced: classification.replaced?.raw || null
      });
    } else if (classification.type === 'duplicate') {
      analysis.duplicateBonuses.push(bonus);
    } else if (classification.type === 'suppressed') {
      analysis.suppressedBonuses.push(bonus);
    } else if (classification.type === 'target_upgrade') {
      analysis.targetUpgradedBonuses.push({
        ...bonus,
        replaced: classification.replaced?.raw || null
      });
    } else if (classification.type === 'target_duplicate') {
      analysis.targetDuplicateBonuses.push(bonus);
    } else if (classification.type === 'target_suppressed') {
      analysis.targetSuppressedBonuses.push(bonus);
    }
  }

  const craftingPotential = scoreCraftingPotential({
    item,
    craftingAugmentPlan,
    state,
    targets,
    options: resolvedOptions
  });

  score += craftingPotential.score;

  return {
    item,
    itemKey: getItemKey(item),
    itemName: item.name,
    slot: item.slot,

    score,
    dynamicScore: score,
    baseScore: getBaseItemScore(item),

    effects,
    bonuses,

    newBonuses: analysis.newBonuses,
    upgradedBonuses: analysis.upgradedBonuses,
    duplicateBonuses: analysis.duplicateBonuses,
    suppressedBonuses: analysis.suppressedBonuses,

    targetUpgradedBonuses: analysis.targetUpgradedBonuses,
    targetDuplicateBonuses: analysis.targetDuplicateBonuses,
    targetSuppressedBonuses: analysis.targetSuppressedBonuses,

    craftingPotentialScore: craftingPotential.score,
    craftingSlotPotentials:
      craftingPotential.craftingSlotPotentials
  };
}

function getGroupCandidates(group = {}, options = {}) {
  const candidateLimit =
    options.candidateLimitPerGroup ||
    getDefaultOptions(options).candidateLimitPerGroup;

  const candidates =
    group.fullCandidates ||
    group.candidates ||
    group.items ||
    [];

  return candidates.slice(0, candidateLimit);
}

function pickBestCandidateForGroup({
  group,
  state,
  targets,
  buildProfile,
  craftingAugmentPlan,
  options
}) {
  const candidates = getGroupCandidates(group, options);

  const evaluatedCandidates = candidates
    .map(item =>
      evaluateCandidate({
        item,
        state,
        targets,
        buildProfile,
        craftingAugmentPlan,
        options
      })
    )
    .sort((a, b) => b.score - a.score);

  return {
    group,
    best: evaluatedCandidates[0] || null,
    evaluatedCandidates
  };
}

function buildCoveredBonusList(state) {
  return Array.from(state.bestByStackKey.values())
    .sort((a, b) =>
      String(a.stackKey).localeCompare(String(b.stackKey))
    );
}

function buildStackAwareGearset({
  gearGroups = [],
  buildProfile = {},
  craftingAugmentPlan = null,
  options = {}
}) {
  const targets = buildBonusTargets(buildProfile);
  const state = createSelectionState();

  const remainingGroups = gearGroups.slice();
  const selectionLog = [];
  const selectedByGroupLabel = new Map();

  while (remainingGroups.length > 0) {
    const groupChoices = remainingGroups
      .map(group =>
        pickBestCandidateForGroup({
          group,
          state,
          targets,
          buildProfile,
          craftingAugmentPlan,
          options
        })
      )
      .filter(choice => choice.best);

    if (groupChoices.length === 0) {
      break;
    }

    groupChoices.sort((a, b) => b.best.score - a.best.score);

    const chosen = groupChoices[0];
    const chosenIndex = remainingGroups.indexOf(chosen.group);

    if (chosenIndex >= 0) {
      remainingGroups.splice(chosenIndex, 1);
    }

    const selectedItem = {
      ...chosen.best.item,
      dynamicScore: chosen.best.dynamicScore,
      stackAwareScore: chosen.best.score,
      stackAnalysis: {
        newBonuses: chosen.best.newBonuses,
        upgradedBonuses: chosen.best.upgradedBonuses,
        duplicateBonuses: chosen.best.duplicateBonuses,
        suppressedBonuses: chosen.best.suppressedBonuses,
        targetUpgradedBonuses: chosen.best.targetUpgradedBonuses,
        targetDuplicateBonuses: chosen.best.targetDuplicateBonuses,
        targetSuppressedBonuses: chosen.best.targetSuppressedBonuses
      },
      craftingPotentialScore: chosen.best.craftingPotentialScore,
      craftingSlotPotentials: chosen.best.craftingSlotPotentials
    };

    selectedByGroupLabel.set(chosen.group.label, {
      groupLabel: chosen.group.label,
      selectedItem,
      evaluation: chosen.best,
      backupItems: chosen.evaluatedCandidates
        .slice(1, Math.max(2, chosen.group.requestedLimit || 2))
        .map(entry => ({
          ...entry.item,
          dynamicScore: entry.dynamicScore,
          stackAwareScore: entry.score,
          stackAnalysis: {
            newBonuses: entry.newBonuses,
            upgradedBonuses: entry.upgradedBonuses,
            duplicateBonuses: entry.duplicateBonuses,
            suppressedBonuses: entry.suppressedBonuses,
            targetUpgradedBonuses: entry.targetUpgradedBonuses,
            targetDuplicateBonuses: entry.targetDuplicateBonuses,
            targetSuppressedBonuses: entry.targetSuppressedBonuses
          },
          craftingPotentialScore: entry.craftingPotentialScore,
          craftingSlotPotentials: entry.craftingSlotPotentials
        }))
    });

    selectionLog.push({
      groupLabel: chosen.group.label,
      itemName: selectedItem.name,
      itemKey: getItemKey(selectedItem),
      score: chosen.best.score,
      baseScore: chosen.best.baseScore,
      newBonuses: chosen.best.newBonuses,
      upgradedBonuses: chosen.best.upgradedBonuses,
      duplicateBonuses: chosen.best.duplicateBonuses,
      suppressedBonuses: chosen.best.suppressedBonuses,
      targetDuplicateBonuses: chosen.best.targetDuplicateBonuses,
      targetSuppressedBonuses: chosen.best.targetSuppressedBonuses,
      craftingPotentialScore: chosen.best.craftingPotentialScore
    });

    addItemToState(
      selectedItem,
      chosen.best.bonuses,
      state,
      targets
    );
  }

  const slotSelections = gearGroups
    .map(group => selectedByGroupLabel.get(group.label))
    .filter(Boolean);

  const selectedItems = slotSelections
    .map(selection => selection.selectedItem);

  return {
    selectedItems,
    slotSelections,
    selectionLog,

    coveredBonuses: buildCoveredBonusList(state),
    coveredStackKeys: Array.from(state.bestByStackKey.keys()),
    coveredTargetIds: Array.from(state.bestByTargetId.keys())
  };
}

module.exports = {
  buildStackAwareGearset,

  evaluateCandidate,
  pickBestCandidateForGroup,

  parseItemBonuses,
  getItemEffects,

  createSelectionState,
  addItemToState,

  cleanText,
  normalizeText
};