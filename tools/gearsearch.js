// gearsearch.js

const fs = require('fs');
const path = require('path');

const {
  getResolvedItemEffects
} = require('./selectableEffects');

const DEFAULT_ITEM_DIR = path.join(
  __dirname,
  '..',
  'itemlist'
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readJsonFile(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function getJsonFilesRecursive(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...getJsonFilesRecursive(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeLoadedJson(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.items)) {
    return data.items;
  }

  if (Array.isArray(data.results)) {
    return data.results;
  }

  if (Array.isArray(data.gear)) {
    return data.gear;
  }

  return [];
}

function loadAllItems(itemDir = DEFAULT_ITEM_DIR) {
  const files = getJsonFilesRecursive(itemDir);
  const items = [];

  for (const file of files) {
    const data = readJsonFile(file);
    const loadedItems = normalizeLoadedJson(data);

    for (const item of loadedItems) {
      items.push({
        ...item,
        sourceFile: item.sourceFile || file
      });
    }
  }

  return items;
}

function getItemKey(item) {
  return item.itemKey || item.key || item.link || item.name;
}

function getItemName(item) {
  return cleanText(item.name || item.itemName || '');
}

function getItemLevel(item) {
  const possibleValues = [
    item.minLevel,
    item.minimumLevel,
    item.level,
    item.ml,
    item.requiredLevel
  ];

  for (const value of possibleValues) {
    const number = Number(value);

    if (!Number.isNaN(number) && number > 0) {
      return number;
    }
  }

  return 0;
}

function getArrayText(value) {
  if (Array.isArray(value)) {
    return value.join(' ');
  }

  return value || '';
}

function normalizeSlot(value) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  if (['eyes', 'goggles'].includes(text)) {
    return 'eyes';
  }

  if (['neck', 'necklace'].includes(text)) {
    return 'neck';
  }

  if (['trinket'].includes(text)) {
    return 'trinket';
  }

  if (['finger', 'ring'].includes(text)) {
    return 'finger';
  }

  if (['hands', 'gloves', 'gauntlets'].includes(text)) {
    return 'hands';
  }

  if (
    [
      'armor',
      'body',
      'body / armor',
      'robe',
      'robes',
      'outfit',
      'outfits',
      'docent',
      'light armor',
      'medium armor',
      'heavy armor'
    ].includes(text)
  ) {
    return 'armor';
  }

  if (['feet', 'boots'].includes(text)) {
    return 'feet';
  }

  if (['waist', 'belt'].includes(text)) {
    return 'waist';
  }

  if (['wrists', 'wrist', 'bracers'].includes(text)) {
    return 'wrists';
  }

  if (['back', 'cloak'].includes(text)) {
    return 'back';
  }

  if (['head', 'helmet', 'helm', 'hat'].includes(text)) {
    return 'head';
  }

  if (
    [
      'weapon',
      'main hand',
      'mainhand',
      'handwraps',
      'quarterstaff',
      'falchion',
      'great axe',
      'great sword',
      'maul'
    ].includes(text)
  ) {
    return 'weapon';
  }

  if (
    [
      'offhand',
      'off hand',
      'shield',
      'orb',
      'rune arm',
      'runearm'
    ].includes(text)
  ) {
    return 'offhand';
  }

  return text;
}

function getItemTypeBlob(item) {
  return [
    item.type,
    item.itemType,
    item.category,
    item.categories,
    item.subtype,
    item.subtypes,
    item.itemSubtype,
    item.itemSubtypes,
    item.weaponType,
    item.weaponTypes,
    item.armorType,
    item.armorTypes,
    item.armorCategory,
    item.armorClass,
    item.tags,
    item.slot,
    item.slots
  ]
    .map(getArrayText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getItemSlots(item) {
  const values = [
    item.slot,
    item.slots,
    item.equipmentSlot,
    item.equipmentSlots,
    item.itemSlot,
    item.itemSlots
  ];

  const slots = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        slots.push(normalizeSlot(entry));
      }
    } else if (value) {
      slots.push(normalizeSlot(value));
    }
  }

  return unique(slots);
}

