// craftingAugmentSearch.js

const fs = require('fs');
const path = require('path');

const {
  parseBonusEffect
} = require('./bonusParser');

const DEFAULT_CRAFTING_AUGMENT_FILE = path.join(
  __dirname,
  '..',
  'augmentlist',
  'viktranium_experiment_crafting.json'
);

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function readJsonFile(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function loadCraftingAugments(
  filepath = DEFAULT_CRAFTING_AUGMENT_FILE
) {
  const data = readJsonFile(filepath);

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.recipes)) {
    return data.recipes;
  }

  return [];
}

function getFirstArrayValue(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function getCraftingAugmentTierForBuild(buildProfile = {}) {
  const maxLevel = Number(buildProfile.maxLevel || 0);

  if (maxLevel >= 30) {
    return 'legendary';
  }

  return 'heroic';
}

function isHeroicRecipe(recipe) {
  const text = [
    recipe.name,
    recipe.link,
    recipe.visibleName
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('(heroic)') ||
    text.includes('_heroic') ||
    text.includes('(heroic - dreadful)')
  );
}

function getCraftingAugmentEffectForBuild(
  recipe,
  buildProfile = {}
) {
  const preferredTier = getCraftingAugmentTierForBuild(buildProfile);

  const tieredEffects = Array.isArray(recipe.tieredEffects)
    ? recipe.tieredEffects
    : [];

  const preferredEffect = tieredEffects.find(effect =>
    normalizeText(effect.tier) === preferredTier
  );

  if (preferredEffect && preferredEffect.effectRaw) {
    return {
      tier: preferredTier,
      effectRaw: cleanText(preferredEffect.effectRaw)
    };
  }

  if (
    preferredTier === 'legendary' &&
    recipe.legendaryEffectRaw
  ) {
    return {
      tier: 'legendary',
      effectRaw: cleanText(recipe.legendaryEffectRaw)
    };
  }

  if (
    preferredTier === 'heroic' &&
    recipe.heroicEffectRaw
  ) {
    return {
      tier: 'heroic',
      effectRaw: cleanText(recipe.heroicEffectRaw)
    };
  }

  // Backward compatibility for older parser output:
  // effectRaw = heroic effect
  // costRaw[0] = legendary effect
  if (preferredTier === 'legendary') {
    const legacyLegendaryEffect = getFirstArrayValue(recipe.costRaw);

    if (legacyLegendaryEffect) {
      return {
        tier: 'legendary',
        effectRaw: cleanText(legacyLegendaryEffect)
      };
    }
  }

  // Final fallback:
  // If the item itself is clearly Heroic, mark it heroic.
  // Otherwise use the build's preferred tier. This prevents legendary-only
  // effects such as Woeful Acid / Legendary Dust from being labeled heroic.
  if (recipe.effectRaw) {
    return {
      tier: isHeroicRecipe(recipe) ? 'heroic' : preferredTier,
      effectRaw: cleanText(recipe.effectRaw)
    };
  }

  return null;
}

function getRecipeSearchBlob(recipe, buildProfile = {}) {
  const selectedEffect = getCraftingAugmentEffectForBuild(
    recipe,
    buildProfile
  );

  return [
    recipe.name,
    recipe.system,
    recipe.slotType,
    recipe.itemGroup,
    recipe.sourceSection,
    selectedEffect?.effectRaw,
    recipe.heroicEffectRaw,
    recipe.legendaryEffectRaw
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isElementalResistanceEffect(effect) {
  return (
    effect.includes('acid resistance') ||
    effect.includes('cold resistance') ||
    effect.includes('electric resistance') ||
    effect.includes('fire resistance') ||
    effect.includes('sonic resistance')
  );
}

function effectMatchesTerm(effectText, term) {
  const effect = normalizeText(effectText);
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm) {
    return false;
  }

  // Avoid generic "Resistance" matching elemental resistance.
  if (
    normalizedTerm === 'resistance' &&
    isElementalResistanceEffect(effect)
  ) {
    return false;
  }

  // Spell crit damage should be caught by spell avoid terms.
  if (
    normalizedTerm === 'spell critical' &&
    (
      effect.includes('spell crit') ||
      effect.includes('spell critical')
    )
  ) {
    return true;
  }

  if (
    normalizedTerm === 'spell lore' &&
    (
      effect.includes('spell crit') ||
      effect.includes('spell critical') ||
      effect.includes('spell lore')
    )
  ) {
    return true;
  }

  if (
    normalizedTerm === 'spell power' &&
    (
      effect.includes('spellpower') ||
      effect.includes('spell power')
    )
  ) {
    return true;
  }

  return effect.includes(normalizedTerm);
}

function hasAnyTerm(text, terms = []) {
  return terms.some(term =>
    effectMatchesTerm(text, term)
  );
}

function addAliasScore(effectText, buildProfile = {}) {
  let score = 0;
  const text = normalizeText(effectText);

  // Some crafting augments describe tactical bonuses without saying
  // "Combat Mastery" directly.
  if (
    text.includes('stunning fist') ||
    text.includes('stunning blow') ||
    text.includes('trip') ||
    text.includes('sunder') ||
    text.includes('dc to resist')
  ) {
    if (
      hasAnyTerm(
        'Combat Mastery Tactical DC Stunning',
        buildProfile.priorityTerms || []
      )
    ) {
      score += 25;
    }
  }

  // DDO sometimes says Attack where the planner thinks Accuracy.
  if (
    text.includes('bonus to attack') &&
    hasAnyTerm('Accuracy', buildProfile.priorityTerms || [])
  ) {
    score += 18;
  }

  // Positive Healing Amplification should count for Healing Amplification.
  if (
    text.includes('positive healing amplification') &&
    hasAnyTerm(
      'Healing Amplification',
      [
        ...(buildProfile.priorityTerms || []),
        ...(buildProfile.secondaryTerms || [])
      ]
    )
  ) {
    score += 18;
  }

  // Physical Resistance Rating / Magical Resistance Rating aliases.
  if (
    text.includes('physical resistance rating') &&
    hasAnyTerm(
      'PRR Physical Resistance Rating',
      [
        ...(buildProfile.priorityTerms || []),
        ...(buildProfile.secondaryTerms || [])
      ]
    )
  ) {
    score += 18;
  }

  if (
    text.includes('magical resistance rating') &&
    hasAnyTerm(
      'MRR Magical Resistance Rating',
      [
        ...(buildProfile.priorityTerms || []),
        ...(buildProfile.secondaryTerms || [])
      ]
    )
  ) {
    score += 18;
  }

  return score;
}

function isSpellCasterEffect(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes('spell crit') ||
    normalized.includes('spell critical') ||
    normalized.includes('spellpower') ||
    normalized.includes('spell power') ||
    normalized.includes('spell penetration') ||
    normalized.includes('spell dc') ||
    normalized.includes('spell dcs') ||
    normalized.includes('spell focus')
  );
}

function scoreCraftingAugmentForProfile(
  recipe,
  buildProfile = {}
) {
  const selectedEffect = getCraftingAugmentEffectForBuild(
    recipe,
    buildProfile
  );

  if (!selectedEffect || !selectedEffect.effectRaw) {
    return -100;
  }

  let score = 0;

  const effectText = selectedEffect.effectRaw;
  const blob = getRecipeSearchBlob(recipe, buildProfile);
  const avoidBlob = normalizeText(blob);

  let matchedBuildTerm = false;

  // Direct penalty for caster-only crafting effects on non-caster builds.
  // This stops "Spell Crit Damage" from ranking because it contains "Damage".
  if (isSpellCasterEffect(avoidBlob)) {
    score -= 80;
  }

  for (const stat of buildProfile.primaryStats || []) {
    if (effectMatchesTerm(blob, stat)) {
      score += 80;
      matchedBuildTerm = true;
    }
  }

  for (const term of buildProfile.priorityTerms || []) {
    if (effectMatchesTerm(blob, term)) {
      score += 35;
      matchedBuildTerm = true;
    }
  }

  for (const term of buildProfile.secondaryTerms || []) {
    if (effectMatchesTerm(blob, term)) {
      score += 15;
      matchedBuildTerm = true;
    }
  }

  for (const term of buildProfile.avoidTerms || []) {
    if (effectMatchesTerm(blob, term)) {
      score -= 80;
    }
  }

  score += addAliasScore(effectText, buildProfile);

  const parsed = parseBonusEffect(effectText);

  if (
    matchedBuildTerm &&
    parsed.parsed &&
    parsed.value !== null &&
    parsed.value !== undefined
  ) {
    score += Number(parsed.value) * 0.4;
  }

  // Prefer legendary effects for legendary builds.
  if (selectedEffect.tier === 'legendary') {
    score += 5;
  }

  return score;
}

function matchesCraftingSlot(recipe, requiredSlot = {}) {
  if (
    requiredSlot.system &&
    recipe.system !== requiredSlot.system
  ) {
    return false;
  }

  if (
    requiredSlot.slotType &&
    recipe.slotType !== requiredSlot.slotType
  ) {
    return false;
  }

  if (
    requiredSlot.itemGroup &&
    recipe.itemGroup !== requiredSlot.itemGroup
  ) {
    return false;
  }

  return true;
}

function searchCraftingAugments(
  craftingAugments,
  query = {}
) {
  const buildProfile = query.buildProfile || {};
  const limit = query.limit || 10;

  return (craftingAugments || [])
    .filter(recipe =>
      recipe.itemType === 'crafting_augment'
    )
    .filter(recipe =>
      matchesCraftingSlot(recipe, {
        system: query.system,
        slotType: query.slotType,
        itemGroup: query.itemGroup
      })
    )
    .map(recipe => {
      const selectedEffect = getCraftingAugmentEffectForBuild(
        recipe,
        buildProfile
      );

      const parsed = selectedEffect
        ? parseBonusEffect(selectedEffect.effectRaw)
        : null;

      return {
        ...recipe,

        selectedTier: selectedEffect?.tier || null,
        selectedEffectRaw: selectedEffect?.effectRaw || null,

        parsedSelectedEffect: parsed,

        searchScore: scoreCraftingAugmentForProfile(
          recipe,
          buildProfile
        )
      };
    })
    .filter(recipe =>
      recipe.selectedEffectRaw &&
      recipe.searchScore >= (query.minimumScore ?? 1)
    )
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, limit);
}

