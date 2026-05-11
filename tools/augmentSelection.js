// augmentSelection.js

const {
  parseBonusEffect
} = require('./bonusParser');

const {
  getResolvedItemEffects
} = require('./selectableEffects');

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function textBlobFromAugment(augment) {
  return [
    augment.name,
    augment.augmentColor,
    augment.effect,
    ...(augment.effects || []),
    ...(augment.effectsRaw || [])
  ]
    .join(' ')
    .toLowerCase();
}

function textBlobFromItem(item) {
  return [
    item.name,
    ...(item.effects || []),
    ...(item.namedEffects || [])
  ]
    .join(' ')
    .toLowerCase();
}

function extractEffectText(augment) {
  if (augment.effect) {
    return augment.effect;
  }

  const effects = augment.effects || augment.effectsRaw || [];

  if (effects.length === 0) {
    return '';
  }

  return effects.join(' ');
}

function getAugmentEffects(augment) {
  if (augment.effect) {
    return [augment.effect];
  }

  return augment.effects || augment.effectsRaw || [];
}

function getAugmentKey(augment) {
  return augment.name || augment.link || JSON.stringify(augment);
}

function getItemKey(item) {
  return item.itemKey || item.link || item.name;
}

function parseStackBonusesFromEffects(effects, source = null) {
  return (effects || [])
    .map(effect => ({
      ...parseBonusEffect(effect),
      source
    }))
    .filter(parsed =>
      parsed.parsed &&
      parsed.stackKey &&
      parsed.value !== null &&
      parsed.value !== undefined
    );
}

function getAugmentStackBonuses(augment) {
  const effects = getAugmentEffects(augment);

  return parseStackBonusesFromEffects(
    effects,
    {
      type: 'augment',
      name: augment.name,
      link: augment.link
    }
  );
}

function buildInitialStackState(items, buildProfile = {}) {
  const stackState = new Map();

  for (const item of items || []) {
    const effects = getResolvedItemEffects(item, buildProfile);

    const parsedBonuses = parseStackBonusesFromEffects(
      effects,
      {
        type: 'item',
        name: item.name,
        itemKey: getItemKey(item)
      }
    );

    for (const bonus of parsedBonuses) {
      const current = stackState.get(bonus.stackKey);

      if (
        !current ||
        Number(bonus.value) > Number(current.value)
      ) {
        stackState.set(bonus.stackKey, {
          value: Number(bonus.value),
          raw: bonus.raw,
          source: bonus.source
        });
      }
    }
  }

  return stackState;
}

function scoreAugmentForProfile(augment, buildProfile = {}) {
  let score = 0;
  let matchedPriority = false;
  let matchedSecondary = false;

  const blob = textBlobFromAugment(augment);

  for (const term of buildProfile.priorityTerms || []) {
    if (blob.includes(normalizeText(term))) {
      score += 10;
      matchedPriority = true;
    }
  }

  for (const term of buildProfile.secondaryTerms || []) {
    const normalizedTerm = normalizeText(term);

    // Avoid weak elemental resistance matches unless specifically requested.
    if (
      normalizedTerm === 'resistance' &&
      (
        blob.includes('acid resistance') ||
        blob.includes('cold resistance') ||
        blob.includes('electric resistance') ||
        blob.includes('fire resistance') ||
        blob.includes('sonic resistance')
      )
    ) {
      continue;
    }

    if (blob.includes(normalizedTerm)) {
      score += 3;
      matchedSecondary = true;
    }
  }

  for (const term of buildProfile.avoidTerms || []) {
    if (blob.includes(normalizeText(term))) {
      score -= 10;
    }
  }

  const stackBonuses = getAugmentStackBonuses(augment);

  if (matchedPriority || matchedSecondary) {
  for (const bonus of stackBonuses) {
    if (bonus.value !== null && bonus.value !== undefined) {
      score += Number(bonus.value) * 0.25;
    }
  }
}

  // Only reward higher-level augments if they matched the build profile.
  if (matchedPriority || matchedSecondary) {
    if (augment.minLevel !== null && augment.minLevel !== undefined) {
      score += Math.min(Number(augment.minLevel) || 0, 34) * 0.25;
    }
  }

  return score;
}

function isDuplicateAugment(augment, usedAugmentKeys) {
  return usedAugmentKeys.has(getAugmentKey(augment));
}

function isElementalResistanceText(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes('acid resistance') ||
    normalized.includes('cold resistance') ||
    normalized.includes('electric resistance') ||
    normalized.includes('fire resistance') ||
    normalized.includes('sonic resistance')
  );
}

