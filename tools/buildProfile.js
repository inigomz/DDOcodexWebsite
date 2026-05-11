// buildProfile.js

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function addBuildType(profile, buildType) {
  if (!profile.buildTypes.includes(buildType)) {
    profile.buildTypes.push(buildType);
  }
}

function createBaseProfile(goal) {
  return {
    goal,

    maxLevel: 34,

    buildTypes: [],

    primaryStats: [],
    combatStyle: [],
    priorityTerms: [],
    secondaryTerms: [],
    avoidTerms: [],

    requiredSlots: [],
    preferredWeaponSubtypes: [],

    notes: []
  };
}

function detectAbilityStats(goalText) {
  const stats = [];

  if (goalText.includes('strength') || goalText.includes('str')) {
    stats.push('Strength');
  }

  if (goalText.includes('dexterity') || goalText.includes('dex')) {
    stats.push('Dexterity');
  }

  if (goalText.includes('constitution') || goalText.includes('con')) {
    stats.push('Constitution');
  }

  if (goalText.includes('intelligence') || goalText.includes('int')) {
    stats.push('Intelligence');
  }

  if (goalText.includes('wisdom') || goalText.includes('wis')) {
    stats.push('Wisdom');
  }

  if (goalText.includes('charisma') || goalText.includes('cha')) {
    stats.push('Charisma');
  }

  return uniqueList(stats);
}

function detectWeaponSubtypes(goalText) {
  const subtypes = [];

  if (goalText.includes('handwrap')) {
    subtypes.push('handwraps');
  }

  if (goalText.includes('warhammer') || goalText.includes('war hammer')) {
    subtypes.push('war_hammer');
  }

  if (goalText.includes('long sword') || goalText.includes('longsword')) {
    subtypes.push('long_sword');
  }

  if (goalText.includes('great sword') || goalText.includes('greatsword')) {
    subtypes.push('great_sword');
  }

  if (goalText.includes('dagger')) {
    subtypes.push('dagger');
  }

  if (goalText.includes('bow') || goalText.includes('ranger')) {
    subtypes.push('long_bow', 'short_bow');
  }

  if (goalText.includes('crossbow')) {
    subtypes.push(
      'light_crossbow',
      'heavy_crossbow',
      'great_crossbow',
      'repeating_light_crossbow',
      'repeating_heavy_crossbow'
    );
  }

  return uniqueList(subtypes);
}

function addMeleeProfile(profile, goalText) {
  addBuildType(profile, 'melee');

  profile.priorityTerms.push(
    'Melee Power',
    'Doublestrike',
    'Deadly',
    'Accuracy',
    'Armor-Piercing',
    'Seeker',
    'Damage'
  );

  profile.secondaryTerms.push(
    'PRR',
    'MRR',
    'Sheltering',
    'Fortification',
    'Resistance',
    'Constitution',
    'Healing Amplification'
  );

  profile.avoidTerms.push(
    'Spell Power',
    'Spell Lore',
    'Spell Critical',
    'Spell Penetration'
  );

  if (
    goalText.includes('stunning') ||
    goalText.includes('tactical') ||
    goalText.includes('dc')
  ) {
    addBuildType(profile, 'tactical');

    profile.priorityTerms.push(
      'Stunning',
      'Combat Mastery',
      'Tactical',
      'DC'
    );
  }
}

