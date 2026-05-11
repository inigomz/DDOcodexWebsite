// craftingAugmentPlan.js

const {
  searchCraftingAugments,
  compactCraftingAugmentForAI
} = require('./craftingAugmentSearch');

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function getCraftingSlotKey(slot = {}) {
  return [
    slot.system || '',
    slot.slotType || '',
    slot.itemGroup || ''
  ].join(':');
}

function getCraftingSlotLabel(slot = {}) {
  return `${slot.system} ${slot.slotType} ${slot.itemGroup}`;
}

function getRecipeSlot(recipe = {}) {
  return {
    system: recipe.system,
    slotType: recipe.slotType,
    itemGroup: recipe.itemGroup
  };
}

function getUniqueCraftingSlots(craftingAugments = []) {
  const seen = new Set();
  const slots = [];

  for (const recipe of craftingAugments || []) {
    if (recipe.itemType !== 'crafting_augment') {
      continue;
    }

    if (!recipe.system || !recipe.slotType || !recipe.itemGroup) {
      continue;
    }

    const slot = getRecipeSlot(recipe);
    const key = getCraftingSlotKey(slot);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    slots.push(slot);
  }

  return slots;
}

function matchesAllowedValues(value, allowedValues) {
  if (!allowedValues || allowedValues.length === 0) {
    return true;
  }

  return allowedValues.some(allowed =>
    normalizeText(allowed) === normalizeText(value)
  );
}

function filterCraftingSlots(slots, options = {}) {
  return slots.filter(slot => {
    if (!matchesAllowedValues(slot.system, options.systems)) {
      return false;
    }

    if (!matchesAllowedValues(slot.slotType, options.slotTypes)) {
      return false;
    }

    if (!matchesAllowedValues(slot.itemGroup, options.itemGroups)) {
      return false;
    }

    return true;
  });
}

function getCandidateStackKey(candidate) {
  if (
    candidate.parsedSelectedEffect &&
    candidate.parsedSelectedEffect.parsed &&
    candidate.parsedSelectedEffect.stackKey
  ) {
    return candidate.parsedSelectedEffect.stackKey;
  }

  return `Special:${candidate.name}`;
}

function getCandidateStat(candidate) {
  if (
    candidate.parsedSelectedEffect &&
    candidate.parsedSelectedEffect.parsed &&
    candidate.parsedSelectedEffect.stat
  ) {
    return candidate.parsedSelectedEffect.stat;
  }

  return 'Special Effect';
}

function getCandidateValue(candidate) {
  if (
    candidate.parsedSelectedEffect &&
    candidate.parsedSelectedEffect.parsed &&
    candidate.parsedSelectedEffect.value !== null &&
    candidate.parsedSelectedEffect.value !== undefined
  ) {
    return candidate.parsedSelectedEffect.value;
  }

  return null;
}

function summarizeCandidate(candidate) {
  return {
    name: candidate.name,
    link: candidate.link,

    selectedTier: candidate.selectedTier,
    selectedEffectRaw: candidate.selectedEffectRaw,

    stackKey: getCandidateStackKey(candidate),
    stat: getCandidateStat(candidate),
    value: getCandidateValue(candidate),

    searchScore: candidate.searchScore
  };
}

function summarizeCraftingSlotCandidates(candidates = []) {
  const seenStackKeys = new Set();
  const stackFamilies = [];

  for (const candidate of candidates) {
    const stackKey = getCandidateStackKey(candidate);

    if (seenStackKeys.has(stackKey)) {
      continue;
    }

    seenStackKeys.add(stackKey);

    stackFamilies.push({
      stackKey,
      stat: getCandidateStat(candidate),
      value: getCandidateValue(candidate),
      bestCandidate: candidate.name,
      bestEffect: candidate.selectedEffectRaw,
      bestScore: candidate.searchScore,
      selectedTier: candidate.selectedTier
    });
  }

  return stackFamilies;
}

function buildCraftingSlotPlan({
  craftingAugments,
  slot,
  buildProfile = {},
  limitPerSlot = 5,
  minimumScore = 1
}) {
  const candidates = searchCraftingAugments(
    craftingAugments,
    {
      system: slot.system,
      slotType: slot.slotType,
      itemGroup: slot.itemGroup,
      buildProfile,
      limit: limitPerSlot,
      minimumScore
    }
  );

  const compactCandidates = candidates.map(compactCraftingAugmentForAI);
  const bestCandidate = candidates[0] || null;

  return {
    key: getCraftingSlotKey(slot),
    label: getCraftingSlotLabel(slot),

    system: slot.system,
    slotType: slot.slotType,
    itemGroup: slot.itemGroup,

    bestScore: bestCandidate
      ? bestCandidate.searchScore
      : 0,

    bestCandidate: bestCandidate
      ? summarizeCandidate(bestCandidate)
      : null,

    stackFamilies: summarizeCraftingSlotCandidates(candidates),

    candidates,
    compactCandidates
  };
}

function collectDesiredCraftingStackKeys(slotPlans = []) {
  const seen = new Set();
  const desired = [];

  for (const slotPlan of slotPlans) {
    for (const family of slotPlan.stackFamilies || []) {
      if (seen.has(family.stackKey)) {
        continue;
      }

      seen.add(family.stackKey);

      desired.push({
        stackKey: family.stackKey,
        stat: family.stat,
        value: family.value,
        bestCandidate: family.bestCandidate,
        bestEffect: family.bestEffect,
        bestScore: family.bestScore,
        sourceSlotKey: slotPlan.key,
        sourceSlotLabel: slotPlan.label
      });
    }
  }

  return desired.sort((a, b) => b.bestScore - a.bestScore);
}