function isLikelyRedundantWithItem(augment, item) {
  const augmentBonuses = getAugmentStackBonuses(augment);
  const itemEffects = getResolvedItemEffects(item, {});
  const itemBonuses = parseStackBonusesFromEffects(itemEffects);

  if (augmentBonuses.length > 0 && itemBonuses.length > 0) {
    const itemStackKeys = new Set(
      itemBonuses.map(bonus => bonus.stackKey)
    );

    return augmentBonuses.some(bonus =>
      itemStackKeys.has(bonus.stackKey)
    );
  }

  const augmentBlob = textBlobFromAugment(augment);
  const itemBlob = textBlobFromItem(item);

  const commonStats = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
    'stunning',
    'combat mastery',
    'deadly',
    'accuracy',
    'seeker',
    'doublestrike',
    'doubleshot',
    'prr',
    'mrr',
    'sheltering',
    'resistance',
    'fortification'
  ];

  for (const stat of commonStats) {
    if (
      augmentBlob.includes(stat) &&
      itemBlob.includes(stat)
    ) {
      return true;
    }
  }

  return false;
}

function candidateHasUsefulUnblockedStackBonus({
  stackBonuses,
  stackState,
  allowRedundant
}) {
  if (allowRedundant) {
    return true;
  }

  // If the augment effect could not be parsed, do not block it here.
  // Let scoreAugmentForProfile decide whether it is useful.
  if (!stackBonuses || stackBonuses.length === 0) {
    return true;
  }

  return stackBonuses.some(bonus => {
    const existing = stackState.get(bonus.stackKey);

    if (!existing) {
      return true;
    }

    return Number(bonus.value) > Number(existing.value);
  });
}

function updateStackStateWithAugment(stackState, stackBonuses) {
  for (const bonus of stackBonuses || []) {
    const current = stackState.get(bonus.stackKey);

    if (
      !current ||
      Number(bonus.value) > Number(current.value)
    ) {
      stackState.set(bonus.stackKey, {
        value: Number(bonus.value),
        raw: bonus.raw,
        source: bonus.source
      });
    }
  }
}

function normalizeSlotGroupsForItem(item, augmentCandidateGroups) {
  if (!augmentCandidateGroups) {
    return [];
  }

  const itemKey = getItemKey(item);

  // Direct item group object:
  // { itemKey, augmentCandidates: [...] }
  if (
    !Array.isArray(augmentCandidateGroups) &&
    Array.isArray(augmentCandidateGroups.augmentCandidates)
  ) {
    return augmentCandidateGroups.augmentCandidates;
  }

  // Direct slot group object:
  // { itemKey, slotColor, candidates: [...] }
  if (
    !Array.isArray(augmentCandidateGroups) &&
    augmentCandidateGroups.slotColor &&
    Array.isArray(augmentCandidateGroups.candidates)
  ) {
    return [augmentCandidateGroups];
  }

  if (!Array.isArray(augmentCandidateGroups)) {
    return [];
  }

  // Single item test case:
  // [ { slotColor, candidates }, ... ]
  const directSlotGroups = augmentCandidateGroups.filter(group =>
    group &&
    group.slotColor &&
    Array.isArray(group.candidates) &&
    (
      !group.itemKey ||
      group.itemKey === itemKey ||
      group.itemName === item.name
    )
  );

  if (directSlotGroups.length > 0) {
    return directSlotGroups;
  }

  // Multi-item case:
  // [ { itemKey, augmentCandidates: [...] }, ... ]
  const itemGroup = augmentCandidateGroups.find(group =>
    group &&
    Array.isArray(group.augmentCandidates) &&
    (
      group.itemKey === itemKey ||
      group.itemName === item.name
    )
  );

  if (itemGroup) {
    return itemGroup.augmentCandidates;
  }

  return [];
}

function chooseBestAugmentForSlot({
  item,
  slotCandidateGroup,
  buildProfile,
  usedAugmentKeys,
  stackState,
  allowRedundant = false,
  minimumScore = 10
}) {
  const candidates = slotCandidateGroup.candidates || [];

  if (candidates.length === 0) {
    return null;
  }

  const scoredCandidates = candidates
    .map(augment => {
      let score = scoreAugmentForProfile(augment, buildProfile);
      const stackBonuses = getAugmentStackBonuses(augment);

      if (isDuplicateAugment(augment, usedAugmentKeys)) {
        score -= 1000;
      }

      if (
        !candidateHasUsefulUnblockedStackBonus({
          stackBonuses,
          stackState,
          allowRedundant
        })
      ) {
        score -= 1000;
      }

      if (!allowRedundant && isLikelyRedundantWithItem(augment, item)) {
        score -= 10;
      }

      return {
        augment,
        score,
        stackBonuses
      };
    })
    .filter(entry => entry.score >= minimumScore)
    .sort((a, b) => b.score - a.score);

  if (scoredCandidates.length === 0) {
    return null;
  }

  const chosen = scoredCandidates[0];

  usedAugmentKeys.add(getAugmentKey(chosen.augment));
  updateStackStateWithAugment(stackState, chosen.stackBonuses);

  return chosen.augment;
}