function addCasterProfile(profile, goalText) {
  addBuildType(profile, 'caster');

  profile.priorityTerms.push(
    'Spell DC',
    'Spell Focus',
    'Spell Penetration',
    'Spell Power',
    'Spell Lore',
    'Potency',
    'Universal Spell Power'
  );

  profile.secondaryTerms.push(
    'Spell Points',
    'Constitution',
    'MRR',
    'Resistance',
    'Sheltering',
    'False Life'
  );

  profile.avoidTerms.push(
    'Melee Power',
    'Doublestrike',
    'Stunning',
    'Armor-Piercing'
  );

  if (goalText.includes('fire')) {
    addBuildType(profile, 'fire');

    profile.priorityTerms.push(
      'Fire Spell Power',
      'Fire Spell Lore',
      'Combustion',
      'Evocation'
    );
  }

  if (goalText.includes('cold') || goalText.includes('ice')) {
    addBuildType(profile, 'cold');

    profile.priorityTerms.push(
      'Cold Spell Power',
      'Cold Spell Lore',
      'Glaciation',
      'Evocation'
    );
  }

  if (goalText.includes('light')) {
    addBuildType(profile, 'light');

    profile.priorityTerms.push(
      'Light Spell Power',
      'Radiance',
      'Light Spell Lore'
    );
  }

  if (goalText.includes('negative') || goalText.includes('necromancy')) {
    addBuildType(profile, 'negative');
    addBuildType(profile, 'necromancy');

    profile.priorityTerms.push(
      'Negative Spell Power',
      'Nullification',
      'Necromancy'
    );
  }
}

function addRangedProfile(profile) {
  addBuildType(profile, 'ranged');

  profile.priorityTerms.push(
    'Ranged Power',
    'Doubleshot',
    'Deadly',
    'Accuracy',
    'Armor-Piercing',
    'Seeker'
  );

  profile.secondaryTerms.push(
    'PRR',
    'MRR',
    'Dodge',
    'Constitution',
    'Resistance',
    'Sheltering'
  );

  profile.avoidTerms.push(
    'Spell Power',
    'Spell Lore',
    'Melee Power',
    'Stunning'
  );
}

function addDefensiveProfile(profile) {
  addBuildType(profile, 'defensive');

  profile.secondaryTerms.push(
    'PRR',
    'MRR',
    'Sheltering',
    'Fortification',
    'Constitution',
    'False Life',
    'Healing Amplification',
    'Physical Resistance Rating',
    'Magical Resistance Rating',
    'Dodge',
    'Resistance',
    'Armor Class',
    'Protection',
    'Natural Armor'
  );
}

function addTankProfile(profile) {
  addBuildType(profile, 'tank');

  profile.priorityTerms.push(
    'PRR',
    'MRR',
    'Sheltering',
    'Fortification',
    'Constitution',
    'False Life',
    'Healing Amplification',
    'Physical Resistance Rating',
    'Magical Resistance Rating'
  );

  profile.secondaryTerms.push(
    'Dodge',
    'Resistance',
    'Armor Class',
    'Intimidate',
    'Protection',
    'Natural Armor'
  );
}

function addHealerProfile(profile) {
  addBuildType(profile, 'healer');

  profile.priorityTerms.push(
    'Devotion',
    'Positive Spell Power',
    'Healing Amplification',
    'Positive Spell Lore',
    'Wisdom',
    'Spell Points'
  );

  profile.secondaryTerms.push(
    'MRR',
    'Constitution',
    'Resistance',
    'Sheltering',
    'False Life'
  );

  profile.avoidTerms.push(
    'Melee Power',
    'Doublestrike',
    'Armor-Piercing'
  );
}

function addMonkProfile(profile) {
  addBuildType(profile, 'monk');

  profile.notes.push('Detected Monk-style build.');

  profile.priorityTerms.push(
    'Wisdom',
    'Stunning',
    'Combat Mastery',
    'Tactical',
    'Enhanced Ki',
    'Doublestrike'
  );

  profile.secondaryTerms.push(
    'PRR',
    'MRR',
    'Dodge',
    'Sheltering',
    'Healing Amplification',
    'Resistance'
  );

  if (!profile.preferredWeaponSubtypes.includes('handwraps')) {
    profile.preferredWeaponSubtypes.push('handwraps');
  }
}