function itemMatchesSlot(item, requestedSlot) {
  if (!requestedSlot) {
    return true;
  }

  const normalizedRequestedSlot = normalizeSlot(requestedSlot);
  const slots = getItemSlots(item);

  if (slots.includes(normalizedRequestedSlot)) {
    return true;
  }

  const name = normalizeText(getItemName(item));
  const typeText = getItemTypeBlob(item);

  if (normalizedRequestedSlot === 'armor') {
    return (
      slots.includes('armor') ||
      typeText.includes('armor') ||
      typeText.includes('robe') ||
      typeText.includes('outfit') ||
      name.includes('robe') ||
      name.includes('outfit') ||
      name.includes('vestment') ||
      name.includes('vestments') ||
      name.includes('breastplate') ||
      name.includes('plate') ||
      name.includes('armor') ||
      name.includes('mail') ||
      name.includes('leather')
    );
  }

  if (normalizedRequestedSlot === 'weapon') {
    return (
      slots.includes('weapon') ||
      typeText.includes('weapon') ||
      typeText.includes('handwrap') ||
      typeText.includes('quarterstaff')
    );
  }

  return false;
}

function normalizeWeaponSubtype(value) {
  const text = normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');

  if (text.includes('handwrap')) {
    return 'handwraps';
  }

  if (text.includes('quarterstaff')) {
    return 'quarterstaff';
  }

  if (text.includes('falchion')) {
    return 'falchion';
  }

  if (text.includes('great axe') || text.includes('greataxe')) {
    return 'great_axe';
  }

  if (text.includes('great sword') || text.includes('greatsword')) {
    return 'great_sword';
  }

  if (text.includes('maul')) {
    return 'maul';
  }

  if (text.includes('long bow') || text.includes('longbow')) {
    return 'long_bow';
  }

  if (text.includes('short bow') || text.includes('shortbow')) {
    return 'short_bow';
  }

  return text.replace(/\s+/g, '_');
}

function itemMatchesWeaponSubtypes(item, requestedSubtypes = []) {
  if (!requestedSubtypes || requestedSubtypes.length === 0) {
    return true;
  }

  const itemText = [
    getItemName(item),
    getItemTypeBlob(item),
    item.link
  ]
    .filter(Boolean)
    .join(' ');

  const normalizedItemText = normalizeText(itemText);

  return requestedSubtypes.some(subtype => {
    const normalizedSubtype = normalizeWeaponSubtype(subtype);

    if (normalizedSubtype === 'handwraps') {
      return (
        normalizedItemText.includes('handwrap') ||
        normalizedItemText.includes('unarmed')
      );
    }

    return normalizedItemText.includes(
      normalizedSubtype.replace(/_/g, ' ')
    );
  });
}