function buildCraftingAugmentPlan({
  craftingAugments,
  buildProfile = {},
  systems = ['Lamordia'],
  slotTypes = [],
  itemGroups = [],
  limitPerSlot = 5,
  minimumScore = 1
}) {
  if (!Array.isArray(craftingAugments)) {
    throw new Error('buildCraftingAugmentPlan expected craftingAugments to be an array.');
  }

  const allSlots = getUniqueCraftingSlots(craftingAugments);

  const filteredSlots = filterCraftingSlots(
    allSlots,
    {
      systems,
      slotTypes,
      itemGroups
    }
  );

  const slotPlans = filteredSlots
    .map(slot =>
      buildCraftingSlotPlan({
        craftingAugments,
        slot,
        buildProfile,
        limitPerSlot,
        minimumScore
      })
    )
    .filter(plan =>
      plan.candidates.length > 0
    )
    .sort((a, b) => b.bestScore - a.bestScore);

  const desiredCraftingStackKeys =
    collectDesiredCraftingStackKeys(slotPlans);

  const usefulCraftingSlots = slotPlans.map(plan => ({
    key: plan.key,
    label: plan.label,

    system: plan.system,
    slotType: plan.slotType,
    itemGroup: plan.itemGroup,

    bestScore: plan.bestScore,
    bestCandidate: plan.bestCandidate,

    stackFamilies: plan.stackFamilies
  }));

  const slotPlanByKey = new Map();

  for (const plan of slotPlans) {
    slotPlanByKey.set(plan.key, plan);
  }

  return {
    buildMaxLevel: buildProfile.maxLevel || null,

    usefulCraftingSlots,
    desiredCraftingStackKeys,

    slotPlans,

    slotPlanByKey
  };
}

function getCraftingSlotPotentialScore(
  craftingSlot,
  craftingAugmentPlan
) {
  const key = getCraftingSlotKey(craftingSlot);
  const plan = craftingAugmentPlan.slotPlanByKey.get(key);

  if (!plan) {
    return 0;
  }

  return plan.bestScore || 0;
}

function getCraftingSlotPotential(
  craftingSlot,
  craftingAugmentPlan
) {
  const key = getCraftingSlotKey(craftingSlot);
  const plan = craftingAugmentPlan.slotPlanByKey.get(key);

  if (!plan) {
    return null;
  }

  return {
    key: plan.key,
    label: plan.label,
    bestScore: plan.bestScore,
    bestCandidate: plan.bestCandidate,
    stackFamilies: plan.stackFamilies
  };
}

function getItemCraftingPotential(
  item,
  craftingAugmentPlan
) {
  const craftingSlots = item.craftingSlots || [];

  const slotPotentials = craftingSlots
    .map(slot =>
      getCraftingSlotPotential(slot, craftingAugmentPlan)
    )
    .filter(Boolean);

  const totalPotentialScore = slotPotentials.reduce(
    (total, slot) => total + Number(slot.bestScore || 0),
    0
  );

  return {
    itemName: item.name,
    itemKey: item.itemKey || item.link || item.name,

    totalPotentialScore,
    slotPotentials
  };
}

function getBestCraftingPlanForItem(
  item,
  craftingAugmentPlan
) {
  const itemPotential = getItemCraftingPotential(
    item,
    craftingAugmentPlan
  );

  const sortedSlotPotentials = [...itemPotential.slotPotentials]
    .sort((a, b) => b.bestScore - a.bestScore);

  return {
    ...itemPotential,
    bestSlotPotential: sortedSlotPotentials[0] || null
  };
}

function compactCraftingAugmentPlanForAI(plan) {
  return {
    buildMaxLevel: plan.buildMaxLevel,

    usefulCraftingSlots: plan.usefulCraftingSlots.map(slot => ({
      key: slot.key,
      label: slot.label,
      system: slot.system,
      slotType: slot.slotType,
      itemGroup: slot.itemGroup,
      bestScore: slot.bestScore,
      bestCandidate: slot.bestCandidate,
      stackFamilies: slot.stackFamilies.map(family => ({
        stackKey: family.stackKey,
        stat: family.stat,
        value: family.value,
        bestCandidate: family.bestCandidate,
        bestEffect: family.bestEffect,
        bestScore: family.bestScore,
        selectedTier: family.selectedTier
      }))
    })),

    desiredCraftingStackKeys:
      plan.desiredCraftingStackKeys.map(entry => ({
        stackKey: entry.stackKey,
        stat: entry.stat,
        value: entry.value,
        bestCandidate: entry.bestCandidate,
        bestEffect: entry.bestEffect,
        bestScore: entry.bestScore,
        sourceSlotLabel: entry.sourceSlotLabel
      }))
  };
}

module.exports = {
  buildCraftingAugmentPlan,
  buildCraftingSlotPlan,

  getUniqueCraftingSlots,
  getCraftingSlotKey,
  getCraftingSlotLabel,

  getCraftingSlotPotentialScore,
  getCraftingSlotPotential,
  getItemCraftingPotential,
  getBestCraftingPlanForItem,

  compactCraftingAugmentPlanForAI
};