function compactCraftingAugmentForAI(recipe) {
  return {
    name: recipe.name,
    link: recipe.link,

    system: recipe.system,
    slotType: recipe.slotType,
    itemGroup: recipe.itemGroup,
    sourceSection: recipe.sourceSection,

    selectedTier: recipe.selectedTier,
    selectedEffectRaw: recipe.selectedEffectRaw,

    parsedSelectedEffect: recipe.parsedSelectedEffect
      ? {
          parsed: recipe.parsedSelectedEffect.parsed,
          bonusType: recipe.parsedSelectedEffect.bonusType,
          stat: recipe.parsedSelectedEffect.stat,
          value: recipe.parsedSelectedEffect.value,
          valueText: recipe.parsedSelectedEffect.valueText,
          stackKey: recipe.parsedSelectedEffect.stackKey
        }
      : null,

    searchScore: recipe.searchScore
  };
}

function getCraftingAugmentCandidatesForItem(
  item,
  craftingAugments,
  options = {}
) {
  const buildProfile = options.buildProfile || {};
  const limitPerSlot = options.limitPerSlot || 5;

  const craftingSlots = item.craftingSlots || [];

  return {
    itemName: item.name,
    itemKey: item.itemKey || item.link || item.name,

    craftingCandidates: craftingSlots.map(slot => {
      const candidates = searchCraftingAugments(
        craftingAugments,
        {
          system: slot.system,
          slotType: slot.slotType,
          itemGroup: slot.itemGroup,
          buildProfile,
          limit: limitPerSlot,
          minimumScore: options.minimumScore ?? 1
        }
      );

      return {
        system: slot.system,
        slotType: slot.slotType,
        itemGroup: slot.itemGroup,
        candidates
      };
    })
  };
}

function getCraftingAugmentCandidatesForItems(
  items,
  craftingAugments,
  options = {}
) {
  return (items || [])
    .filter(item =>
      Array.isArray(item.craftingSlots) &&
      item.craftingSlots.length > 0
    )
    .map(item =>
      getCraftingAugmentCandidatesForItem(
        item,
        craftingAugments,
        options
      )
    );
}

module.exports = {
  loadCraftingAugments,

  getCraftingAugmentTierForBuild,
  getCraftingAugmentEffectForBuild,

  scoreCraftingAugmentForProfile,
  searchCraftingAugments,

  compactCraftingAugmentForAI,

  getCraftingAugmentCandidatesForItem,
  getCraftingAugmentCandidatesForItems
};