function detectArmorType(item) {
  const explicitFields = [
    item.armorType,
    item.armorTypes,
    item.armorCategory,
    item.armorClass,
    item.subtype,
    item.subtypes,
    item.itemSubtype,
    item.itemSubtypes,
    item.type,
    item.itemType,
    item.category,
    item.categories,
    item.tags
  ];

  const explicitText = explicitFields
    .map(getArrayText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const nameText = normalizeText(getItemName(item));
  const combined = `${explicitText} ${nameText}`;

  if (
    combined.includes('robe') ||
    combined.includes('robes') ||
    combined.includes('outfit') ||
    combined.includes('outfits') ||
    combined.includes('cloth armor') ||
    combined.includes('cloth') ||
    combined.includes('raiment') ||
    combined.includes('vestment') ||
    combined.includes('vestments') ||
    combined.includes('garments') ||
    combined.includes('garb')
  ) {
    return 'cloth';
  }

  if (
    combined.includes('heavy armor') ||
    combined.includes('full plate') ||
    combined.includes('plate armor') ||
    combined.includes('plate mail') ||
    combined.includes('half plate') ||
    combined.includes('heavy plate')
  ) {
    return 'heavy';
  }

  if (
    combined.includes('medium armor') ||
    combined.includes('breastplate') ||
    combined.includes('scale mail') ||
    combined.includes('scalemail') ||
    combined.includes('chainmail') ||
    combined.includes('chain mail') ||
    combined.includes('hide armor')
  ) {
    return 'medium';
  }

  if (
    combined.includes('light armor') ||
    combined.includes('leather armor') ||
    combined.includes('studded leather') ||
    combined.includes('chain shirt') ||
    combined.includes('light mail')
  ) {
    return 'light';
  }

  return null;
}

function itemMatchesArmorPreference(item, query = {}) {
  const requestedSlot = normalizeSlot(query.slot);
  const buildProfile = query.buildProfile || {};
  const armorPreference = buildProfile.armorPreference || {};

  if (requestedSlot !== 'armor') {
    return true;
  }

  if (!armorPreference.enforceArmorType) {
    return true;
  }

  const allowedArmorTypes =
    armorPreference.allowedArmorTypes || [];

  if (allowedArmorTypes.length === 0) {
    return true;
  }

  const detectedArmorType = detectArmorType(item);

  if (!detectedArmorType) {
    return false;
  }

  return allowedArmorTypes.some(type =>
    normalizeText(type) === normalizeText(detectedArmorType)
  );
}

function getRawEffects(item) {
  const effects = [];

  const possibleFields = [
    item.effects,
    item.effectsRaw,
    item.enhancements,
    item.namedEffects,
    item.itemEffects,
    item.effectRaw
  ];

  for (const field of possibleFields) {
    if (Array.isArray(field)) {
      effects.push(...field);
    } else if (field) {
      effects.push(field);
    }
  }

  return effects.map(cleanText).filter(Boolean);
}

function isSetRequirementLine(effect) {
  const cleaned = cleanText(effect);
  const text = normalizeText(cleaned);

  return (
    text.includes('pieces equipped') ||
    /^\d+\s+pieces?\s+equipped/i.test(cleaned) ||
    /^\d+\s+piece\s+equipped/i.test(cleaned)
  );
}

function getResolvedEffectsSafe(item, buildProfile = {}) {
  try {
    const resolved = getResolvedItemEffects(item, buildProfile);

    if (Array.isArray(resolved) && resolved.length > 0) {
      return resolved
        .map(cleanText)
        .filter(Boolean);
    }
  } catch (error) {
    // Fall back to raw effects.
  }

  return getRawEffects(item);
}

function getScorableEffects(item, buildProfile = {}) {
  return getResolvedEffectsSafe(item, buildProfile)
    .filter(effect => !isSetRequirementLine(effect));
}

function textMatchesTerm(text, term) {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm) {
    return false;
  }

  if (
    normalizedTerm === 'resistance' &&
    (
      normalizedText.includes('acid resistance') ||
      normalizedText.includes('cold resistance') ||
      normalizedText.includes('electric resistance') ||
      normalizedText.includes('fire resistance') ||
      normalizedText.includes('sonic resistance') ||
      normalizedText.includes('elemental resistance')
    )
  ) {
    return false;
  }

  return normalizedText.includes(normalizedTerm);
}

function effectMatchesAnyTerm(effect, terms = []) {
  return terms.some(term =>
    textMatchesTerm(effect, term)
  );
}

function getFilteredEffectsForBuild(item, buildProfile = {}) {
  const effects = getScorableEffects(item, buildProfile);

  const usefulTerms = [
    ...(buildProfile.primaryStats || []),
    ...(buildProfile.priorityTerms || []),
    ...(buildProfile.secondaryTerms || [])
  ];

  const avoidTerms = buildProfile.avoidTerms || [];

  return effects.filter(effect => {
    if (effectMatchesAnyTerm(effect, avoidTerms)) {
      return false;
    }

    return effectMatchesAnyTerm(effect, usefulTerms);
  });
}

