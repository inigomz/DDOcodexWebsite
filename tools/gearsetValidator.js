// gearsetValidator.js

const {
  getAllowedAugmentColorsForSlot
} = require('./augmentSearch');

const SLOT_LIMITS = {
  head: 1,
  eyes: 1,
  neck: 1,
  trinket: 1,
  back: 1,
  waist: 1,
  feet: 1,
  wrists: 1,
  hands: 1,
  armor: 1,
  weapon: 1,
  offhand: 1,

  // DDO has two ring slots.
  finger: 2
};

const TWO_HANDED_SUBTYPES = [
  'falchion',
  'great_axe',
  'great_club',
  'great_sword',
  'maul',
  'quarterstaff',
  'long_bow',
  'short_bow'
];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function normalizeSetId(setName) {
  return String(setName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getItemKey(item) {
  return item.itemKey || item.link || item.name;
}

function getAugmentKey(augment) {
  return augment.name || augment.link || JSON.stringify(augment);
}

function getGearTier(item) {
  const name = normalizeText(item.name);
  const minLevel = Number(item.minLevel);

  if (name.includes('legendary')) {
    return 'legendary';
  }

  if (name.includes('epic')) {
    return 'epic';
  }

  if (!Number.isNaN(minLevel)) {
    if (minLevel >= 28) return 'legendary';
    if (minLevel >= 20) return 'epic';
  }

  return 'heroic';
}

function isTwoHandedWeapon(item) {
  if (!item) {
    return false;
  }

  if (item.handedness === 'two_handed') {
    return true;
  }

  return TWO_HANDED_SUBTYPES.includes(item.itemSubtype);
}

function blocksOffhand(item) {
  if (!item) {
    return false;
  }

  if (item.itemSubtype === 'handwraps') {
    return true;
  }

  return isTwoHandedWeapon(item);
}

function validateSlotRules(equippedItems) {
  const errors = [];
  const warnings = [];
  const slotUsage = {};

  const seenItemKeys = new Set();

  for (const item of equippedItems) {
    const itemKey = getItemKey(item);

    if (seenItemKeys.has(itemKey)) {
      errors.push({
        type: 'duplicate_item',
        message: `Duplicate item equipped: ${item.name}`,
        item
      });
    }

    seenItemKeys.add(itemKey);

    const slot = item.slot || 'unknown';

    if (!slotUsage[slot]) {
      slotUsage[slot] = [];
    }

    slotUsage[slot].push({
      itemKey,
      name: item.name,
      slot
    });
  }

  for (const [slot, items] of Object.entries(slotUsage)) {
    const limit = SLOT_LIMITS[slot] || 1;

    if (items.length > limit) {
      errors.push({
        type: 'slot_limit_exceeded',
        message: `${slot} has ${items.length} items equipped, but only ${limit} allowed.`,
        slot,
        items
      });
    }
  }

  if (slotUsage.unknown) {
    warnings.push({
      type: 'unknown_slot',
      message: 'One or more items have an unknown slot.',
      items: slotUsage.unknown
    });
  }

  return {
    errors,
    warnings,
    slotUsage
  };
}

function validateOffhandRules(equippedItems, buildProfile = {}) {
  const errors = [];
  const warnings = [];

  const weapon = equippedItems.find(item => item.slot === 'weapon');
  const offhand = equippedItems.find(item => item.slot === 'offhand');

  const preferredWeaponSubtypes =
    buildProfile.preferredWeaponSubtypes || [];

  if (
    preferredWeaponSubtypes.includes('handwraps') &&
    offhand
  ) {
    errors.push({
      type: 'invalid_offhand_for_handwraps_build',
      message: `Offhand item "${offhand.name}" is not allowed for a handwraps build.`,
      offhand
    });
  }

  if (weapon && offhand && blocksOffhand(weapon)) {
    errors.push({
      type: 'invalid_offhand_blocked_by_weapon',
      message: `Weapon "${weapon.name}" blocks the offhand slot, but "${offhand.name}" is equipped.`,
      weapon,
      offhand
    });
  }

  if (!weapon && offhand) {
    warnings.push({
      type: 'offhand_without_weapon',
      message: `Offhand item "${offhand.name}" is equipped without a main weapon.`,
      offhand
    });
  }

  return {
    errors,
    warnings
  };
}

function getPiecesRequired(bonus, membership) {
  if (
    bonus.piecesRequired !== null &&
    bonus.piecesRequired !== undefined
  ) {
    return bonus.piecesRequired;
  }

  return Math.min(2, membership.availablePieces || 2);
}

function isPiecesRequiredInferred(bonus) {
  return (
    bonus.piecesRequired === null ||
    bonus.piecesRequired === undefined
  );
}

function getTieredEffectForTier(bonus, tier) {
  if (!Array.isArray(bonus.tieredEffects)) {
    return null;
  }

  const tieredEffect = bonus.tieredEffects.find(
    effect => effect.tier === tier
  );

  if (!tieredEffect) {
    return null;
  }

  return {
    tier,
    symbol: tieredEffect.symbol || null,
    valueText: tieredEffect.valueText || '',
    effectText: tieredEffect.effect || '',
    fullEffect:
      `${tieredEffect.valueText || ''} ${tieredEffect.effect || ''}`.trim()
  };
}

function buildSetGroups(equippedItems) {
  const setGroups = new Map();

  for (const item of equippedItems) {
    const tier = getGearTier(item);
    const itemKey = getItemKey(item);

    for (const membership of item.setMembership || []) {
      const setId =
        membership.setId || normalizeSetId(membership.setName);

      if (!setId) {
        continue;
      }

      const groupKey = `${setId}|${tier}`;

      if (!setGroups.has(groupKey)) {
        setGroups.set(groupKey, {
          setId,
          setName: membership.setName,
          tier,
          sourceSection: membership.sourceSection || null,
          membership,
          equippedPieces: []
        });
      }

      const group = setGroups.get(groupKey);

      const alreadyCounted = group.equippedPieces.some(
        piece => piece.itemKey === itemKey
      );

      if (!alreadyCounted) {
        group.equippedPieces.push({
          itemKey,
          name: item.name,
          slot: item.slot,
          minLevel: item.minLevel,
          tier
        });
      }
    }
  }

  return setGroups;
}

function calculateSetBonuses(equippedItems) {
  const warnings = [];
  const setGroups = buildSetGroups(equippedItems);

  const setProgress = [];
  const activeSetBonuses = [];

  for (const group of setGroups.values()) {
    const membership = group.membership;
    const bonuses = membership.bonuses || [];
    const piecesEquipped = group.equippedPieces.length;

    if (bonuses.length === 0) {
      warnings.push({
        type: 'set_bonus_data_missing',
        message: `Set "${group.setName}" has equipped pieces, but no bonus data was available. Use full enriched item data, not compact item data.`,
        setId: group.setId,
        setName: group.setName
      });
    }

    const progressEntry = {
      setId: group.setId,
      setName: group.setName,
      tier: group.tier,
      piecesEquipped,
      equippedPieces: group.equippedPieces,
      sourceSection: group.sourceSection,
      activeBonuses: [],
      inactiveBonuses: []
    };

    for (const bonus of bonuses) {
      const piecesRequired = getPiecesRequired(bonus, membership);

      const baseBonusInfo = {
        setId: group.setId,
        setName: group.setName,
        tier: group.tier,
        piecesEquipped,
        piecesRequired,
        piecesRequiredInferred: isPiecesRequiredInferred(bonus),
        equippedPieces: group.equippedPieces,
        sourceSection: group.sourceSection
      };

      let effect = bonus.effect || bonus.effectRaw || '';

      if (
        Array.isArray(bonus.tieredEffects) &&
        bonus.tieredEffects.length > 0
      ) {
        const tieredEffect = getTieredEffectForTier(bonus, group.tier);

        if (!tieredEffect) {
          continue;
        }

        effect = tieredEffect.fullEffect;
      }

      const bonusInfo = {
        ...baseBonusInfo,
        effect,
        effectRaw: bonus.effectRaw || bonus.effect || effect
      };

      if (piecesEquipped >= piecesRequired) {
        activeSetBonuses.push(bonusInfo);
        progressEntry.activeBonuses.push(bonusInfo);
      } else {
        progressEntry.inactiveBonuses.push(bonusInfo);
      }
    }

    setProgress.push(progressEntry);
  }

  return {
    activeSetBonuses,
    setProgress,
    warnings
  };
}

function buildSelectedAugmentMap(selectedAugments) {
  const map = new Map();

  for (const result of selectedAugments || []) {
    if (!result.itemKey) {
      continue;
    }

    map.set(result.itemKey, result);
  }

  return map;
}

function validateAugmentRules(equippedItems, selectedAugments, buildProfile = {}) {
  const errors = [];
  const warnings = [];

  const itemMap = new Map();

  for (const item of equippedItems) {
    itemMap.set(getItemKey(item), item);
  }

  const usedAugmentKeys = new Set();
  const usedAugmentEffects = new Set();

  const selectedAugmentMap =
    buildSelectedAugmentMap(selectedAugments);

  for (const result of selectedAugments || []) {
    const item = itemMap.get(result.itemKey);

    if (!item) {
      warnings.push({
        type: 'augment_for_unequipped_item',
        message: `Augments were selected for "${result.itemName}", but that item is not equipped.`,
        augmentSelection: result
      });

      continue;
    }

    const usedSlotColorsForItem = new Set();

    for (const selected of result.selectedAugments || []) {
      const slotColor = selected.slotColor;
      const augment = selected.augment;

      if (!augment) {
        continue;
      }

      const augmentKey = getAugmentKey(augment);

      if (usedAugmentKeys.has(augmentKey)) {
        errors.push({
          type: 'duplicate_augment',
          message: `Duplicate augment selected: ${augment.name}`,
          augment
        });
      }

      usedAugmentKeys.add(augmentKey);

      if (usedSlotColorsForItem.has(slotColor)) {
        errors.push({
          type: 'multiple_augments_same_slot',
          message: `Multiple augments selected for ${item.name}'s ${slotColor} slot.`,
          item,
          slotColor
        });
      }

      usedSlotColorsForItem.add(slotColor);

      if (!(item.augmentSlots || []).includes(slotColor)) {
        errors.push({
          type: 'item_does_not_have_augment_slot',
          message: `${item.name} does not have a ${slotColor} augment slot.`,
          item,
          slotColor,
          augment
        });
      }

      const allowedColors =
        getAllowedAugmentColorsForSlot(slotColor);

      if (!allowedColors.includes(augment.augmentColor)) {
        errors.push({
          type: 'invalid_augment_color',
          message: `${augment.name} (${augment.augmentColor}) cannot fit in ${item.name}'s ${slotColor} slot.`,
          item,
          slotColor,
          augment,
          allowedColors
        });
      }

      const maxLevel = buildProfile.maxLevel || 34;

      if (
        augment.minLevel !== null &&
        augment.minLevel !== undefined &&
        augment.minLevel > maxLevel
      ) {
        errors.push({
          type: 'augment_level_too_high',
          message: `${augment.name} requires level ${augment.minLevel}, above build max level ${maxLevel}.`,
          augment,
          maxLevel
        });
      }

      const effect = augment.effect || '';

      if (effect && usedAugmentEffects.has(effect)) {
        warnings.push({
          type: 'duplicate_augment_effect',
          message: `Duplicate augment effect selected: ${effect}`,
          augment
        });
      }

      if (effect) {
        usedAugmentEffects.add(effect);
      }
    }
  }

  for (const item of equippedItems) {
    const itemKey = getItemKey(item);

    if (
      (item.augmentSlots || []).length > 0 &&
      !selectedAugmentMap.has(itemKey)
    ) {
      warnings.push({
        type: 'item_has_slots_but_no_augment_selection',
        message: `${item.name} has augment slots, but no augment selection was provided.`,
        item
      });
    }
  }

  return {
    errors,
    warnings
  };
}

function validateGearset({
  equippedItems,
  selectedAugments = [],
  buildProfile = {}
}) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(equippedItems)) {
    throw new Error('validateGearset expected equippedItems to be an array.');
  }

  const slotValidation = validateSlotRules(equippedItems);
  errors.push(...slotValidation.errors);
  warnings.push(...slotValidation.warnings);

  const offhandValidation =
    validateOffhandRules(equippedItems, buildProfile);

  errors.push(...offhandValidation.errors);
  warnings.push(...offhandValidation.warnings);

  const setValidation =
    calculateSetBonuses(equippedItems);

  warnings.push(...setValidation.warnings);

  const augmentValidation =
    validateAugmentRules(
      equippedItems,
      selectedAugments,
      buildProfile
    );

  errors.push(...augmentValidation.errors);
  warnings.push(...augmentValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,

    slotUsage: slotValidation.slotUsage,

    activeSetBonuses:
      setValidation.activeSetBonuses,

    setProgress:
      setValidation.setProgress
  };
}

module.exports = {
  validateGearset,

  validateSlotRules,
  validateOffhandRules,
  validateAugmentRules,
  calculateSetBonuses,

  getGearTier,
  blocksOffhand
};