// buildProfile.js

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function includesAny(text, terms) {
  const normalized = normalizeText(text);

  return terms.some(term =>
    normalized.includes(normalizeText(term))
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function detectMaxLevel(goal) {
  const text = normalizeText(goal);

  const levelMatch = text.match(/level\s+(\d+)/i);

  if (levelMatch) {
    return Number(levelMatch[1]);
  }

  const maxLevelMatch = text.match(/max(?:imum)?\s*level\s+(\d+)/i);

  if (maxLevelMatch) {
    return Number(maxLevelMatch[1]);
  }

  return 34;
}

function detectPrimaryStats(goal) {
  const text = normalizeText(goal);
  const primaryStats = [];

  const statChecks = [
    ['Strength', ['strength-based', 'strength based', 'str-based', 'str based', 'strength']],
    ['Dexterity', ['dexterity-based', 'dexterity based', 'dex-based', 'dex based', 'dexterity']],
    ['Constitution', ['constitution-based', 'constitution based', 'con-based', 'con based', 'constitution']],
    ['Intelligence', ['intelligence-based', 'intelligence based', 'int-based', 'int based', 'intelligence']],
    ['Wisdom', ['wisdom-based', 'wisdom based', 'wis-based', 'wis based', 'wisdom']],
    ['Charisma', ['charisma-based', 'charisma based', 'cha-based', 'cha based', 'charisma']]
  ];

  for (const [stat, terms] of statChecks) {
    if (terms.some(term => text.includes(term))) {
      primaryStats.push(stat);
    }
  }

  return unique(primaryStats);
}

function detectBuildTypes(goal) {
  const text = normalizeText(goal);
  const buildTypes = [];

  if (includesAny(text, ['melee', 'handwraps', 'unarmed', 'monk'])) {
    buildTypes.push('melee');
  }

  if (includesAny(text, ['tactical', 'tactics', 'stunning', 'trip', 'sunder', 'dc'])) {
    buildTypes.push('tactical');
  }

  if (includesAny(text, ['defensive', 'survivability', 'survival', 'prr', 'mrr', 'dodge', 'tank'])) {
    buildTypes.push('defensive');
  }

  if (includesAny(text, ['tank'])) {
    buildTypes.push('tank');
  }

  if (includesAny(text, ['monk', 'handwraps', 'unarmed'])) {
    buildTypes.push('monk');
  }

  if (includesAny(text, ['caster', 'spell power', 'spellpower', 'spell dc'])) {
    buildTypes.push('caster');
  }

  return unique(buildTypes);
}

function detectPreferredWeaponSubtypes(goal) {
  const text = normalizeText(goal);
  const subtypes = [];

  if (includesAny(text, ['handwrap', 'handwraps', 'unarmed'])) {
    subtypes.push('handwraps');
  }

  if (includesAny(text, ['quarterstaff', 'staff build'])) {
    subtypes.push('quarterstaff');
  }

  if (includesAny(text, ['falchion'])) {
    subtypes.push('falchion');
  }

  if (includesAny(text, ['great axe', 'greataxe'])) {
    subtypes.push('great_axe');
  }

  if (includesAny(text, ['great sword', 'greatsword'])) {
    subtypes.push('great_sword');
  }

  if (includesAny(text, ['maul'])) {
    subtypes.push('maul');
  }

  if (includesAny(text, ['longbow', 'long bow'])) {
    subtypes.push('long_bow');
  }

  if (includesAny(text, ['shortbow', 'short bow'])) {
    subtypes.push('short_bow');
  }

  return unique(subtypes);
}

function detectArmorPreference(goal, buildTypes = []) {
  const text = normalizeText(goal);
  const notes = [];

  if (
    includesAny(text, [
      'cloth armor',
      'cloth',
      'robe',
      'robes',
      'outfit',
      'outfits',
      'no armor',
      'unarmored',
      'unarmoured'
    ])
  ) {
    notes.push('Detected cloth / robe / outfit armor requirement.');

    return {
      enforceArmorType: true,
      allowedArmorTypes: ['cloth'],
      preferredArmorTypes: ['cloth'],
      avoidArmorTypes: ['light', 'medium', 'heavy'],
      notes
    };
  }

  if (includesAny(text, ['light armor'])) {
    notes.push('Detected light armor requirement.');

    return {
      enforceArmorType: true,
      allowedArmorTypes: ['light'],
      preferredArmorTypes: ['light'],
      avoidArmorTypes: ['cloth', 'medium', 'heavy'],
      notes
    };
  }

  if (includesAny(text, ['medium armor'])) {
    notes.push('Detected medium armor requirement.');

    return {
      enforceArmorType: true,
      allowedArmorTypes: ['medium'],
      preferredArmorTypes: ['medium'],
      avoidArmorTypes: ['cloth', 'light', 'heavy'],
      notes
    };
  }

  if (includesAny(text, ['heavy armor'])) {
    notes.push('Detected heavy armor requirement.');

    return {
      enforceArmorType: true,
      allowedArmorTypes: ['heavy'],
      preferredArmorTypes: ['heavy'],
      avoidArmorTypes: ['cloth', 'light', 'medium'],
      notes
    };
  }

  if (buildTypes.includes('monk')) {
    notes.push('Detected Monk-style build. Cloth armor is preferred, but not enforced unless the goal says cloth armor, robe, outfit, or unarmored.');

    return {
      enforceArmorType: false,
      allowedArmorTypes: [],
      preferredArmorTypes: ['cloth'],
      avoidArmorTypes: ['medium', 'heavy'],
      notes
    };
  }

  return {
    enforceArmorType: false,
    allowedArmorTypes: [],
    preferredArmorTypes: [],
    avoidArmorTypes: [],
    notes
  };
}

function getMeleePriorityTerms() {
  return [
    'Melee Power',
    'Doublestrike',
    'Deadly',
    'Accuracy',
    'Armor-Piercing',
    'Seeker',
    'Damage'
  ];
}

function getTacticalPriorityTerms() {
  return [
    'Stunning',
    'Combat Mastery',
    'Tactical',
    'DC'
  ];
}

function getWisdomPriorityTerms() {
  return [
    'Wisdom',
    'Enhanced Ki',
    'Insightful Wisdom',
    'Quality Wisdom'
  ];
}

function getDefensiveSecondaryTerms() {
  return [
    'PRR',
    'MRR',
    'Sheltering',
    'Fortification',
    'Resistance',
    'Constitution',
    'Healing Amplification',
    'False Life',
    'Physical Resistance Rating',
    'Magical Resistance Rating',
    'Dodge',
    'Armor Class',
    'Protection',
    'Natural Armor'
  ];
}

function getTankSecondaryTerms() {
  return [
    'Intimidate',
    'Threat Generation',
    'Physical Sheltering',
    'Magical Sheltering',
    'Insightful Sheltering',
    'Quality Sheltering'
  ];
}

function buildPriorityTerms(goal, primaryStats, buildTypes) {
  const priorityTerms = [];

  if (buildTypes.includes('melee')) {
    priorityTerms.push(...getMeleePriorityTerms());
  }

  if (buildTypes.includes('tactical')) {
    priorityTerms.push(...getTacticalPriorityTerms());
  }

  if (primaryStats.includes('Wisdom')) {
    priorityTerms.push(...getWisdomPriorityTerms());
  }

  for (const stat of primaryStats) {
    priorityTerms.push(stat);
    priorityTerms.push(`Insightful ${stat}`);
    priorityTerms.push(`Quality ${stat}`);
  }

  return unique(priorityTerms);
}

function buildSecondaryTerms(goal, buildTypes) {
  const secondaryTerms = [];

  if (
    buildTypes.includes('defensive') ||
    buildTypes.includes('tank') ||
    buildTypes.includes('monk')
  ) {
    secondaryTerms.push(...getDefensiveSecondaryTerms());
  }

  if (buildTypes.includes('tank')) {
    secondaryTerms.push(...getTankSecondaryTerms());
  }

  return unique(secondaryTerms);
}

function buildAvoidTerms(goal, buildTypes) {
  const avoidTerms = [];

  if (!buildTypes.includes('caster')) {
    avoidTerms.push(
      'Spell Power',
      'Spell Lore',
      'Spell Critical',
      'Spell Crit',
      'Spell Penetration',
      'Spell DC',
      'Spell Focus'
    );
  }

  return unique(avoidTerms);
}

function buildNotes(goal, buildTypes, armorPreference) {
  const notes = [];

  if (buildTypes.includes('monk')) {
    notes.push('Detected Monk-style build.');
  }

  if (buildTypes.includes('defensive') && !buildTypes.includes('tank')) {
    notes.push('Treat survivability as a defensive priority, not necessarily a pure tank build.');
  }

  for (const note of armorPreference.notes || []) {
    notes.push(note);
  }

  return unique(notes);
}

function buildProfileFromGoal(goal) {
  const cleanedGoal = cleanText(goal);
  const maxLevel = detectMaxLevel(cleanedGoal);
  const primaryStats = detectPrimaryStats(cleanedGoal);
  const buildTypes = detectBuildTypes(cleanedGoal);
  const preferredWeaponSubtypes = detectPreferredWeaponSubtypes(cleanedGoal);
  const armorPreference = detectArmorPreference(cleanedGoal, buildTypes);

  const priorityTerms = buildPriorityTerms(
    cleanedGoal,
    primaryStats,
    buildTypes
  );

  const secondaryTerms = buildSecondaryTerms(
    cleanedGoal,
    buildTypes
  );

  const avoidTerms = buildAvoidTerms(
    cleanedGoal,
    buildTypes
  );

  const notes = buildNotes(
    cleanedGoal,
    buildTypes,
    armorPreference
  );

  return {
    goal: cleanedGoal,
    maxLevel,

    buildTypes,
    primaryStats,

    priorityTerms,
    secondaryTerms,
    avoidTerms,

    preferredWeaponSubtypes,

    armorPreference,

    notes
  };
}

function compactBuildProfileForAI(buildProfile) {
  return {
    goal: buildProfile.goal,
    maxLevel: buildProfile.maxLevel,

    buildTypes: buildProfile.buildTypes || [],
    primaryStats: buildProfile.primaryStats || [],

    priorityTerms: buildProfile.priorityTerms || [],
    secondaryTerms: buildProfile.secondaryTerms || [],
    avoidTerms: buildProfile.avoidTerms || [],

    preferredWeaponSubtypes: buildProfile.preferredWeaponSubtypes || [],

    armorPreference: buildProfile.armorPreference || {
      enforceArmorType: false,
      allowedArmorTypes: [],
      preferredArmorTypes: [],
      avoidArmorTypes: []
    },

    notes: buildProfile.notes || []
  };
}

module.exports = {
  buildProfileFromGoal,
  compactBuildProfileForAI,

  detectMaxLevel,
  detectPrimaryStats,
  detectBuildTypes,
  detectPreferredWeaponSubtypes,
  detectArmorPreference
};