function applyPrimaryStats(profile) {
  for (const stat of profile.primaryStats) {
    profile.priorityTerms.push(stat);

    if (stat === 'Wisdom') {
      profile.priorityTerms.push(
        'Insightful Wisdom',
        'Quality Wisdom'
      );
    }

    if (stat === 'Strength') {
      profile.priorityTerms.push(
        'Insightful Strength',
        'Quality Strength'
      );
    }

    if (stat === 'Dexterity') {
      profile.priorityTerms.push(
        'Insightful Dexterity',
        'Quality Dexterity'
      );
    }

    if (stat === 'Constitution') {
      profile.secondaryTerms.push(
        'Insightful Constitution',
        'Quality Constitution'
      );
    }

    if (stat === 'Intelligence') {
      profile.priorityTerms.push(
        'Insightful Intelligence',
        'Quality Intelligence'
      );
    }

    if (stat === 'Charisma') {
      profile.priorityTerms.push(
        'Insightful Charisma',
        'Quality Charisma'
      );
    }
  }
}

function buildProfileFromGoal(goal) {
  const profile = createBaseProfile(goal);
  const goalText = normalizeText(goal);

  profile.primaryStats = detectAbilityStats(goalText);
  profile.preferredWeaponSubtypes = detectWeaponSubtypes(goalText);

  const isMonk =
    goalText.includes('monk') ||
    goalText.includes('handwrap');

  const isCaster =
    goalText.includes('caster') ||
    goalText.includes('sorcerer') ||
    goalText.includes('wizard') ||
    goalText.includes('warlock') ||
    goalText.includes('spell') ||
    goalText.includes('dc caster');

  const isRanged =
    goalText.includes('ranged') ||
    goalText.includes('bow') ||
    goalText.includes('ranger') ||
    goalText.includes('crossbow') ||
    goalText.includes('doubleshot');

  const isTank =
    goalText.includes('tank');

  const isDefensive =
    goalText.includes('survivability') ||
    goalText.includes('defense') ||
    goalText.includes('defensive') ||
    goalText.includes('prr') ||
    goalText.includes('mrr');

  const isHealer =
    goalText.includes('healer') ||
    goalText.includes('healing') ||
    goalText.includes('devotion');

  const isMelee =
    goalText.includes('melee') ||
    goalText.includes('doublestrike') ||
    goalText.includes('stunning') ||
    goalText.includes('tactical') ||
    isMonk;

  if (isCaster) {
    addCasterProfile(profile, goalText);
  }

  if (isRanged) {
    addRangedProfile(profile);
  }

  if (isMelee) {
    addMeleeProfile(profile, goalText);
  }

  if (isTank) {
    addTankProfile(profile);
  } else if (isDefensive) {
    addDefensiveProfile(profile);

    profile.notes.push(
      'Treat survivability as a defensive priority, not necessarily a pure tank build.'
    );
  }

  if (isHealer) {
    addHealerProfile(profile);
  }

  if (isMonk) {
    addMonkProfile(profile);
  }

  applyPrimaryStats(profile);

  if (profile.buildTypes.length === 0) {
    profile.buildTypes.push('general');

    profile.notes.push(
      'No clear build type detected. Using general-purpose priorities.'
    );

    profile.priorityTerms.push(
      'Constitution',
      'Resistance',
      'Sheltering',
      'PRR',
      'MRR'
    );
  }

  profile.buildTypes = uniqueList(profile.buildTypes);
  profile.priorityTerms = uniqueList(profile.priorityTerms);
  profile.secondaryTerms = uniqueList(profile.secondaryTerms);
  profile.avoidTerms = uniqueList(profile.avoidTerms);
  profile.preferredWeaponSubtypes = uniqueList(profile.preferredWeaponSubtypes);

  return profile;
}

function compactBuildProfileForAI(profile) {
  return {
    goal: profile.goal,
    maxLevel: profile.maxLevel,
    buildTypes: profile.buildTypes,
    primaryStats: profile.primaryStats,
    priorityTerms: profile.priorityTerms,
    secondaryTerms: profile.secondaryTerms,
    avoidTerms: profile.avoidTerms,
    preferredWeaponSubtypes: profile.preferredWeaponSubtypes,
    notes: profile.notes
  };
}

module.exports = {
  buildProfileFromGoal,
  compactBuildProfileForAI
};