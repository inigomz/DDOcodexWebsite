// bonusParser.js

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function isChoiceGroupWrapper(raw) {
  const text = normalizeText(raw);

  return (
    text.includes('one of the following') ||
    text.includes('nearly finishedone of the following') ||
    text.includes('almost thereone of the following')
  );
}

function romanToInt(roman) {
  const values = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000
  };

  const text = String(roman || '').toUpperCase();
  let total = 0;

  for (let i = 0; i < text.length; i += 1) {
    const current = values[text[i]] || 0;
    const next = values[text[i + 1]] || 0;

    if (next > current) {
      total -= current;
    } else {
      total += current;
    }
  }

  return total;
}

function parseValue(valueText) {
  const cleaned = cleanText(valueText);
  const isPercent = cleaned.includes('%');

  const value = Number(
    cleaned
      .replace('%', '')
      .replace('+', '')
      .trim()
  );

  return {
    value,
    isPercent
  };
}

const BONUS_TYPE_ALIASES = {
  default: 'Default',

  enhancement: 'Enhancement',
  equipment: 'Equipment',
  competence: 'Competence',
  quality: 'Quality',
  insightful: 'Insightful',
  insight: 'Insightful',
  exceptional: 'Exceptional',
  artifact: 'Artifact',
  profane: 'Profane',
  sacred: 'Sacred',
  morale: 'Morale',
  luck: 'Luck',
  legendary: 'Legendary',
  alchemical: 'Alchemical',
  circumstance: 'Circumstance',
  guild: 'Guild',
  mythic: 'Mythic',
  reaper: 'Reaper',
  festive: 'Festive'
};

function canonicalizeBonusType(rawBonusType, fallback = 'Default') {
  const key = normalizeText(rawBonusType);

  if (!key) {
    return fallback;
  }

  return BONUS_TYPE_ALIASES[key] || cleanText(rawBonusType);
}

function stripKnownItemPrefixes(stat) {
  let result = cleanText(stat);

  result = result.replace(/^sapphire of /i, '');
  result = result.replace(/^diamond of /i, '');
  result = result.replace(/^topaz of /i, '');
  result = result.replace(/^ruby of /i, '');
  result = result.replace(/^emerald of /i, '');
  result = result.replace(/^amethyst of /i, '');
  result = result.replace(/^legendary /i, '');

  return cleanText(result);
}

function canonicalizeStat(rawStat, rawEffect = '') {
  let stat = stripKnownItemPrefixes(rawStat);

  stat = stat
    .replace(/^bonus to /i, '')
    .replace(/^the /i, '')
    .replace(/\s+bonus$/i, '')
    .trim();

  const text = normalizeText(stat);
  const effectText = normalizeText(`${rawEffect} ${stat}`);

  if (!text) {
    return stat;
  }

  // Ability / defensive abbreviations
  if (effectText.includes('physical resistance rating')) {
    return 'PRR';
  }

  if (effectText.includes('magical resistance rating')) {
    return 'MRR';
  }

  if (
    effectText.includes('positive healing amplification') ||
    effectText.includes('healing amplification')
  ) {
    return 'Healing Amplification';
  }

  if (
    effectText.includes('maximum hp') ||
    effectText.includes('maximum hit points') ||
    effectText.includes('false life')
  ) {
    return 'False Life';
  }

  // Offensive aliases
  if (
    text === 'attack' ||
    text === 'to attack' ||
    effectText.includes('bonus to attack')
  ) {
    return 'Accuracy';
  }

  if (
    text.includes('critical confirmation and critical damage') ||
    text.includes('critical confirmation') ||
    text.includes('critical damage')
  ) {
    return 'Seeker';
  }

  if (
    text.includes('bypass enemy fortification') ||
    text.includes('fortification bypass') ||
    text.includes('bypass fortification') ||
    text.includes('armor-piercing') ||
    text.includes('armor piercing')
  ) {
    return 'Armor-Piercing';
  }

  // Tactical DC aliases
  if (
    text.includes('stunning dcs') ||
    text.includes('stunning dc') ||
    text === 'stunning'
  ) {
    return 'Stunning';
  }

  if (
    text.includes('trip dcs') ||
    text.includes('trip dc') ||
    text === 'trip'
  ) {
    return 'Trip';
  }

  if (
    text.includes('sunder dcs') ||
    text.includes('sunder dc') ||
    text === 'sunder'
  ) {
    return 'Sunder';
  }

  if (
    text.includes('assassinate dcs') ||
    text.includes('assassinate dc') ||
    text === 'assassinate'
  ) {
    return 'Assassinate';
  }

  if (
    effectText.includes('dc to resist') &&
    (
      effectText.includes('stunning blow') ||
      effectText.includes('stunning fist') ||
      effectText.includes('improved trip') ||
      effectText.includes('trip') ||
      effectText.includes('improved sunder') ||
      effectText.includes('sunder')
    )
  ) {
    return 'Combat Mastery';
  }

  if (
    text.includes('tactical dcs') ||
    text.includes('tactical dc')
  ) {
    return 'Tactical DC';
  }

  // Common cleanup
  if (text === 'positive healing amplification') {
    return 'Healing Amplification';
  }

  if (text === 'attack and damage') {
    return 'Attack and Damage';
  }

  return cleanText(stat);
}