function selectAugmentsForItem({
  item,
  augmentCandidatesForItem,
  buildProfile,
  usedAugmentKeys = new Set(),
  allowRedundant = false
}) {
  const stackState = buildInitialStackState(
    [item],
    buildProfile
  );

  const slotGroups = normalizeSlotGroupsForItem(
    item,
    augmentCandidatesForItem
  );

  const selectedAugments = [];
  const openSlots = [];

  for (const slotCandidateGroup of slotGroups) {
    const slotColor = slotCandidateGroup.slotColor;

    const chosenAugment = chooseBestAugmentForSlot({
      item,
      slotCandidateGroup,
      buildProfile,
      usedAugmentKeys,
      stackState,
      allowRedundant
    });

    if (!chosenAugment) {
      openSlots.push({
        slotColor,
        reason: 'No strong non-duplicate non-suppressed candidate found.'
      });

      continue;
    }

    selectedAugments.push({
      slotColor,
      augment: {
        name: chosenAugment.name,
        link: chosenAugment.link,
        augmentColor: chosenAugment.augmentColor,
        minLevel: chosenAugment.minLevel,
        effect: extractEffectText(chosenAugment),
        binding: chosenAugment.binding || null
      }
    });
  }

  return {
    itemName: item.name,
    itemKey: getItemKey(item),
    selectedAugments,
    openSlots
  };
}

function collectGlobalAugmentOptions({
  items,
  augmentCandidateGroups,
  buildProfile
}) {
  const options = [];

  for (const item of items || []) {
    const itemKey = getItemKey(item);

    const slotGroups = normalizeSlotGroupsForItem(
      item,
      augmentCandidateGroups
    );

    slotGroups.forEach((slotCandidateGroup, slotIndex) => {
      const slotColor = slotCandidateGroup.slotColor;
      const candidates = slotCandidateGroup.candidates || [];
      const slotId = `${itemKey}::${slotColor}::${slotIndex}`;

      for (const augment of candidates) {
        const stackBonuses = getAugmentStackBonuses(augment);

        options.push({
          item,
          itemKey,
          itemName: item.name,
          slotColor,
          slotId,
          augment,
          stackBonuses,
          score: scoreAugmentForProfile(
            augment,
            buildProfile
          )
        });
      }
    });
  }

  return options;
}

function createEmptyResultForItem(item) {
  return {
    itemName: item.name,
    itemKey: getItemKey(item),
    selectedAugments: [],
    openSlots: []
  };
}

function selectAugmentsForItems({
  items,
  augmentCandidateGroups,
  buildProfile,
  allowRedundant = false
}) {
  const resultsByItemKey = new Map();
  const selectedSlotIds = new Set();
  const usedAugmentKeys = new Set();

  const stackState = buildInitialStackState(
    items,
    buildProfile
  );

  for (const item of items || []) {
    resultsByItemKey.set(
      getItemKey(item),
      createEmptyResultForItem(item)
    );
  }

  const options = collectGlobalAugmentOptions({
    items,
    augmentCandidateGroups,
    buildProfile
  })
    .filter(option => option.score >= 10)
    .sort((a, b) => b.score - a.score);

  for (const option of options) {
    if (selectedSlotIds.has(option.slotId)) {
      continue;
    }

    const augmentKey = getAugmentKey(option.augment);

    if (usedAugmentKeys.has(augmentKey)) {
      continue;
    }

    if (
      !candidateHasUsefulUnblockedStackBonus({
        stackBonuses: option.stackBonuses,
        stackState,
        allowRedundant
      })
    ) {
      continue;
    }

    const result = resultsByItemKey.get(option.itemKey);

    if (!result) {
      continue;
    }

    selectedSlotIds.add(option.slotId);
    usedAugmentKeys.add(augmentKey);

    updateStackStateWithAugment(
      stackState,
      option.stackBonuses
    );

    result.selectedAugments.push({
      slotColor: option.slotColor,
      augment: {
        name: option.augment.name,
        link: option.augment.link,
        augmentColor: option.augment.augmentColor,
        minLevel: option.augment.minLevel,
        effect: extractEffectText(option.augment),
        binding: option.augment.binding || null
      }
    });
  }

  // Add open slot records for every item slot that was not filled.
  for (const item of items || []) {
    const itemKey = getItemKey(item);
    const result = resultsByItemKey.get(itemKey);

    if (!result) {
      continue;
    }

    const slotGroups = normalizeSlotGroupsForItem(
      item,
      augmentCandidateGroups
    );

    if (slotGroups.length === 0) {
      for (const slotColor of item.augmentSlots || []) {
        result.openSlots.push({
          slotColor,
          reason: 'No augment candidates were provided for this item.'
        });
      }

      continue;
    }

    slotGroups.forEach((slotCandidateGroup, slotIndex) => {
      const slotColor = slotCandidateGroup.slotColor;
      const slotId = `${itemKey}::${slotColor}::${slotIndex}`;

      if (!selectedSlotIds.has(slotId)) {
        result.openSlots.push({
          slotColor,
          reason: 'No strong non-duplicate non-suppressed candidate found.'
        });
      }
    });
  }

  return Array.from(resultsByItemKey.values());
}

module.exports = {
  selectAugmentsForItem,
  selectAugmentsForItems,
  scoreAugmentForProfile,
  isLikelyRedundantWithItem,

  // Exported for tests/debugging
  getAugmentStackBonuses,
  buildInitialStackState
};