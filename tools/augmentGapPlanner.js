// augmentGapPlanner.js

const {
  parseBonusEffect
} = require('./bonusParser');

const {
  getResolvedItemEffects
} = require('./selectableEffects');

const {
  buildBonusTargets,
  bonusMatchesTarget
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

function getSourceLabel(source = {}) {
  if (source.type === 'item') {
    return source.name || 'unknown item';
  }

  if (source.type === 'normal_augment') {
    return `${source.name || 'unknown augment'} slotted into ${source.itemName || 'unknown item'}`;
  }

  if (source.type === 'normal_augment_candidate') {
    return source.name || 'unknown augment';
  }

  if (source.type === 'crafting_augment') {
    return `${source.name || 'unknown crafting augment'} planned for ${source.itemName || 'unknown item'}`;
  }

  return source.name || 'unknown source';
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

function getItemEffects(item, buildProfile = {}) {
  try {
    const resolved = getResolvedItemEffects(item, buildProfile);

    if (Array.isArray(resolved) && resolved.length > 0) {
      return resolved.map(cleanText).filter(Boolean);
    }
  } catch (error) {
    // Fall back to raw fields below.
  }

  return [
    ...normalizeEffectsInput(item.effects),
    ...normalizeEffectsInput(item.effectsRaw),
    ...normalizeEffectsInput(item.enhancements),
    ...normalizeEffectsInput(item.namedEffects),
    ...normalizeEffectsInput(item.itemEffects),
    ...normalizeEffectsInput(item.effectRaw)
  ]
    .map(cleanText)
    .filter(Boolean);
}

function isSetRequirementLine(effect) {
  const cleaned = cleanText(effect);
  const text = normalizeText(cleaned);

  return (
    text.includes('pieces equipped') ||
    /^\d+\s+pieces?\s+equipped/i.test(cleaned)
  );
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
    sourceLabel: getSourceLabel(source)
  };
}

function parseBonusFromKnownAssignment(assignment = {}, source) {
  const stackKey = assignment.stackKey;
  const value = Number(assignment.value);

  if (!stackKey || Number.isNaN(value)) {
    return null;
  }

  const [bonusType, ...statParts] = stackKey.split(':');
  const stat = statParts.join(':') || assignment.targetLabel || 'Unknown';

  return {
    raw: assignment.effect,
    parsed: true,
    parser: 'known_assignment_bonus',
    bonusType,
    bonusTypeInferred: false,
    stat,
    value,
    valueText: String(value),
    isPercent: String(assignment.effect || '').includes('%'),
    family: stat,
    stackKey,
    source,
    sourceLabel: getSourceLabel(source)
  };
}

function parseEquippedItemBonuses(
  equippedItems = [],
  buildProfile = {}
) {
  const bonuses = [];

  for (const item of equippedItems || []) {
    const effects = getItemEffects(item, buildProfile)
      .filter(effect => !isSetRequirementLine(effect));

    for (const effect of effects) {
      const parsed = parseBonusWithSource(
        effect,
        {
          type: 'item',
          name: item.name,
          itemKey: getItemKey(item)
        }
      );

      if (parsed) {
        bonuses.push(parsed);
      }
    }
  }

  return bonuses;
}

function getAugmentName(augment = {}) {
  return (
    augment.name ||
    augment.augmentName ||
    augment.itemName ||
    augment.label ||
    'unknown augment'
  );
}

function getAugmentLink(augment = {}) {
  return augment.link || augment.url || null;
}

function getAugmentEffects(augment = {}) {
  const possibleFields = [
    augment.effect,
    augment.effectRaw,
    augment.augmentEffect,
    augment.selectedEffectRaw,
    augment.description,
    augment.raw,

    // Actual augment parser fields.
    augment.effects,
    augment.effectsRaw,
    augment.enhancements,
    augment.bonuses,
    augment.bonus
  ];

  const effects = [];

  for (const field of possibleFields) {
    if (Array.isArray(field)) {
      effects.push(...field);
    } else if (field) {
      effects.push(field);
    }
  }

  return unique(
    effects
      .map(cleanText)
      .filter(Boolean)
  );
}

function getAugmentMinLevel(augment = {}) {
  const value = Number(
    augment.minLevel ||
    augment.minimumLevel ||
    augment.level ||
    augment.ml ||
    0
  );

  if (Number.isNaN(value)) {
    return 0;
  }

  return value;
}

function parseSelectedNormalAugmentBonuses(
  selectedAugments = []
) {
  const bonuses = [];

  for (const itemAugmentResult of selectedAugments || []) {
    const itemName =
      itemAugmentResult.itemName ||
      itemAugmentResult.name ||
      itemAugmentResult.item?.name ||
      'unknown item';

    const itemKey =
      itemAugmentResult.itemKey ||
      itemAugmentResult.item?.itemKey ||
      itemAugmentResult.item?.link ||
      itemName;

    for (const augment of itemAugmentResult.selectedAugments || []) {
      const augmentName = getAugmentName(augment);
      const effects = getAugmentEffects(augment);

      for (const effect of effects) {
        const parsed = parseBonusWithSource(
          effect,
          {
            type: 'normal_augment',
            name: augmentName,
            itemName,
            itemKey,
            slotColor:
              augment.slotColor ||
              augment.color ||
              augment.slot ||
              null
          }
        );

        if (parsed) {
          bonuses.push(parsed);
        }
      }
    }
  }

  return bonuses;
}

function parseCraftingAssignmentBonuses(
  craftingAssignments = []
) {
  const bonuses = [];

  for (const assignment of craftingAssignments || []) {
    const source = {
      type: 'crafting_augment',
      name: assignment.augmentName || assignment.name,
      itemName: assignment.itemName,
      itemKey: assignment.itemKey,
      craftingSlotKey: assignment.craftingSlotKey,
      craftingSlotInstanceKey: assignment.craftingSlotInstanceKey
    };

    const effect = assignment.effect;

    let parsed = effect
      ? parseBonusWithSource(effect, source)
      : null;

    // Fallback is important because crafting assignments already have
    // canonical stackKey/value from the crafting planner. Use those if
    // raw text parsing fails or parses less reliably.
    if (!parsed) {
      parsed = parseBonusFromKnownAssignment(
        assignment,
        source
      );
    }

    if (parsed) {
      bonuses.push(parsed);
    }
  }

  return bonuses;
}

function getExistingBonuses({
  equippedItems = [],
  selectedAugments = [],
  craftingAssignments = [],
  buildProfile = {}
}) {
  return [
    ...parseEquippedItemBonuses(equippedItems, buildProfile),
    ...parseSelectedNormalAugmentBonuses(selectedAugments),
    ...parseCraftingAssignmentBonuses(craftingAssignments)
  ];
}

function getBestBonusForTarget(target, bonuses = []) {
  const matchingBonuses = bonuses.filter(bonus =>
    bonusMatchesTarget(bonus, target)
  );

  if (matchingBonuses.length === 0) {
    return null;
  }

  return matchingBonuses
    .slice()
    .sort((a, b) =>
      Number(b.value || 0) - Number(a.value || 0)
    )[0];
}

function evaluateTargetCoverage(target, bonuses = []) {
  const bestBonus = getBestBonusForTarget(target, bonuses);

  const targetValue = Number(target.targetValue || 0);
  const minimumValue = Number(target.minimumValue || targetValue || 0);

  if (!bestBonus) {
    return {
      target,
      status: 'missing',
      bestBonus: null,
      currentValue: 0,
      targetValue,
      minimumValue,
      missingToMinimum: minimumValue,
      missingToTarget: targetValue,
      sourceLabel: null
    };
  }

  const currentValue = Number(bestBonus.value || 0);

  let status = 'meets_target';

  if (currentValue < minimumValue) {
    status = 'below_minimum';
  } else if (currentValue < targetValue) {
    status = 'below_target';
  }

  return {
    target,
    status,
    bestBonus,
    currentValue,
    targetValue,
    minimumValue,
    missingToMinimum: Math.max(0, minimumValue - currentValue),
    missingToTarget: Math.max(0, targetValue - currentValue),
    sourceLabel: bestBonus.sourceLabel
  };
}

function evaluateAllTargets(targets = [], bonuses = []) {
  return targets.map(target =>
    evaluateTargetCoverage(target, bonuses)
  );
}

function getCoverageGroups(coverage = []) {
  return {
    metTargets: coverage.filter(entry =>
      entry.status === 'meets_target'
    ),

    underfilledTargets: coverage.filter(entry =>
      entry.status === 'below_minimum' ||
      entry.status === 'below_target'
    ),

    missingTargets: coverage.filter(entry =>
      entry.status === 'missing'
    ),

    openGaps: coverage.filter(entry =>
      entry.status !== 'meets_target'
    )
  };
}

function getTargetPriorityScore(target) {
  return Number(target.priority || 0);
}

function candidateImprovesTarget(candidateBonus, coverageEntry) {
  if (!candidateBonus || !coverageEntry) {
    return false;
  }

  const target = coverageEntry.target;

  if (!bonusMatchesTarget(candidateBonus, target)) {
    return false;
  }

  const candidateValue = Number(candidateBonus.value || 0);
  const currentValue = Number(coverageEntry.currentValue || 0);

  return candidateValue > currentValue;
}

function scoreCandidateForCoverage(candidateBonus, coverageEntry) {
  if (!candidateImprovesTarget(candidateBonus, coverageEntry)) {
    return -1000;
  }

  const target = coverageEntry.target;
  const candidateValue = Number(candidateBonus.value || 0);
  const currentValue = Number(coverageEntry.currentValue || 0);
  const targetValue = Number(target.targetValue || 0);
  const minimumValue = Number(target.minimumValue || targetValue || 0);

  const improvement = Math.max(0, candidateValue - currentValue);
  const missingToTarget = Math.max(1, targetValue - currentValue);
  const fillRatio = Math.min(1, improvement / missingToTarget);

  let score =
    getTargetPriorityScore(target) +
    fillRatio * 40 +
    improvement * 2;

  if (candidateValue >= minimumValue && currentValue < minimumValue) {
    score += 25;
  }

  if (candidateValue >= targetValue) {
    score += 15;
  }

  if (coverageEntry.status === 'missing') {
    score += 20;
  }

  return score;
}

function inferAugmentColorFromName(name) {
  const text = normalizeText(name);

  if (text.includes('sapphire')) {
    return 'blue';
  }

  if (text.includes('ruby')) {
    return 'red';
  }

  if (text.includes('topaz')) {
    return 'yellow';
  }

  if (text.includes('diamond')) {
    return 'colorless';
  }

  if (text.includes('emerald')) {
    return 'green';
  }

  if (text.includes('amethyst')) {
    return 'purple';
  }

  return null;
}

function normalizeAugmentColor(value) {
  const text = normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');

  if (!text) {
    return null;
  }

  if (text.includes('colorless')) {
    return 'colorless';
  }

  if (text.includes('blue')) {
    return 'blue';
  }

  if (text.includes('red')) {
    return 'red';
  }

  if (text.includes('yellow')) {
    return 'yellow';
  }

  if (text.includes('green')) {
    return 'green';
  }

  if (text.includes('purple')) {
    return 'purple';
  }

  if (text.includes('orange')) {
    return 'orange';
  }

  return text;
}

function getAugmentColor(augment = {}) {
  return normalizeAugmentColor(
    augment.color ||
    augment.slotColor ||
    augment.augmentColor ||
    augment.type ||
    augment.slotType
  ) || inferAugmentColorFromName(getAugmentName(augment));
}

function normalizeOpenSlot(slot) {
  if (typeof slot === 'string') {
    return {
      color: normalizeAugmentColor(slot),
      raw: slot
    };
  }

  return {
    color: normalizeAugmentColor(
      slot.color ||
      slot.slotColor ||
      slot.type ||
      slot.name ||
      slot.slotType
    ),
    raw: slot
  };
}

function augmentFitsSlot(augmentColor, slotColor) {
  const augment = normalizeAugmentColor(augmentColor);
  const slot = normalizeAugmentColor(slotColor);

  if (!augment || !slot) {
    return false;
  }

  if (augment === slot) {
    return true;
  }

  // Colorless augments are allowed as flexible filler in this planner.
  if (augment === 'colorless') {
    return true;
  }

  if (slot === 'green') {
    return augment === 'blue' || augment === 'yellow';
  }

  if (slot === 'purple') {
    return augment === 'red' || augment === 'blue';
  }

  if (slot === 'orange') {
    return augment === 'red' || augment === 'yellow';
  }

  return false;
}

function getOpenNormalAugmentSlotsFromSelection(
  selectedAugments = []
) {
  const slots = [];

  for (const itemAugmentResult of selectedAugments || []) {
    const itemName =
      itemAugmentResult.itemName ||
      itemAugmentResult.name ||
      itemAugmentResult.item?.name ||
      'unknown item';

    const itemKey =
      itemAugmentResult.itemKey ||
      itemAugmentResult.item?.itemKey ||
      itemAugmentResult.item?.link ||
      itemName;

    for (const slot of itemAugmentResult.openSlots || []) {
      const normalized = normalizeOpenSlot(slot);

      if (!normalized.color) {
        continue;
      }

      slots.push({
        itemName,
        itemKey,
        color: normalized.color,
        raw: slot
      });
    }
  }

  return slots;
}

function getOpenNormalAugmentSlotsFromItems(
  equippedItems = []
) {
  const slots = [];

  for (const item of equippedItems || []) {
    const itemName = item.name || 'unknown item';
    const itemKey = getItemKey(item);

    const augmentSlots = Array.isArray(item.augmentSlots)
      ? item.augmentSlots
      : [];

    for (const slot of augmentSlots) {
      const normalized = normalizeOpenSlot(slot);

      if (!normalized.color) {
        continue;
      }

      slots.push({
        itemName,
        itemKey,
        color: normalized.color,
        raw: slot
      });
    }
  }

  return slots;
}

function getOpenNormalAugmentSlots({
  equippedItems = [],
  selectedAugments = []
}) {
  const fromSelection =
    getOpenNormalAugmentSlotsFromSelection(selectedAugments);

  if (fromSelection.length > 0) {
    return fromSelection;
  }

  return getOpenNormalAugmentSlotsFromItems(equippedItems);
}

function parseNormalAugmentCandidate(augment) {
  const effects = getAugmentEffects(augment);
  const parsedBonuses = [];

  for (const effect of effects) {
    const parsed = parseBonusWithSource(
      effect,
      {
        type: 'normal_augment_candidate',
        name: getAugmentName(augment),
        link: getAugmentLink(augment)
      }
    );

    if (parsed) {
      parsedBonuses.push({
        effect,
        parsedBonus: parsed
      });
    }
  }

  if (parsedBonuses.length === 0) {
    return null;
  }

  return {
    augment,
    name: getAugmentName(augment),
    link: getAugmentLink(augment),
    color: getAugmentColor(augment),
    minLevel: getAugmentMinLevel(augment),
    parsedBonuses
  };
}

function getNormalAugmentRecommendations({
  normalAugments = [],
  openNormalSlots = [],
  coverage = [],
  buildProfile = {},
  limit = 20
}) {
  const openGaps = coverage.filter(entry =>
    entry.status !== 'meets_target'
  );

  const maxLevel = Number(buildProfile.maxLevel || 34);
  const recommendations = [];

  for (const augment of normalAugments || []) {
    if (
      augment.itemType &&
      normalizeText(augment.itemType) !== 'augment'
    ) {
      continue;
    }

    const augmentLevel = getAugmentMinLevel(augment);

    if (augmentLevel > maxLevel) {
      continue;
    }

    const candidate = parseNormalAugmentCandidate(augment);

    if (!candidate || !candidate.color) {
      continue;
    }

    const compatibleSlots = openNormalSlots.filter(slot =>
      augmentFitsSlot(candidate.color, slot.color)
    );

    if (compatibleSlots.length === 0) {
      continue;
    }

    for (const parsedEntry of candidate.parsedBonuses) {
      for (const gap of openGaps) {
        const score = scoreCandidateForCoverage(
          parsedEntry.parsedBonus,
          gap
        );

        if (score <= 0) {
          continue;
        }

        recommendations.push({
          sourceType: 'normal_augment',
          name: candidate.name,
          link: candidate.link,
          color: candidate.color,
          minLevel: candidate.minLevel,
          effect: parsedEntry.effect,
          parsedBonus: parsedEntry.parsedBonus,

          targetId: gap.target.id,
          targetLabel: gap.target.label,
          targetStackKey: gap.target.stackKey,
          targetPriority: gap.target.priority,

          currentValue: gap.currentValue,
          candidateValue: parsedEntry.parsedBonus.value,
          targetValue: gap.targetValue,
          minimumValue: gap.minimumValue,

          score,

          compatibleSlots: compatibleSlots.map(slot => ({
            itemName: slot.itemName,
            itemKey: slot.itemKey,
            color: slot.color
          }))
        });
      }
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getCraftingSlotPlansForItem(
  item,
  craftingAugmentPlan
) {
  const craftingSlots = Array.isArray(item.craftingSlots)
    ? item.craftingSlots
    : [];

  const plans = [];

  for (const slot of craftingSlots) {
    const key = getCraftingSlotKey(slot);

    let plan = null;

    if (
      craftingAugmentPlan?.slotPlanByKey &&
      typeof craftingAugmentPlan.slotPlanByKey.get === 'function'
    ) {
      plan = craftingAugmentPlan.slotPlanByKey.get(key);
    }

    if (!plan && Array.isArray(craftingAugmentPlan?.usefulCraftingSlots)) {
      plan = craftingAugmentPlan.usefulCraftingSlots.find(entry =>
        entry.key === key
      );
    }

    if (!plan) {
      continue;
    }

    plans.push({
      item,
      itemName: item.name,
      itemKey: getItemKey(item),
      slot,
      key,
      plan
    });
  }

  return plans;
}

function parseCraftingFamilyAsBonus(family, itemPlan) {
  if (!family || !family.stackKey) {
    return null;
  }

  const value = Number(family.value);

  if (Number.isNaN(value)) {
    return null;
  }

  return {
    raw: family.bestEffect,
    parsed: true,
    parser: 'crafting_family_summary',
    bonusType: family.stackKey.split(':')[0],
    stat: family.stat,
    value,
    valueText: String(value),
    isPercent: String(family.bestEffect || '').includes('%'),
    family: family.stat,
    stackKey: family.stackKey,
    source: {
      type: 'crafting_augment',
      name: family.bestCandidate,
      itemName: itemPlan.itemName,
      itemKey: itemPlan.itemKey,
      craftingSlotKey: itemPlan.key
    },
    sourceLabel: `${family.bestCandidate} planned for ${itemPlan.itemName}`
  };
}

function getCraftingAugmentRecommendations({
  equippedItems = [],
  craftingAugmentPlan = null,
  coverage = [],
  limit = 20
}) {
  if (!craftingAugmentPlan) {
    return [];
  }

  const openGaps = coverage.filter(entry =>
    entry.status !== 'meets_target'
  );

  const recommendations = [];

  for (const item of equippedItems || []) {
    const itemPlans = getCraftingSlotPlansForItem(
      item,
      craftingAugmentPlan
    );

    for (const itemPlan of itemPlans) {
      const families = itemPlan.plan.stackFamilies || [];

      for (const family of families) {
        const candidateBonus = parseCraftingFamilyAsBonus(
          family,
          itemPlan
        );

        if (!candidateBonus) {
          continue;
        }

        for (const gap of openGaps) {
          const score = scoreCandidateForCoverage(
            candidateBonus,
            gap
          );

          if (score <= 0) {
            continue;
          }

          recommendations.push({
            sourceType: 'crafting_augment',
            name: family.bestCandidate,
            effect: family.bestEffect,
            selectedTier: family.selectedTier,
            stackKey: family.stackKey,
            parsedBonus: candidateBonus,

            itemName: itemPlan.itemName,
            itemKey: itemPlan.itemKey,
            craftingSlotKey: itemPlan.key,
            craftingSlotLabel: itemPlan.plan.label,

            targetId: gap.target.id,
            targetLabel: gap.target.label,
            targetStackKey: gap.target.stackKey,
            targetPriority: gap.target.priority,

            currentValue: gap.currentValue,
            candidateValue: candidateBonus.value,
            targetValue: gap.targetValue,
            minimumValue: gap.minimumValue,

            score
          });
        }
      }
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function compactCoverageEntry(entry) {
  return {
    targetId: entry.target.id,
    label: entry.target.label,
    category: entry.target.category,
    priority: entry.target.priority,
    status: entry.status,
    currentValue: entry.currentValue,
    minimumValue: entry.minimumValue,
    targetValue: entry.targetValue,
    missingToMinimum: entry.missingToMinimum,
    missingToTarget: entry.missingToTarget,
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

function compactRecommendation(rec) {
  return {
    sourceType: rec.sourceType,
    name: rec.name,
    link: rec.link || null,
    effect: rec.effect,
    stackKey: rec.parsedBonus?.stackKey || rec.stackKey,
    value: rec.candidateValue,
    score: rec.score,

    targetId: rec.targetId,
    targetLabel: rec.targetLabel,
    currentValue: rec.currentValue,
    minimumValue: rec.minimumValue,
    targetValue: rec.targetValue,

    itemName: rec.itemName || null,
    craftingSlotLabel: rec.craftingSlotLabel || null,
    compatibleSlots: rec.compatibleSlots || []
  };
}

function buildAugmentGapPlan({
  equippedItems = [],
  selectedAugments = [],
  craftingAssignments = [],
  normalAugments = [],
  craftingAugmentPlan = null,
  buildProfile = {},
  options = {}
}) {
  const targets = buildBonusTargets(buildProfile);

  const existingBonuses = getExistingBonuses({
    equippedItems,
    selectedAugments,
    craftingAssignments,
    buildProfile
  });

  const coverage = evaluateAllTargets(
    targets,
    existingBonuses
  );

  const groups = getCoverageGroups(coverage);

  const openNormalSlots = getOpenNormalAugmentSlots({
    equippedItems,
    selectedAugments
  });

  const normalAugmentRecommendations =
    getNormalAugmentRecommendations({
      normalAugments,
      openNormalSlots,
      coverage,
      buildProfile,
      limit: options.normalAugmentRecommendationLimit || 25
    });

  const craftingAugmentRecommendations =
    getCraftingAugmentRecommendations({
      equippedItems,
      craftingAugmentPlan,
      coverage,
      limit: options.craftingAugmentRecommendationLimit || 25
    });

  const allRecommendations = [
    ...normalAugmentRecommendations,
    ...craftingAugmentRecommendations
  ].sort((a, b) => b.score - a.score);

  return {
    counts: {
      targetCount: targets.length,
      metTargetCount: groups.metTargets.length,
      underfilledTargetCount: groups.underfilledTargets.length,
      missingTargetCount: groups.missingTargets.length,
      openGapCount: groups.openGaps.length,
      openNormalSlotCount: openNormalSlots.length,
      normalAugmentRecommendationCount:
        normalAugmentRecommendations.length,
      craftingAugmentRecommendationCount:
        craftingAugmentRecommendations.length
    },

    targets,
    existingBonuses,

    coverage,
    metTargets: groups.metTargets,
    underfilledTargets: groups.underfilledTargets,
    missingTargets: groups.missingTargets,
    openGaps: groups.openGaps,

    openNormalSlots,

    normalAugmentRecommendations,
    craftingAugmentRecommendations,
    allRecommendations
  };
}

function compactAugmentGapPlanForAI(plan, options = {}) {
  const gapLimit = options.gapLimit || 20;
  const recommendationLimit = options.recommendationLimit || 20;

  return {
    counts: plan.counts,

    highestPriorityOpenGaps:
      plan.openGaps
        .slice()
        .sort((a, b) => b.target.priority - a.target.priority)
        .slice(0, gapLimit)
        .map(compactCoverageEntry),

    underfilledTargets:
      plan.underfilledTargets
        .slice()
        .sort((a, b) => b.target.priority - a.target.priority)
        .slice(0, gapLimit)
        .map(compactCoverageEntry),

    missingTargets:
      plan.missingTargets
        .slice()
        .sort((a, b) => b.target.priority - a.target.priority)
        .slice(0, gapLimit)
        .map(compactCoverageEntry),

    openNormalSlots: plan.openNormalSlots,

    bestRecommendations:
      plan.allRecommendations
        .slice(0, recommendationLimit)
        .map(compactRecommendation),

    normalAugmentRecommendations:
      plan.normalAugmentRecommendations
        .slice(0, recommendationLimit)
        .map(compactRecommendation),

    craftingAugmentRecommendations:
      plan.craftingAugmentRecommendations
        .slice(0, recommendationLimit)
        .map(compactRecommendation)
  };
}

module.exports = {
  buildAugmentGapPlan,
  compactAugmentGapPlanForAI,

  parseEquippedItemBonuses,
  parseSelectedNormalAugmentBonuses,
  parseCraftingAssignmentBonuses,
  getExistingBonuses,

  evaluateTargetCoverage,
  evaluateAllTargets,
  getCoverageGroups,

  getOpenNormalAugmentSlots,
  getNormalAugmentRecommendations,
  getCraftingAugmentRecommendations,

  getAugmentEffects,
  getAugmentMinLevel,
  augmentFitsSlot,
  getAugmentColor,
  normalizeAugmentColor,

  cleanText,
  normalizeText
};