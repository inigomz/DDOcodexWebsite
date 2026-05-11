// gearsearch.js

const fs = require('fs');
const path = require('path');

const DEFAULT_ITEM_DIR = path.join(__dirname, '..', 'itemlist_enriched');

function readJsonFile(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function getJsonFiles(directory) {
  return fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .filter(file => !file.includes('unmatched'))
    .map(file => path.join(directory, file));
}

function loadAllItems(itemDir = DEFAULT_ITEM_DIR) {
  const files = getJsonFiles(itemDir);
  const allItems = [];

  for (const file of files) {
    const data = readJsonFile(file);

    if (!Array.isArray(data)) {
      continue;
    }

    allItems.push(...data);
  }

  return allItems;
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function itemTextBlob(item) {
  return [
    item.name,
    item.slot,
    item.itemSubtype,
    item.category,

    ...(item.effectsRaw || []),
    ...(item.namedEffects || []),
    ...(item.augmentSlots || []),

    ...(item.setMembership || []).map(set => set.setName),

    ...(item.setBonuses || []).map(bonus =>
      bonus.effect || bonus.effectRaw
    ),

    ...(item.craftingSlots || []).map(slot =>
      `${slot.system} ${slot.slotType} ${slot.itemGroup}`
    )
  ]
    .join(' ')
    .toLowerCase();
}

function hasAllTerms(item, terms) {
  if (!terms || terms.length === 0) {
    return true;
  }

  const blob = itemTextBlob(item);

  return terms.every(term =>
    blob.includes(normalizeText(term))
  );
}

function hasAnyTerm(item, terms) {
  if (!terms || terms.length === 0) {
    return true;
  }

  const blob = itemTextBlob(item);

  return terms.some(term =>
    blob.includes(normalizeText(term))
  );
}

function matchesCraftingSlot(item, requiredCraftingSlot) {
  if (!requiredCraftingSlot) {
    return true;
  }

  return (item.craftingSlots || []).some(slot => {
    if (
      requiredCraftingSlot.system &&
      slot.system !== requiredCraftingSlot.system
    ) {
      return false;
    }

    if (
      requiredCraftingSlot.slotType &&
      slot.slotType !== requiredCraftingSlot.slotType
    ) {
      return false;
    }

    if (
      requiredCraftingSlot.itemGroup &&
      slot.itemGroup !== requiredCraftingSlot.itemGroup
    ) {
      return false;
    }

    return true;
  });
}

function matchesItem(item, query = {}) {
  if (
    query.maxLevel !== undefined &&
    item.minLevel !== null &&
    item.minLevel > query.maxLevel
  ) {
    return false;
  }

  if (
    query.minLevel !== undefined &&
    item.minLevel !== null &&
    item.minLevel < query.minLevel
  ) {
    return false;
  }

  if (query.slot && item.slot !== query.slot) {
    return false;
  }

  if (query.slots && !query.slots.includes(item.slot)) {
    return false;
  }

  if (query.itemSubtype && item.itemSubtype !== query.itemSubtype) {
    return false;
  }

  if (
    query.itemSubtypes &&
    !query.itemSubtypes.includes(item.itemSubtype)
  ) {
    return false;
  }

  if (query.handedness && item.handedness !== query.handedness) {
    return false;
  }

  if (
    query.requiredAugmentSlot &&
    !(item.augmentSlots || []).includes(query.requiredAugmentSlot)
  ) {
    return false;
  }

  if (!matchesCraftingSlot(item, query.requiredCraftingSlot)) {
    return false;
  }

  if (query.mustInclude && !hasAllTerms(item, query.mustInclude)) {
    return false;
  }

  if (query.shouldInclude && !hasAnyTerm(item, query.shouldInclude)) {
    return false;
  }

  if (query.exclude && hasAnyTerm(item, query.exclude)) {
    return false;
  }

  return true;
}

function isSetBonusText(effect) {
  const text = normalizeText(effect);

  return (
    text.includes('pieces equipped') ||
    text.includes('piece equipped') ||
    text.includes('set bonus')
  );
}

function isHiddenOrMetadataEffect(effect) {
  const text = normalizeText(effect);

  return (
    text.includes('craftable (hidden)') ||
    text.includes('empty') ||
    text.includes('augment slot')
  );
}

function isElementalResistance(effect) {
  const text = normalizeText(effect);

  return (
    text.includes('acid resistance') ||
    text.includes('cold resistance') ||
    text.includes('electric resistance') ||
    text.includes('fire resistance') ||
    text.includes('sonic resistance')
  );
}

function effectMatchesTerm(effect, term) {
  const effectText = normalizeText(effect);
  const termText = normalizeText(term);

  if (!termText) {
    return false;
  }

  // Avoid generic "Resistance" matching elemental resistance.
  if (termText === 'resistance' && isElementalResistance(effectText)) {
    return false;
  }

  return effectText.includes(termText);
}

function effectMatchesAnyTerm(effect, terms) {
  return (terms || []).some(term =>
    effectMatchesTerm(effect, term)
  );
}

function isAvoidedEffect(effect, buildProfile = {}) {
  return effectMatchesAnyTerm(
    effect,
    buildProfile.avoidTerms || []
  );
}

function isRelevantEffect(effect, buildProfile = {}) {
  const priorityTerms = buildProfile.priorityTerms || [];
  const secondaryTerms = buildProfile.secondaryTerms || [];

  if (priorityTerms.length === 0 && secondaryTerms.length === 0) {
    return true;
  }

  return (
    effectMatchesAnyTerm(effect, priorityTerms) ||
    effectMatchesAnyTerm(effect, secondaryTerms)
  );
}

function isAIFacingEffect(effect, buildProfile = {}) {
  if (!effect) {
    return false;
  }

  if (isSetBonusText(effect)) {
    return false;
  }

  if (isHiddenOrMetadataEffect(effect)) {
    return false;
  }

  if (isAvoidedEffect(effect, buildProfile)) {
    return false;
  }

  return isRelevantEffect(effect, buildProfile);
}

function getAIFacingEffects(item, buildProfile = {}) {
  const effects = item.namedEffects || [];

  return effects.filter(effect =>
    isAIFacingEffect(effect, buildProfile)
  );
}

function buildProfileFromQuery(query = {}) {
  return query.buildProfile || {
    priorityTerms: query.priorityTerms || [],
    secondaryTerms: query.secondaryTerms || [],
    avoidTerms: query.avoidTerms || []
  };
}

function scoreDirectEffect(effect, buildProfile = {}) {
  let score = 0;

  for (const term of buildProfile.priorityTerms || []) {
    if (effectMatchesTerm(effect, term)) {
      score += 20;
    }
  }

  for (const term of buildProfile.secondaryTerms || []) {
    if (effectMatchesTerm(effect, term)) {
      score += 6;
    }
  }

  for (const term of buildProfile.avoidTerms || []) {
    if (effectMatchesTerm(effect, term)) {
      score -= 15;
    }
  }

  return score;
}

function scoreItem(item, query = {}) {
  let score = 0;

  const buildProfile = buildProfileFromQuery(query);
  const aiFacingEffects = getAIFacingEffects(item, buildProfile);

  // Strongly reward direct useful item effects.
  for (const effect of aiFacingEffects) {
    score += scoreDirectEffect(effect, buildProfile);
  }

  // Penalize items that only match because of metadata, set text, or slots.
  if (aiFacingEffects.length === 0) {
    score -= 15;
  }

  // Small bonus for augment flexibility, but do not let it dominate.
  if ((item.augmentSlots || []).length > 0) {
    score += Math.min((item.augmentSlots || []).length, 3) * 0.5;
  }

  // Small bonus for crafting flexibility.
  if ((item.craftingSlots || []).length > 0) {
    score += Math.min((item.craftingSlots || []).length, 4) * 0.75;
  }

  // Very small bonus for set opportunities.
  if ((item.setMembership || []).length > 0) {
    score += Math.min((item.setMembership || []).length, 2) * 0.5;
  }

  // Slightly prefer higher-level gear after useful effects are scored.
  if (item.minLevel !== null && item.minLevel !== undefined) {
    score += Math.min(Number(item.minLevel) || 0, 34) * 0.1;
  }

  return score;
}

function searchItems(items, query = {}) {
  const limit = query.limit || 20;

  return items
    .filter(item => matchesItem(item, query))
    .map(item => ({
      ...item,
      searchScore: scoreItem(item, query)
    }))
    .sort((a, b) => {
      if (b.searchScore !== a.searchScore) {
        return b.searchScore - a.searchScore;
      }

      return (b.minLevel || 0) - (a.minLevel || 0);
    })
    .slice(0, limit);
}

function compactItemForAI(item, buildProfile = {}) {
  return {
    name: item.name,
    itemKey: item.itemKey,

    slot: item.slot,
    itemSubtype: item.itemSubtype,
    handedness: item.handedness,

    minLevel: item.minLevel,

    effects: getAIFacingEffects(item, buildProfile),

    augmentSlots: item.augmentSlots || [],

    craftingSlots: (item.craftingSlots || []).map(slot => ({
      system: slot.system,
      slotType: slot.slotType,
      itemGroup: slot.itemGroup
    })),

    setMembership: (item.setMembership || []).map(set => ({
      setId: set.setId,
      setName: set.setName
    })),

    searchScore: item.searchScore
  };
}

function compactItemsForAI(items, buildProfile = {}) {
  return items.map(item =>
    compactItemForAI(item, buildProfile)
  );
}

module.exports = {
  loadAllItems,
  searchItems,
  matchesItem,
  scoreItem,
  compactItemForAI,
  compactItemsForAI,

  isAIFacingEffect,
  getAIFacingEffects
};