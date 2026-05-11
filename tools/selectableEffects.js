// selectableEffects.js

const {
  parseBonusEffect
} = require('./bonusParser');

const BONUS_TYPES = [
  'Artifact',
  'Competence',
  'Enhancement',
  'Exceptional',
  'Insightful',
  'Quality',
  'Profane',
  'Sacred',
  'Alchemical',
  'Morale',
  'Luck',
  'Resistance',
  'Natural Armor',
  'Protection'
];

const CHOICE_STATS = [
  'Physical Resistance Rating',
  'Magical Resistance Rating',
  'Healing Amplification',
  'Spell Resistance',
  'Combat Mastery',
  'Armor-Piercing',
  'Doublestrike',
  'Doubleshot',
  'Deception',
  'Melee Power',
  'Ranged Power',
  'Spell DCs',
  'Spell DC',
  'Spell Power',
  'Spell Lore',
  'Spell Penetration',
  'Spell Focus Mastery',
  'Evocation Focus',
  'Necromancy Focus',
  'Constitution',
  'Intelligence',
  'Dexterity',
  'Strength',
  'Charisma',
  'Wisdom',
  'Stunning',
  'Accuracy',
  'Deadly',
  'Seeker',
  'PRR',
  'MRR',
  'Dodge',
  'Fortification',
  'Resistance',
  'Sheltering',
  'False Life'
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

function normalizeEffectKey(value) {
  return normalizeText(value)
    .replace(/\s+/g, '')
    .replace(/[.,]/g, '');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isChoiceGroupText(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes('one of the following') ||
    normalized.includes('nearly finishedone of the following') ||
    normalized.includes('nearly finished one of the following') ||
    normalized.includes('almost thereone of the following') ||
    normalized.includes('almost there one of the following')
  );
}

function stripChoiceGroupPrefix(text) {
  return cleanText(text)
    .replace(/nearly finished\s*/i, '')
    .replace(/almost there\s*/i, '')
    .replace(/one of the following ability bonuses\s*:/i, '')
    .replace(/one of the following\s*:/i, '')
    .replace(/one of the following\s*/i, '')
    .trim();
}

function buildChoiceRegex() {
  const bonusTypePattern = BONUS_TYPES
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  const statPattern = CHOICE_STATS
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  return new RegExp(
    `(?:\\b(${bonusTypePattern})\\s+)?\\b(${statPattern})\\s*([+-]?\\d+(?:\\.\\d+)?%?|[IVX]+)`,
    'gi'
  );
}

function insertMissingChoiceSpaces(text) {
  let result = cleanText(text);

  const markers = [
    ...BONUS_TYPES,
    ...CHOICE_STATS
  ]
    .sort((a, b) => b.length - a.length);

  for (const marker of markers) {
    const escaped = escapeRegex(marker);

    // Add a space when the wiki glues choices together:
    // +6Insightful Wisdom -> +6 Insightful Wisdom
    result = result.replace(
      new RegExp(`([+\\-]?\\d+(?:\\.\\d+)?%?|[IVX]+)(${escaped})`, 'gi'),
      '$1 $2'
    );
  }

  return result;
}

function parseChoicesFromGroupText(groupText) {
  if (!isChoiceGroupText(groupText)) {
    return [];
  }

  const text = insertMissingChoiceSpaces(
    stripChoiceGroupPrefix(groupText)
  );

  const bonusTypePattern = BONUS_TYPES
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  const statPattern = CHOICE_STATS
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  const choiceRegex = new RegExp(
    `(?:\\b(${bonusTypePattern})\\s+)?\\b(${statPattern})\\s*([+-]?\\d+(?:\\.\\d+)?%?|[IVX]+)`,
    'gi'
  );

  const choices = [];

  for (const match of text.matchAll(choiceRegex)) {
    const bonusType = cleanText(match[1] || '');
    const stat = cleanText(match[2] || '');
    const value = cleanText(match[3] || '');

    const raw = bonusType
      ? `${bonusType} ${stat} ${value}`
      : `${stat} ${value}`;

    const parsed = parseBonusEffect(raw);

    choices.push({
      raw,
      parsed
    });
  }

  return choices;
}

function textMatchesTerm(text, term) {
  return normalizeText(text).includes(normalizeText(term));
}

function scoreChoice(choice, buildProfile = {}) {
  let score = 0;

  const parsed = choice.parsed || {};
  const raw = choice.raw || '';
  const stat = parsed.stat || '';

  for (const primaryStat of buildProfile.primaryStats || []) {
    if (
      textMatchesTerm(stat, primaryStat) ||
      textMatchesTerm(raw, primaryStat)
    ) {
      score += 100;
    }
  }

  for (const term of buildProfile.priorityTerms || []) {
    if (
      textMatchesTerm(stat, term) ||
      textMatchesTerm(raw, term)
    ) {
      score += 25;
    }
  }

  for (const term of buildProfile.secondaryTerms || []) {
    if (
      textMatchesTerm(stat, term) ||
      textMatchesTerm(raw, term)
    ) {
      score += 8;
    }
  }

  for (const term of buildProfile.avoidTerms || []) {
    if (
      textMatchesTerm(stat, term) ||
      textMatchesTerm(raw, term)
    ) {
      score -= 50;
    }
  }

  if (parsed.value !== null && parsed.value !== undefined) {
    score += Number(parsed.value) * 0.1;
  }

  return score;
}

function chooseBestChoice(choices, buildProfile = {}) {
  if (!choices || choices.length === 0) {
    return null;
  }

  return [...choices]
    .map(choice => ({
      ...choice,
      choiceScore: scoreChoice(choice, buildProfile)
    }))
    .sort((a, b) => b.choiceScore - a.choiceScore)[0];
}

function getSelectableEffectGroupsFromEffects(effects, buildProfile = {}) {
  const groups = [];

  for (const effect of effects || []) {
    if (!isChoiceGroupText(effect)) {
      continue;
    }

    const choices = parseChoicesFromGroupText(effect);
    const chosen = chooseBestChoice(choices, buildProfile);

    groups.push({
      wrapper: effect,
      choices,
      chosen
    });
  }

  return groups;
}

function getRawItemEffects(item) {
  const namedEffects = item.namedEffects || [];
  const effects = item.effects || [];

  if (namedEffects.length > 0) {
    return namedEffects;
  }

  return effects;
}

function getResolvedItemEffects(item, buildProfile = {}) {
  const rawEffects = getRawItemEffects(item);
  const groups = getSelectableEffectGroupsFromEffects(
    rawEffects,
    buildProfile
  );

  if (groups.length === 0) {
    return rawEffects;
  }

  const allChoiceKeys = new Set();
  const chosenKeys = new Set();

  for (const group of groups) {
    for (const choice of group.choices || []) {
      allChoiceKeys.add(normalizeEffectKey(choice.raw));
    }

    if (group.chosen) {
      chosenKeys.add(normalizeEffectKey(group.chosen.raw));
    }
  }

  const resolvedEffects = [];

  for (const effect of rawEffects) {
    const effectKey = normalizeEffectKey(effect);

    // Remove wrapper line.
    if (isChoiceGroupText(effect)) {
      continue;
    }

    // If this effect is part of a selectable group,
    // keep only the chosen option.
    if (allChoiceKeys.has(effectKey)) {
      if (chosenKeys.has(effectKey)) {
        resolvedEffects.push(effect);
      }

      continue;
    }

    resolvedEffects.push(effect);
  }

  // If the chosen option was not already present as a standalone effect,
  // add it explicitly.
  for (const group of groups) {
    if (!group.chosen) {
      continue;
    }

    const chosenAlreadyPresent = resolvedEffects.some(effect =>
      normalizeEffectKey(effect) === normalizeEffectKey(group.chosen.raw)
    );

    if (!chosenAlreadyPresent) {
      resolvedEffects.push(group.chosen.raw);
    }
  }

  return resolvedEffects;
}

function getSelectableSummaryForItem(item, buildProfile = {}) {
  const rawEffects = getRawItemEffects(item);
  const groups = getSelectableEffectGroupsFromEffects(
    rawEffects,
    buildProfile
  );

  return groups.map(group => ({
    wrapper: group.wrapper,
    choices: group.choices.map(choice => choice.raw),
    chosen: group.chosen ? group.chosen.raw : null
  }));
}

module.exports = {
  getResolvedItemEffects,
  getSelectableSummaryForItem,
  getSelectableEffectGroupsFromEffects,
  parseChoicesFromGroupText,
  chooseBestChoice,
  isChoiceGroupText
};