function makeParsedBonus({
  raw,
  parser,
  bonusType,
  bonusTypeInferred,
  stat,
  value,
  valueText,
  isPercent
}) {
  const cleanRaw = cleanText(raw);
  const canonicalBonusType = canonicalizeBonusType(bonusType);
  const canonicalStat = canonicalizeStat(stat, cleanRaw);

  return {
    raw: cleanRaw,
    parsed: true,
    parser,
    bonusType: canonicalBonusType,
    bonusTypeInferred: Boolean(bonusTypeInferred),
    stat: canonicalStat,
    value,
    valueText,
    isPercent,
    family: canonicalStat,
    stackKey: `${canonicalBonusType}:${canonicalStat}`
  };
}

function parseExplicitBonusTo(raw) {
  const text = cleanText(raw);

  // Examples:
  // +30 Profane Bonus to Physical Resistance Rating
  // +15% Artifact bonus to Doublestrike
  // +17 Enhancement bonus to Stunning DCs
  // Adds Armor-Piercing. +23% Enhancement bonus to bypass enemy Fortification
  const match = text.match(
    /([+-]?\d+(?:\.\d+)?%?)\s+([A-Za-z -]+?)\s+bonus\s+to\s+(.+?)(?:\.|$)/i
  );

  if (!match) {
    return null;
  }

  const valueText = match[1];
  const bonusType = match[2];
  const stat = match[3];

  const parsedValue = parseValue(valueText);

  return makeParsedBonus({
    raw,
    parser: 'explicit_bonus_to',
    bonusType,
    bonusTypeInferred: false,
    stat,
    value: parsedValue.value,
    valueText,
    isPercent: parsedValue.isPercent
  });
}

function parseExplicitBonusWithoutWordBonus(raw) {
  const text = cleanText(raw);

  // Example malformed wiki line:
  // +3 Quality to Strength
  const match = text.match(
    /^([+-]?\d+(?:\.\d+)?%?)\s+([A-Za-z -]+?)\s+to\s+(.+?)(?:\.|$)/i
  );

  if (!match) {
    return null;
  }

  const valueText = match[1];
  const bonusType = match[2];
  const stat = match[3];

  if (!BONUS_TYPE_ALIASES[normalizeText(bonusType)]) {
    return null;
  }

  const parsedValue = parseValue(valueText);

  return makeParsedBonus({
    raw,
    parser: 'explicit_bonus_to_missing_bonus_word',
    bonusType,
    bonusTypeInferred: false,
    stat,
    value: parsedValue.value,
    valueText,
    isPercent: parsedValue.isPercent
  });
}

function parseEnhancementBonus(raw) {
  const text = cleanText(raw);

  const match = text.match(
    /^([+-]?\d+(?:\.\d+)?)\s+Enhancement\s+Bonus$/i
  );

  if (!match) {
    return null;
  }

  const valueText = match[1];
  const parsedValue = parseValue(valueText);

  return makeParsedBonus({
    raw,
    parser: 'enhancement_bonus',
    bonusType: 'Enhancement',
    bonusTypeInferred: false,
    stat: 'Weapon Enhancement Bonus',
    value: parsedValue.value,
    valueText,
    isPercent: false
  });
}

function parsePrefixBonusType(raw) {
  const text = cleanText(raw);

  // Examples:
  // Quality Wisdom +3
  // Insightful Armor-Piercing 10%
  // Competence Healing Amplification +57
  const match = text.match(
    /^(Quality|Insightful|Insight|Exceptional|Competence|Enhancement|Equipment|Profane|Artifact|Legendary|Alchemical|Sacred|Morale|Luck|Festive|Mythic|Reaper)\s+(.+?)\s+([+-]?\d+(?:\.\d+)?%?)$/i
  );

  if (!match) {
    return null;
  }

  const bonusType = match[1];
  const stat = match[2];
  const valueText = match[3];

  const parsedValue = parseValue(valueText);

  return makeParsedBonus({
    raw,
    parser: 'prefix_bonus_type',
    bonusType,
    bonusTypeInferred: false,
    stat,
    value: parsedValue.value,
    valueText,
    isPercent: parsedValue.isPercent
  });
}