function getSetNames(item) {
  const values = [
    item.set,
    item.setName,
    item.sets,
    item.setBonuses,
    item.setBonus
  ];

  const setNames = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          setNames.push(entry);
        } else if (entry && entry.name) {
          setNames.push(entry.name);
        } else if (entry && entry.setName) {
          setNames.push(entry.setName);
        }
      }
    } else if (typeof value === 'string') {
      setNames.push(value);
    } else if (value && value.name) {
      setNames.push(value.name);
    } else if (value && value.setName) {
      setNames.push(value.setName);
    }
  }

  return unique(setNames.map(cleanText));
}

function getAugmentSlots(item) {
  const slots = item.augmentSlots || item.augments || [];

  if (!Array.isArray(slots)) {
    return [];
  }

  return slots.map(slot => {
    if (typeof slot === 'string') {
      return slot;
    }

    return (
      slot.color ||
      slot.slotColor ||
      slot.type ||
      slot.name ||
      slot.slotType ||
      slot.augmentType
    );
  }).filter(Boolean);
}

function getCraftingSlots(item) {
  return Array.isArray(item.craftingSlots)
    ? item.craftingSlots
    : [];
}

function normalizeSlotName(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');
}

function getSpecialAugmentSlots(item) {
  const augmentSlots = getAugmentSlots(item);

  return augmentSlots.filter(slot => {
    const text = normalizeSlotName(slot);

    return (
      text.includes('sun') ||
      text.includes('moon')
    );
  });
}

function hasSunMoonAugmentSlots(item) {
  return getSpecialAugmentSlots(item).length > 0;
}

function hasLamordiaCraftingSlots(item) {
  return getCraftingSlots(item).some(slot =>
    normalizeText(slot.system) === 'lamordia'
  );
}

function hasViktraniumCraftingSlots(item) {
  return getCraftingSlots(item).some(slot => {
    const system = normalizeText(slot.system);

    return (
      system.includes('viktranium') ||
      system.includes('lamordia')
    );
  });
}

function getModernSystemSupport(item) {
  const craftingSlots = getCraftingSlots(item);
  const specialAugmentSlots = getSpecialAugmentSlots(item);

  const systems = [];

  if (hasLamordiaCraftingSlots(item)) {
    systems.push('Lamordia crafting');
  }

  if (hasViktraniumCraftingSlots(item)) {
    systems.push('Viktranium crafting');
  }

  if (specialAugmentSlots.some(slot =>
    normalizeSlotName(slot).includes('sun')
  )) {
    systems.push('Sun augment slot');
  }

  if (specialAugmentSlots.some(slot =>
    normalizeSlotName(slot).includes('moon')
  )) {
    systems.push('Moon augment slot');
  }

  return {
    hasModernSupport: systems.length > 0,
    systems: unique(systems),
    craftingSlots,
    specialAugmentSlots
  };
}

function scoreModernSystemSupport(item, query = {}) {
  const support = getModernSystemSupport(item);

  if (!support.hasModernSupport) {
    return 0;
  }

  let score = 0;

  // Candidate discovery bonus only.
  // Final usefulness is handled later by gearSetBuilder.js.
  if (support.systems.includes('Lamordia crafting')) {
    score += 18;
  }

  if (support.systems.includes('Viktranium crafting')) {
    score += 18;
  }

  if (support.systems.includes('Sun augment slot')) {
    score += 15;
  }

  if (support.systems.includes('Moon augment slot')) {
    score += 15;
  }

  // Do not let system support completely overpower real item effects.
  return Math.min(score, 40);
}

