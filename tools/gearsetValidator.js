// gearsetValidator.js

const {
  getAllowedAugmentColorsForSlot
} = require('./augmentSearch');

const {
  parseBonusEffect
} = require('./bonusParser');

const {
  getResolvedItemEffects
} = require('./selectableEffects');

const {
  getCraftingSlotKey
} = require('./craftingAugmentPlan');

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

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSetId(setName) {
  return normalizeKey(setName);
}

function normalizeColor(value) {
  const text = normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');

  if (!text) {
    return null;
  }

  if (text.includes('colorless')) return 'colorless';
  if (text.includes('blue')) return 'blue';
  if (text.includes('red')) return 'red';
  if (text.includes('yellow')) return 'yellow';
  if (text.includes('green')) return 'green';
  if (text.includes('purple')) return 'purple';
  if (text.includes('orange')) return 'orange';

  return text;
}

function getItemKey(item = {}) {
  return item.itemKey || item.key || item.link || item.name;
}

function getAugmentKey(augment = {}) {
  return [
    augment.name,
    augment.link,
    augment.effect,
    Array.isArray(augment.effectsRaw)
      ? augment.effectsRaw.join('|')
      : ''
  ]
    .filter(Boolean)
    .join('|') || JSON.stringify(augment);
}

function getGearTier(item = {}) {
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

function normalizeEffectsInput(effects) {
  if (!effects) {
    return [];
  }

  if (Array.isArray(effects)) {
    return effects;
  }

  return [effects];
}

function getRawItemEffects(item = {}) {
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

function getItemEffects(item = {}, buildProfile = {}) {
  try {
    const resolved = getResolvedItemEffects(item, buildProfile);

    if (Array.isArray(resolved) && resolved.length > 0) {
      return resolved.map(cleanText).filter(Boolean);
    }
  } catch (error) {
    // Fall back to raw fields.
  }

  return getRawItemEffects(item);
}

function isSetRequirementLine(effect) {
  const cleaned = cleanText(effect);
  const text = normalizeText(cleaned);

  return (
    text.includes('pieces equipped') ||
    /^\d+\s+pieces?\s+equipped/i.test(cleaned)
  );
}

function getAugmentEffects(augment = {}) {
  return unique([
    ...normalizeEffectsInput(augment.effect),
    ...normalizeEffectsInput(augment.effectRaw),
    ...normalizeEffectsInput(augment.effects),
    ...normalizeEffectsInput(augment.effectsRaw),
    ...normalizeEffectsInput(augment.augmentEffect),
    ...normalizeEffectsInput(augment.selectedEffectRaw),
    ...normalizeEffectsInput(augment.description),
    ...normalizeEffectsInput(augment.raw)
  ]
    .map(cleanText)
    .filter(Boolean));
}

function getAugmentEffect(augment = {}) {
  return getAugmentEffects(augment)[0] || '';
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

function getAugmentColor(augment = {}) {
  return normalizeColor(
    augment.augmentColor ||
    augment.color ||
    augment.slotColor ||
    augment.type ||
    augment.slotType
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

  return Number.isNaN(value) ? 0 : value;
}

function normalizeSelectedAugmentEntry(selected = {}) {
  const augment = selected.augment || selected;

  const normalizedAugment = {
    ...augment,
    name: getAugmentName(augment),
    link: augment.link || selected.link || null,
    augmentColor:
      augment.augmentColor ||
      augment.color ||
      selected.augmentColor ||
      selected.color ||
      null,
    minLevel:
      augment.minLevel ??
      selected.minLevel ??
      null,
    effect:
      augment.effect ||
      selected.effect ||
      getAugmentEffect(augment),
    effectsRaw:
      augment.effectsRaw ||
      selected.effectsRaw ||
      (
        selected.effect
          ? [selected.effect]
          : undefined
      )
  };

  return {
    slotColor:
      selected.slotColor ||
      selected.slot ||
      augment.slotColor ||
      augment.slot ||
      null,
    augment: normalizedAugment
  };
}

function getItemAugmentSlots(item = {}) {
  const slots = Array.isArray(item.augmentSlots)
    ? item.augmentSlots
    : [];

  return slots
    .map(slot => {
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
    })
    .filter(slot => slot.color);
}

function itemHasAugmentSlotColor(item, slotColor) {
  const color = normalizeColor(slotColor);

  return getItemAugmentSlots(item)
    .some(slot => slot.color === color);
}

function augmentFitsSlotColor(augmentColor, slotColor) {
  const augment = normalizeColor(augmentColor);
  const slot = normalizeColor(slotColor);

  if (!augment || !slot) {
    return false;
  }

  if (augment === slot) {
    return true;
  }

  const allowedColors = getAllowedAugmentColorsForSlot(slot)
    .map(normalizeColor)
    .filter(Boolean);

  return allowedColors.includes(augment);
}

function findEquippedItem(itemMap, itemKey, itemName) {
  if (itemKey && itemMap.has(itemKey)) {
    return itemMap.get(itemKey);
  }

  for (const item of itemMap.values()) {
    if (item.name === itemName) {
      return item;
    }
  }

  return null;
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

function validateAugmentRules(
  equippedItems,
  selectedAugments,
  buildProfile = {}
) {
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
    const item = findEquippedItem(
      itemMap,
      result.itemKey,
      result.itemName
    );

    if (!item) {
      warnings.push({
        type: 'augment_for_unequipped_item',
        message: `Augments were selected for "${result.itemName}", but that item is not equipped.`,
        augmentSelection: result
      });

      continue;
    }

    const usedSlotColorsForItem = new Set();

    for (const selectedRaw of result.selectedAugments || []) {
      const selected = normalizeSelectedAugmentEntry(selectedRaw);
      const slotColor = normalizeColor(selected.slotColor);
      const augment = selected.augment;

      if (!augment || !augment.name) {
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

      if (!slotColor) {
        warnings.push({
          type: 'augment_missing_slot_color',
          message: `${augment.name} is selected for ${item.name}, but no slot color was provided.`,
          item,
          augment
        });

        continue;
      }

      if (usedSlotColorsForItem.has(slotColor)) {
        errors.push({
          type: 'multiple_augments_same_slot',
          message: `Multiple augments selected for ${item.name}'s ${slotColor} slot.`,
          item,
          slotColor
        });
      }

      usedSlotColorsForItem.add(slotColor);

      if (!itemHasAugmentSlotColor(item, slotColor)) {
        errors.push({
          type: 'item_does_not_have_augment_slot',
          message: `${item.name} does not have a ${slotColor} augment slot.`,
          item,
          slotColor,
          augment
        });
      }

      const augmentColor = getAugmentColor(augment);

      if (!augmentFitsSlotColor(augmentColor, slotColor)) {
        const allowedColors =
          getAllowedAugmentColorsForSlot(slotColor);

        errors.push({
          type: 'invalid_augment_color',
          message: `${augment.name} (${augment.augmentColor || augment.color}) cannot fit in ${item.name}'s ${slotColor} slot.`,
          item,
          slotColor,
          augment,
          allowedColors
        });
      }

      const maxLevel = buildProfile.maxLevel || 34;
      const augmentMinLevel = getAugmentMinLevel(augment);

      if (augmentMinLevel > maxLevel) {
        errors.push({
          type: 'augment_level_too_high',
          message: `${augment.name} requires level ${augmentMinLevel}, above build max level ${maxLevel}.`,
          augment,
          maxLevel
        });
      }

      const effect = getAugmentEffect(augment);

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
      getItemAugmentSlots(item).length > 0 &&
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

function getCraftingSlotInstanceKey(assignment = {}) {
  return [
    assignment.itemKey || assignment.itemName || 'unknown_item',
    assignment.craftingSlotKey || 'unknown_crafting_slot'
  ].join('::');
}

function itemHasCraftingSlot(item = {}, craftingSlotKey) {
  const craftingSlots = Array.isArray(item.craftingSlots)
    ? item.craftingSlots
    : [];

  return craftingSlots.some(slot =>
    getCraftingSlotKey(slot) === craftingSlotKey
  );
}

function validateCraftingAssignmentRules(
  equippedItems,
  craftingAssignments = []
) {
  const errors = [];
  const warnings = [];

  const itemMap = new Map();

  for (const item of equippedItems) {
    itemMap.set(getItemKey(item), item);
  }

  const usedCraftingSlotInstances = new Set();

  for (const assignment of craftingAssignments || []) {
    const item = findEquippedItem(
      itemMap,
      assignment.itemKey,
      assignment.itemName
    );

    if (!item) {
      warnings.push({
        type: 'crafting_assignment_for_unequipped_item',
        message: `Crafting augment "${assignment.augmentName || assignment.name}" was planned for "${assignment.itemName}", but that item is not equipped.`,
        assignment
      });

      continue;
    }

    if (!assignment.craftingSlotKey) {
      errors.push({
        type: 'crafting_assignment_missing_slot_key',
        message: `Crafting augment "${assignment.augmentName || assignment.name}" on "${assignment.itemName}" is missing craftingSlotKey.`,
        assignment
      });

      continue;
    }

    const instanceKey =
      assignment.craftingSlotInstanceKey ||
      getCraftingSlotInstanceKey(assignment);

    if (usedCraftingSlotInstances.has(instanceKey)) {
      errors.push({
        type: 'multiple_crafting_augments_same_slot',
        message: `Multiple crafting augments planned for ${assignment.itemName}'s ${assignment.craftingSlotKey} slot.`,
        assignment,
        craftingSlotInstanceKey: instanceKey
      });
    }

    usedCraftingSlotInstances.add(instanceKey);

    if (!itemHasCraftingSlot(item, assignment.craftingSlotKey)) {
      errors.push({
        type: 'item_does_not_have_crafting_slot',
        message: `${item.name} does not have crafting slot ${assignment.craftingSlotKey}.`,
        item,
        assignment
      });
    }

    if (!assignment.effect && !assignment.stackKey) {
      warnings.push({
        type: 'crafting_assignment_missing_effect',
        message: `Crafting augment "${assignment.augmentName || assignment.name}" has no effect or stackKey to validate.`,
        assignment
      });
    }
  }

  return {
    errors,
    warnings
  };
}

function getSourceLabel(source = {}) {
  if (source.type === 'item') {
    return source.name || 'unknown item';
  }

  if (source.type === 'augment') {
    return `${source.name || 'unknown augment'} slotted into ${source.itemName || 'unknown item'}`;
  }

  if (source.type === 'set_bonus') {
    return `${source.setName || 'unknown set'} set bonus`;
  }

  if (source.type === 'crafting_augment') {
    return `${source.name || 'unknown crafting augment'} planned for ${source.itemName || 'unknown item'}`;
  }

  return source.name || 'unknown source';
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

function parseEquippedItemBonuses(equippedItems, buildProfile = {}) {
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
          itemKey: getItemKey(item),
          slot: item.slot
        }
      );

      if (parsed) {
        bonuses.push(parsed);
      }
    }
  }

  return bonuses;
}

function parseSelectedAugmentBonuses(selectedAugments = []) {
  const bonuses = [];

  for (const result of selectedAugments || []) {
    const itemName =
      result.itemName ||
      result.name ||
      result.item?.name ||
      'unknown item';

    const itemKey =
      result.itemKey ||
      result.item?.itemKey ||
      result.item?.link ||
      itemName;

    for (const selectedRaw of result.selectedAugments || []) {
      const selected = normalizeSelectedAugmentEntry(selectedRaw);
      const augment = selected.augment;
      const effects = getAugmentEffects(augment);

      for (const effect of effects) {
        const parsed = parseBonusWithSource(
          effect,
          {
            type: 'augment',
            itemName,
            itemKey,
            slotColor: selected.slotColor,
            name: augment.name,
            link: augment.link || null
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

function parseActiveSetBonusBonuses(activeSetBonuses = []) {
  const bonuses = [];

  for (const setBonus of activeSetBonuses || []) {
    const effect = setBonus.effect || setBonus.effectRaw;

    if (!effect) {
      continue;
    }

    const parsed = parseBonusWithSource(
      effect,
      {
        type: 'set_bonus',
        setId: setBonus.setId,
        setName: setBonus.setName,
        tier: setBonus.tier,
        piecesRequired: setBonus.piecesRequired
      }
    );

    if (parsed) {
      bonuses.push(parsed);
    }
  }

  return bonuses;
}

function parseCraftingAssignmentBonuses(craftingAssignments = []) {
  const bonuses = [];

  for (const assignment of craftingAssignments || []) {
    const source = {
      type: 'crafting_augment',
      name: assignment.augmentName || assignment.name,
      itemName: assignment.itemName,
      itemKey: assignment.itemKey,
      craftingSlotKey: assignment.craftingSlotKey,
      craftingSlotInstanceKey:
        assignment.craftingSlotInstanceKey ||
        getCraftingSlotInstanceKey(assignment)
    };

    const effect = assignment.effect;

    let parsed = effect
      ? parseBonusWithSource(effect, source)
      : null;

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

function getAllBonusSources({
  equippedItems = [],
  selectedAugments = [],
  activeSetBonuses = [],
  craftingAssignments = [],
  buildProfile = {}
}) {
  return [
    ...parseEquippedItemBonuses(equippedItems, buildProfile),
    ...parseSelectedAugmentBonuses(selectedAugments),
    ...parseActiveSetBonusBonuses(activeSetBonuses),
    ...parseCraftingAssignmentBonuses(craftingAssignments)
  ];
}

function calculateStackingConflicts(bonuses = []) {
  const byStackKey = new Map();

  for (const bonus of bonuses || []) {
    if (!bonus.stackKey) {
      continue;
    }

    if (!byStackKey.has(bonus.stackKey)) {
      byStackKey.set(bonus.stackKey, []);
    }

    byStackKey.get(bonus.stackKey).push(bonus);
  }

  const stackingConflicts = [];
  const warnings = [];

  for (const [stackKey, group] of byStackKey.entries()) {
    if (group.length <= 1) {
      continue;
    }

    const sorted = group
      .slice()
      .sort((a, b) =>
        Number(b.value || 0) - Number(a.value || 0)
      );

    const winningBonus = sorted[0];
    const suppressedBonuses = sorted.slice(1);

    if (suppressedBonuses.length === 0) {
      continue;
    }

    const conflict = {
      type: 'stacking_conflict',
      stackKey,
      bonusType: winningBonus.bonusType,
      stat: winningBonus.stat,
      winningBonus,
      suppressedBonuses
    };

    stackingConflicts.push(conflict);

    warnings.push({
      type: 'stacking_conflict',
      message: `${winningBonus.raw} suppresses ${suppressedBonuses.map(bonus => bonus.raw).join(', ')} for ${stackKey}.`,
      stackKey,
      winningBonus,
      suppressedBonuses
    });
  }

  return {
    stackingConflicts,
    warnings
  };
}

function validateGearset({
  equippedItems,
  selectedAugments = [],
  craftingAssignments = [],
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

  const craftingAssignmentValidation =
    validateCraftingAssignmentRules(
      equippedItems,
      craftingAssignments,
      buildProfile
    );

  errors.push(...craftingAssignmentValidation.errors);
  warnings.push(...craftingAssignmentValidation.warnings);

  const bonusSources = getAllBonusSources({
    equippedItems,
    selectedAugments,
    activeSetBonuses: setValidation.activeSetBonuses,
    craftingAssignments,
    buildProfile
  });

  const stackingValidation =
    calculateStackingConflicts(bonusSources);

  warnings.push(...stackingValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,

    slotUsage: slotValidation.slotUsage,

    activeSetBonuses:
      setValidation.activeSetBonuses,

    setProgress:
      setValidation.setProgress,

    craftingAssignments,

    bonusSources,

    stackingConflicts:
      stackingValidation.stackingConflicts
  };
}

module.exports = {
  validateGearset,

  validateSlotRules,
  validateOffhandRules,
  validateAugmentRules,
  validateCraftingAssignmentRules,
  calculateSetBonuses,

  calculateStackingConflicts,
  getAllBonusSources,

  parseEquippedItemBonuses,
  parseSelectedAugmentBonuses,
  parseActiveSetBonusBonuses,
  parseCraftingAssignmentBonuses,

  getGearTier,
  blocksOffhand
};