// augmentSlotPlanner.js

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function normalizeColor(value) {
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

function getItemKey(value = {}) {
  return value.itemKey || value.key || value.link || value.name;
}

function getRecommendationStackKey(rec = {}) {
  return (
    rec.parsedBonus?.stackKey ||
    rec.stackKey ||
    rec.targetStackKey ||
    null
  );
}

function getRecommendationValue(rec = {}) {
  const value = Number(
    rec.candidateValue ??
    rec.value ??
    rec.parsedBonus?.value ??
    0
  );

  return Number.isNaN(value) ? 0 : value;
}

function getRecommendationScore(rec = {}) {
  const score = Number(rec.score || 0);

  return Number.isNaN(score) ? 0 : score;
}

function getTargetPriority(rec = {}) {
  const priority = Number(rec.targetPriority || 0);

  return Number.isNaN(priority) ? 0 : priority;
}

function sortRecommendations(a, b) {
  return (
    getRecommendationScore(b) - getRecommendationScore(a) ||
    getTargetPriority(b) - getTargetPriority(a) ||
    getRecommendationValue(b) - getRecommendationValue(a)
  );
}

function getCraftingSlotInstanceKey(rec = {}) {
  return [
    rec.itemKey || rec.itemName || 'unknown_item',
    rec.craftingSlotKey || 'unknown_crafting_slot'
  ].join('::');
}

function normalizeOpenSlot(slot) {
  if (typeof slot === 'string') {
    return {
      color: normalizeColor(slot),
      raw: slot
    };
  }

  return {
    color: normalizeColor(
      slot.color ||
      slot.slotColor ||
      slot.type ||
      slot.name ||
      slot.slotType
    ),
    raw: slot
  };
}

function getItemAugmentSlots(item = {}) {
  const slots = Array.isArray(item.augmentSlots)
    ? item.augmentSlots
    : [];

  return slots
    .map(normalizeOpenSlot)
    .filter(slot => slot.color);
}

function indexOpenNormalSlots(openNormalSlots = []) {
  const countsByBaseKey = new Map();

  return openNormalSlots.map(slot => {
    const itemKey = getItemKey(slot) || slot.itemName || 'unknown_item';
    const color = normalizeColor(slot.color);
    const baseKey = `${itemKey}:${color}`;

    const count = countsByBaseKey.get(baseKey) || 0;
    countsByBaseKey.set(baseKey, count + 1);

    return {
      ...slot,
      itemKey,
      itemName: slot.itemName || 'unknown item',
      color,
      slotId: `${baseKey}:${count}`,
      raw: slot.raw || slot.color || color
    };
  });
}

function compatibleSlotMatchesRecommendation(slot, rec) {
  const compatibleSlots = rec.compatibleSlots || [];

  return compatibleSlots.some(compatible => {
    const compatibleItemKey =
      compatible.itemKey ||
      compatible.key ||
      compatible.itemName;

    const slotItemKey =
      slot.itemKey ||
      slot.key ||
      slot.itemName;

    const sameItem =
      compatibleItemKey === slotItemKey ||
      compatible.itemName === slot.itemName;

    const sameColor =
      normalizeColor(compatible.color) === normalizeColor(slot.color);

    return sameItem && sameColor;
  });
}

function getSlotPreferenceScore(slot, rec) {
  const augmentColor = normalizeColor(rec.color);
  const slotColor = normalizeColor(slot.color);

  let score = 0;

  if (augmentColor === slotColor) {
    score += 30;
  }

  if (augmentColor === 'colorless' && slotColor === 'colorless') {
    score += 20;
  }

  if (
    slotColor === 'green' ||
    slotColor === 'purple' ||
    slotColor === 'orange'
  ) {
    score -= 2;
  }

  return score;
}

function chooseBestNormalSlotForRecommendation(
  rec,
  indexedOpenSlots,
  usedNormalSlotIds
) {
  const compatibleSlots = indexedOpenSlots
    .filter(slot => !usedNormalSlotIds.has(slot.slotId))
    .filter(slot => compatibleSlotMatchesRecommendation(slot, rec))
    .sort((a, b) =>
      getSlotPreferenceScore(b, rec) -
      getSlotPreferenceScore(a, rec)
    );

  return compatibleSlots[0] || null;
}

function shouldSkipRecommendation(rec, state) {
  const targetId = rec.targetId || null;
  const stackKey = getRecommendationStackKey(rec);

  if (targetId && state.filledTargetIds.has(targetId)) {
    return true;
  }

  if (stackKey && state.filledStackKeys.has(stackKey)) {
    return true;
  }

  return false;
}

function markRecommendationUsed(rec, state) {
  const targetId = rec.targetId || null;
  const stackKey = getRecommendationStackKey(rec);

  if (targetId) {
    state.filledTargetIds.add(targetId);
  }

  if (stackKey) {
    state.filledStackKeys.add(stackKey);
  }
}

function buildNormalAugmentAssignment(rec, slot) {
  return {
    sourceType: 'normal_augment',

    itemName: slot.itemName,
    itemKey: slot.itemKey,
    slotColor: slot.color,
    slotId: slot.slotId,

    augmentName: rec.name,
    augmentLink: rec.link || null,
    augmentColor: normalizeColor(rec.color),
    minLevel: rec.minLevel || null,

    effect: rec.effect,
    stackKey: getRecommendationStackKey(rec),
    value: getRecommendationValue(rec),

    targetId: rec.targetId,
    targetLabel: rec.targetLabel,
    currentValue: rec.currentValue,
    minimumValue: rec.minimumValue,
    targetValue: rec.targetValue,

    score: getRecommendationScore(rec)
  };
}

function buildCraftingAugmentAssignment(rec) {
  return {
    sourceType: 'crafting_augment',

    itemName: rec.itemName,
    itemKey: rec.itemKey,

    craftingSlotKey: rec.craftingSlotKey,
    craftingSlotInstanceKey: getCraftingSlotInstanceKey(rec),
    craftingSlotLabel: rec.craftingSlotLabel,

    augmentName: rec.name,
    selectedTier: rec.selectedTier || null,

    effect: rec.effect,
    stackKey: getRecommendationStackKey(rec),
    value: getRecommendationValue(rec),

    targetId: rec.targetId,
    targetLabel: rec.targetLabel,
    currentValue: rec.currentValue,
    minimumValue: rec.minimumValue,
    targetValue: rec.targetValue,

    score: getRecommendationScore(rec)
  };
}

function selectAugmentAssignments({
  augmentGapPlan,
  options = {}
}) {
  const indexedOpenSlots = indexOpenNormalSlots(
    augmentGapPlan.openNormalSlots || []
  );

  const normalRecommendations = [
    ...(augmentGapPlan.normalAugmentRecommendations || [])
  ].sort(sortRecommendations);

  const craftingRecommendations = [
    ...(augmentGapPlan.craftingAugmentRecommendations || [])
  ].sort(sortRecommendations);

  const combinedRecommendations = [
    ...normalRecommendations,
    ...craftingRecommendations
  ].sort(sortRecommendations);

  const state = {
    usedNormalSlotIds: new Set(),
    usedCraftingSlotKeys: new Set(),
    filledTargetIds: new Set(),
    filledStackKeys: new Set()
  };

  const normalAssignments = [];
  const craftingAssignments = [];
  const skippedRecommendations = [];

  const maxNormalAssignments =
    options.maxNormalAssignments || indexedOpenSlots.length;

  const maxCraftingAssignments =
    options.maxCraftingAssignments || 20;

  for (const rec of combinedRecommendations) {
    if (shouldSkipRecommendation(rec, state)) {
      skippedRecommendations.push({
        name: rec.name,
        sourceType: rec.sourceType,
        reason: 'target_or_stack_already_filled',
        targetId: rec.targetId,
        stackKey: getRecommendationStackKey(rec)
      });

      continue;
    }

    if (rec.sourceType === 'normal_augment') {
      if (normalAssignments.length >= maxNormalAssignments) {
        continue;
      }

      const slot = chooseBestNormalSlotForRecommendation(
        rec,
        indexedOpenSlots,
        state.usedNormalSlotIds
      );

      if (!slot) {
        skippedRecommendations.push({
          name: rec.name,
          sourceType: rec.sourceType,
          reason: 'no_compatible_open_slot',
          targetId: rec.targetId,
          stackKey: getRecommendationStackKey(rec)
        });

        continue;
      }

      const assignment = buildNormalAugmentAssignment(rec, slot);

      normalAssignments.push(assignment);
      state.usedNormalSlotIds.add(slot.slotId);
      markRecommendationUsed(rec, state);

      continue;
    }

    if (rec.sourceType === 'crafting_augment') {
      if (craftingAssignments.length >= maxCraftingAssignments) {
        continue;
      }

      if (!rec.craftingSlotKey) {
        skippedRecommendations.push({
          name: rec.name,
          sourceType: rec.sourceType,
          reason: 'missing_crafting_slot_key',
          targetId: rec.targetId,
          stackKey: getRecommendationStackKey(rec)
        });

        continue;
      }

      const craftingSlotInstanceKey = getCraftingSlotInstanceKey(rec);

      if (state.usedCraftingSlotKeys.has(craftingSlotInstanceKey)) {
        skippedRecommendations.push({
          name: rec.name,
          sourceType: rec.sourceType,
          reason: 'crafting_slot_already_used',
          craftingSlotKey: rec.craftingSlotKey,
          craftingSlotInstanceKey,
          targetId: rec.targetId,
          stackKey: getRecommendationStackKey(rec)
        });

        continue;
      }

      const assignment = buildCraftingAugmentAssignment(rec);

      craftingAssignments.push(assignment);
      state.usedCraftingSlotKeys.add(craftingSlotInstanceKey);
      markRecommendationUsed(rec, state);
    }
  }

  const remainingOpenNormalSlots = indexedOpenSlots
    .filter(slot => !state.usedNormalSlotIds.has(slot.slotId));

  return {
    normalAssignments,
    craftingAssignments,
    remainingOpenNormalSlots,
    skippedRecommendations,

    usedNormalSlotIds: Array.from(state.usedNormalSlotIds),
    usedCraftingSlotKeys: Array.from(state.usedCraftingSlotKeys),
    filledTargetIds: Array.from(state.filledTargetIds),
    filledStackKeys: Array.from(state.filledStackKeys)
  };
}

function getOrCreateSelectedAugmentGroup(map, itemName, itemKey) {
  const key = itemKey || itemName;

  if (!map.has(key)) {
    map.set(key, {
      itemName,
      itemKey: key,
      selectedAugments: [],
      openSlots: []
    });
  }

  return map.get(key);
}

function incrementCount(map, color) {
  if (!color) {
    return;
  }

  map.set(color, (map.get(color) || 0) + 1);
}

function decrementCount(map, color) {
  if (!color || !map.has(color)) {
    return false;
  }

  const nextValue = map.get(color) - 1;

  if (nextValue <= 0) {
    map.delete(color);
  } else {
    map.set(color, nextValue);
  }

  return true;
}

function getSelectedAugmentSlotColor(augment = {}) {
  return normalizeColor(
    augment.slotColor ||
    augment.slot ||
    augment.selectedSlotColor ||
    augment.augmentSlotColor
  );
}

function addMissingOpenSlotsFromEquippedItems(
  map,
  equippedItems = []
) {
  for (const item of equippedItems || []) {
    const itemSlots = getItemAugmentSlots(item);

    if (itemSlots.length === 0) {
      continue;
    }

    const itemName = item.name || 'unknown item';
    const itemKey = getItemKey(item) || itemName;

    const group = getOrCreateSelectedAugmentGroup(
      map,
      itemName,
      itemKey
    );

    const remainingSlotCounts = new Map();

    for (const slot of itemSlots) {
      incrementCount(remainingSlotCounts, slot.color);
    }

    for (const augment of group.selectedAugments || []) {
      decrementCount(
        remainingSlotCounts,
        getSelectedAugmentSlotColor(augment)
      );
    }

    for (const openSlot of group.openSlots || []) {
      const normalized = normalizeOpenSlot(openSlot);
      decrementCount(remainingSlotCounts, normalized.color);
    }

    for (const slot of itemSlots) {
      if (!remainingSlotCounts.has(slot.color)) {
        continue;
      }

      group.openSlots.push(
        slot.raw || {
          slotColor: slot.color,
          reason: 'No augment assigned by augmentSlotPlanner.'
        }
      );

      decrementCount(remainingSlotCounts, slot.color);
    }
  }
}

function buildSelectedAugmentsForValidation({
  normalAssignments = [],
  remainingOpenNormalSlots = [],
  selectedAugments = [],
  equippedItems = []
}) {
  // Important:
  // Do not preserve earlier augmentSelection.js selected augments here.
  // The slot planner should be the final source of truth for normal augments.
  const map = new Map();

  for (const assignment of normalAssignments) {
    const group = getOrCreateSelectedAugmentGroup(
      map,
      assignment.itemName,
      assignment.itemKey
    );

    group.selectedAugments.push({
      name: assignment.augmentName,
      link: assignment.augmentLink,
      color: assignment.augmentColor,
      slotColor: assignment.slotColor,
      effect: assignment.effect,
      effectsRaw: [assignment.effect],

      sourceType: 'augment_slot_planner',
      targetId: assignment.targetId,
      targetLabel: assignment.targetLabel,
      stackKey: assignment.stackKey,
      value: assignment.value,
      score: assignment.score
    });
  }

  for (const slot of remainingOpenNormalSlots) {
    const group = getOrCreateSelectedAugmentGroup(
      map,
      slot.itemName,
      slot.itemKey
    );

    group.openSlots.push(slot.raw || slot.color);
  }

  addMissingOpenSlotsFromEquippedItems(
    map,
    equippedItems
  );

  return Array.from(map.values());
}

function compactAssignment(assignment) {
  return {
    sourceType: assignment.sourceType,

    itemName: assignment.itemName,
    itemKey: assignment.itemKey,

    slotColor: assignment.slotColor || null,
    craftingSlotKey: assignment.craftingSlotKey || null,
    craftingSlotInstanceKey:
      assignment.craftingSlotInstanceKey || null,
    craftingSlotLabel: assignment.craftingSlotLabel || null,

    augmentName: assignment.augmentName,
    effect: assignment.effect,

    targetLabel: assignment.targetLabel,
    currentValue: assignment.currentValue,
    minimumValue: assignment.minimumValue,
    targetValue: assignment.targetValue,

    stackKey: assignment.stackKey,
    value: assignment.value,
    score: assignment.score
  };
}

function buildAugmentSlotPlan({
  augmentGapPlan,
  selectedAugments = [],
  equippedItems = [],
  options = {}
}) {
  if (!augmentGapPlan) {
    throw new Error('buildAugmentSlotPlan expected augmentGapPlan.');
  }

  const assignmentResult = selectAugmentAssignments({
    augmentGapPlan,
    options
  });

  const selectedAugmentsForValidation =
    buildSelectedAugmentsForValidation({
      normalAssignments: assignmentResult.normalAssignments,
      remainingOpenNormalSlots:
        assignmentResult.remainingOpenNormalSlots,
      selectedAugments,
      equippedItems
    });

  return {
    counts: {
      normalAssignmentCount:
        assignmentResult.normalAssignments.length,
      craftingAssignmentCount:
        assignmentResult.craftingAssignments.length,
      remainingOpenNormalSlotCount:
        assignmentResult.remainingOpenNormalSlots.length,
      skippedRecommendationCount:
        assignmentResult.skippedRecommendations.length
    },

    normalAssignments: assignmentResult.normalAssignments,
    craftingAssignments: assignmentResult.craftingAssignments,
    remainingOpenNormalSlots:
      assignmentResult.remainingOpenNormalSlots,
    skippedRecommendations:
      assignmentResult.skippedRecommendations,

    selectedAugmentsForValidation,

    filledTargetIds: assignmentResult.filledTargetIds,
    filledStackKeys: assignmentResult.filledStackKeys,
    usedCraftingSlotKeys: assignmentResult.usedCraftingSlotKeys
  };
}

function compactAugmentSlotPlanForAI(plan) {
  return {
    counts: plan.counts,

    normalAssignments:
      plan.normalAssignments.map(compactAssignment),

    craftingAssignments:
      plan.craftingAssignments.map(compactAssignment),

    remainingOpenNormalSlots:
      plan.remainingOpenNormalSlots.map(slot => ({
        itemName: slot.itemName,
        itemKey: slot.itemKey,
        color: slot.color
      })),

    filledTargetIds: plan.filledTargetIds,
    filledStackKeys: plan.filledStackKeys,
    usedCraftingSlotKeys: plan.usedCraftingSlotKeys || []
  };
}

module.exports = {
  buildAugmentSlotPlan,
  compactAugmentSlotPlanForAI,

  selectAugmentAssignments,
  buildSelectedAugmentsForValidation,

  getCraftingSlotInstanceKey,
  getItemAugmentSlots,

  normalizeColor,
  cleanText,
  normalizeText
};