function scoreItem(item, query = {}) {
  const buildProfile = query.buildProfile || {};
  const effects = getScorableEffects(item, buildProfile);
  const filteredEffects = getFilteredEffectsForBuild(item, buildProfile);

  let score = 0;

  if (filteredEffects.length === 0) {
    score -= 80;
  }

  for (const effect of effects) {
    for (const stat of buildProfile.primaryStats || []) {
      if (textMatchesTerm(effect, stat)) {
        score += 60;
      }
    }

    for (const term of buildProfile.priorityTerms || []) {
      if (textMatchesTerm(effect, term)) {
        score += 30;
      }
    }

    for (const term of buildProfile.secondaryTerms || []) {
      if (textMatchesTerm(effect, term)) {
        score += 12;
      }
    }

    for (const term of buildProfile.avoidTerms || []) {
      if (textMatchesTerm(effect, term)) {
        score -= 80;
      }
    }
  }

  for (const term of query.shouldInclude || []) {
    if (effects.some(effect => textMatchesTerm(effect, term))) {
      score += 10;
    }
  }

  if (query.slot === 'armor') {
    const armorPreference = buildProfile.armorPreference || {};
    const detectedArmorType = detectArmorType(item);

    if (
      armorPreference.preferredArmorTypes &&
      armorPreference.preferredArmorTypes.includes(detectedArmorType)
    ) {
      score += 25;
    }

    if (
      armorPreference.avoidArmorTypes &&
      armorPreference.avoidArmorTypes.includes(detectedArmorType)
    ) {
      score -= 100;
    }
  }

  // Keep these bonuses small. Actual augment/crafting optimization
  // happens later in augmentSelection.js and gearSetBuilder.js.
  score += getAugmentSlots(item).length * 1.5;
  score += getCraftingSlots(item).length * 2;
  score += getSetNames(item).length * 2;

  // Newer content / advanced augment system discovery bonus.
  // This helps Lamordia/Viktranium/Sun/Moon-compatible items reach
  // the candidate pool without treating those slots as active effects.
  score += scoreModernSystemSupport(item, query);

  const level = getItemLevel(item);

  if (level > 0) {
    score += Math.min(level, query.maxLevel || 34) * 0.05;
  }

  return score;
}

function itemMatchesQuery(item, query = {}) {
  const maxLevel = query.maxLevel || 34;

  if (getItemLevel(item) > maxLevel) {
    return false;
  }

  if (!itemMatchesSlot(item, query.slot)) {
    return false;
  }

  if (!itemMatchesArmorPreference(item, query)) {
    return false;
  }

  if (!itemMatchesWeaponSubtypes(item, query.itemSubtypes || [])) {
    return false;
  }

  return true;
}

function searchItems(items, query = {}) {
  const limit = query.limit || 10;

  return (items || [])
    .filter(item =>
      itemMatchesQuery(item, query)
    )
    .map(item => ({
      ...item,
      itemKey: getItemKey(item),
      searchScore: scoreItem(item, query)
    }))
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, limit);
}

function compactItemForAI(item, buildProfile = {}) {
  const filteredEffects = getFilteredEffectsForBuild(
    item,
    buildProfile
  );

  const armorType = detectArmorType(item);

  return {
    itemKey: getItemKey(item),
    name: item.name,
    link: item.link || null,

    minLevel: getItemLevel(item) || null,

    slot: item.slot || item.slots || null,
    slots: getItemSlots(item),

    armorType,

    itemType: item.itemType || item.type || null,
    itemSubtypes:
      item.itemSubtypes ||
      item.subtypes ||
      item.subtype ||
      null,

    effects: filteredEffects,

    augmentSlots: getAugmentSlots(item),
    craftingSlots: getCraftingSlots(item),
    modernSystemSupport: getModernSystemSupport(item),

    sets: getSetNames(item),

    searchScore: item.searchScore
  };
}

module.exports = {
  loadAllItems,
  searchItems,
  compactItemForAI,

  getItemLevel,
  getItemSlots,
  getItemKey,

  detectArmorType,
  itemMatchesArmorPreference,

  isSetRequirementLine,
  getResolvedEffectsSafe,
  getScorableEffects,
  getFilteredEffectsForBuild,

  getSpecialAugmentSlots,
  hasSunMoonAugmentSlots,
  getModernSystemSupport,
  scoreModernSystemSupport,

  scoreItem
};