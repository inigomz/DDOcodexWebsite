// augmentSelection.js

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function textBlobFromAugment(augment) {
  return [
    augment.name,
    augment.augmentColor,
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
  const effects = augment.effects || augment.effectsRaw || [];

  if (effects.length === 0) {
    return '';
  }

  return effects.join(' ');
}

function getAugmentKey(augment) {
  return augment.name || augment.link || JSON.stringify(augment);
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

  // Only reward higher-level augments if they matched the build profile.
  if (
    matchedPriority ||
    matchedSecondary
  ) {
    if (augment.minLevel !== null && augment.minLevel !== undefined) {
      score += Math.min(Number(augment.minLevel) || 0, 34) * 0.25;
    }
  }

  return score;
}

function isDuplicateAugment(augment, usedAugmentKeys) {
  return usedAugmentKeys.has(getAugmentKey(augment));
}

function isLikelyRedundantWithItem(augment, item) {
  const augmentBlob = textBlobFromAugment(augment);
  const itemBlob = textBlobFromItem(item);

  // Simple first-pass redundancy checks.
  // This avoids obvious waste like:
  // item has "Wisdom +14" and augment is "Diamond of Wisdom +14".
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
    if (augmentBlob.includes(stat) && itemBlob.includes(stat)) {
      return true;
    }
  }

  return false;
}

function chooseBestAugmentForSlot({
  item,
  slotCandidateGroup,
  buildProfile,
  usedAugmentKeys,
  allowRedundant = false
}) {
  const candidates = slotCandidateGroup.candidates || [];

  if (candidates.length === 0) {
    return null;
  }

  const scoredCandidates = candidates
    .map(augment => {
      let score = scoreAugmentForProfile(augment, buildProfile);

      if (isDuplicateAugment(augment, usedAugmentKeys)) {
        score -= 1000;
      }

      if (!allowRedundant && isLikelyRedundantWithItem(augment, item)) {
        score -= 25;
      }

      return {
        augment,
        score
      };
    })
    .filter(entry => entry.score >= 10)
    .sort((a, b) => b.score - a.score);

  if (scoredCandidates.length === 0) {
    return null;
  }

  return scoredCandidates[0].augment;
}

function selectAugmentsForItem({
  item,
  augmentCandidatesForItem,
  buildProfile,
  usedAugmentKeys,
  allowRedundant = false
}) {
  const selectedAugments = [];
  const openSlots = [];

  const slotGroups =
    augmentCandidatesForItem.augmentCandidates ||
    augmentCandidatesForItem ||
    [];

  for (const slotCandidateGroup of slotGroups) {
    const slotColor = slotCandidateGroup.slotColor;

    const chosenAugment = chooseBestAugmentForSlot({
      item,
      slotCandidateGroup,
      buildProfile,
      usedAugmentKeys,
      allowRedundant
    });

    if (!chosenAugment) {
      openSlots.push({
        slotColor,
        reason: 'No strong non-duplicate candidate found.'
      });

      continue;
    }

    usedAugmentKeys.add(getAugmentKey(chosenAugment));

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
    itemKey: item.itemKey,
    selectedAugments,
    openSlots
  };
}

function findMatchingAugmentCandidateGroup(item, allAugmentCandidateGroups) {
  return allAugmentCandidateGroups.find(group =>
    group.itemKey === item.itemKey ||
    group.itemName === item.name
  );
}

function selectAugmentsForItems({
  items,
  augmentCandidateGroups,
  buildProfile,
  allowRedundant = false
}) {
  const usedAugmentKeys = new Set();
  const results = [];

  for (const item of items) {
    const matchingGroup = findMatchingAugmentCandidateGroup(
      item,
      augmentCandidateGroups
    );

    if (!matchingGroup) {
      results.push({
        itemName: item.name,
        itemKey: item.itemKey,
        selectedAugments: [],
        openSlots: (item.augmentSlots || []).map(slotColor => ({
          slotColor,
          reason: 'No augment candidates were provided for this item.'
        }))
      });

      continue;
    }

    const result = selectAugmentsForItem({
      item,
      augmentCandidatesForItem: matchingGroup,
      buildProfile,
      usedAugmentKeys,
      allowRedundant
    });

    results.push(result);
  }

  return results;
}

module.exports = {
  selectAugmentsForItem,
  selectAugmentsForItems,
  scoreAugmentForProfile,
  isLikelyRedundantWithItem
};