function parseRomanBonus(raw) {
  const text = cleanText(raw);

  const match = text.match(/^(.+?)\s+([IVXLCDM]+)$/i);

  if (!match) {
    return null;
  }

  const stat = match[1];
  const roman = match[2].toUpperCase();
  const value = romanToInt(roman);

  if (!value) {
    return null;
  }

  return makeParsedBonus({
    raw,
    parser: 'roman_bonus',
    bonusType: 'Default',
    bonusTypeInferred: true,
    stat,
    value,
    valueText: roman,
    isPercent: false
  });
}

function parseSimpleNumericBonus(raw) {
  const text = cleanText(raw);

  // Example:
  // Wisdom +14
  // Stunning +16
  // Doublestrike 15%
  // Sapphire of Stunning +16
  const match = text.match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?%?)$/i);

  if (!match) {
    return null;
  }

  const stat = match[1];
  const valueText = match[2];

  const parsedValue = parseValue(valueText);

  return makeParsedBonus({
    raw,
    parser: 'simple_numeric_bonus',
    bonusType: 'Default',
    bonusTypeInferred: true,
    stat,
    value: parsedValue.value,
    valueText,
    isPercent: parsedValue.isPercent
  });
}

function parseKnownEmbeddedBonus(raw) {
  const text = cleanText(raw);

  // Example:
  // A Treatise on Battle (Combat Mastery +11 Immunity to Fear)
  const combatMasteryMatch = text.match(/Combat Mastery\s+([+-]?\d+)/i);

  if (combatMasteryMatch) {
    const valueText = combatMasteryMatch[1];
    const parsedValue = parseValue(valueText);

    return makeParsedBonus({
      raw,
      parser: 'known_embedded_bonus',
      bonusType: 'Default',
      bonusTypeInferred: true,
      stat: 'Combat Mastery',
      value: parsedValue.value,
      valueText,
      isPercent: false
    });
  }

  return null;
}

function parseBonusEffect(raw) {
  const text = cleanText(raw);

  if (!text) {
    return {
      raw,
      parsed: false,
      reason: 'empty'
    };
  }

  if (isChoiceGroupWrapper(text)) {
    return {
      raw: text,
      parsed: false,
      reason: 'choice_group_wrapper'
    };
  }

  const parsers = [
    parseEnhancementBonus,
    parseExplicitBonusTo,
    parseExplicitBonusWithoutWordBonus,
    parsePrefixBonusType,
    parseKnownEmbeddedBonus,
    parseRomanBonus,
    parseSimpleNumericBonus
  ];

  for (const parser of parsers) {
    const result = parser(text);

    if (result) {
      return result;
    }
  }

  return {
    raw: text,
    parsed: false,
    reason: 'unrecognized'
  };
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

function parseEffects(effects, source = null) {
  return normalizeEffectsInput(effects).map(effect => {
    const parsed = parseBonusEffect(effect);

    if (source) {
      return {
        ...parsed,
        source
      };
    }

    return parsed;
  });
}

function parseItemBonuses(item) {
  const effects = [
    ...(item.effects || []),
    ...(item.effectsRaw || []),
    ...(item.enhancements || []),
    ...(item.namedEffects || [])
  ];

  return parseEffects(
    effects,
    {
      type: 'item',
      name: item.name,
      itemKey: item.itemKey || item.link || item.name
    }
  );
}

function findStackingConflicts(parsedBonuses) {
  const groups = new Map();

  for (const bonus of parsedBonuses || []) {
    if (
      !bonus ||
      !bonus.parsed ||
      !bonus.stackKey ||
      bonus.value === null ||
      bonus.value === undefined
    ) {
      continue;
    }

    if (!groups.has(bonus.stackKey)) {
      groups.set(bonus.stackKey, []);
    }

    groups.get(bonus.stackKey).push(bonus);
  }

  const conflicts = [];

  for (const [stackKey, bonuses] of groups.entries()) {
    if (bonuses.length <= 1) {
      continue;
    }

    const sorted = [...bonuses].sort((a, b) => {
      const aValue = Number(a.value) || 0;
      const bValue = Number(b.value) || 0;

      return bValue - aValue;
    });

    const winningBonus = sorted[0];
    const suppressedBonuses = sorted.slice(1);

    conflicts.push({
      stackKey,
      bonusType: winningBonus.bonusType,
      stat: winningBonus.stat,
      winningBonus,
      suppressedBonuses
    });
  }

  return conflicts;
}

module.exports = {
  parseBonusEffect,
  parseEffects,
  parseItemBonuses,
  findStackingConflicts,

  cleanText,
  canonicalizeStat,
  canonicalizeBonusType
};