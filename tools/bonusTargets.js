// bonusTargets.js

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

function includesAny(text, terms = []) {
  const normalized = normalizeText(text);

  return terms.some(term =>
    normalized.includes(normalizeText(term))
  );
}

function makeTarget({
  id,
  label,
  stat,
  bonusType = 'Default',
  stackKey,
  acceptableStackKeys = [],
  targetValue,
  minimumValue = null,
  priority = 50,
  category = 'general',
  sourceHints = [],
  notes = []
}) {
  const mainStackKey = stackKey || `${bonusType}:${stat}`;

  return {
    id,
    label: label || `${bonusType} ${stat}`,
    stat,
    bonusType,
    stackKey: mainStackKey,

    // This lets us bridge parser differences.
    // Example: item "Wisdom +14" may currently parse as Default:Wisdom,
    // while crafting "+15 Enhancement bonus to Wisdom" parses as Enhancement:Wisdom.
    acceptableStackKeys: unique([
      mainStackKey,
      ...acceptableStackKeys
    ]),

    targetValue,
    minimumValue:
      minimumValue === null || minimumValue === undefined
        ? targetValue
        : minimumValue,

    priority,
    category,
    sourceHints,
    notes
  };
}

function makeTypedTarget({
  stat,
  bonusType,
  targetValue,
  minimumValue = null,
  priority,
  category,
  sourceHints = [],
  notes = [],
  aliases = []
}) {
  const id = `${normalizeText(bonusType)}_${normalizeText(stat)}`
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return makeTarget({
    id,
    label: `${bonusType} ${stat}`,
    stat,
    bonusType,
    stackKey: `${bonusType}:${stat}`,
    acceptableStackKeys: aliases,
    targetValue,
    minimumValue,
    priority,
    category,
    sourceHints,
    notes
  });
}

function makeDefaultOrEnhancementTarget({
  stat,
  targetValue,
  minimumValue = null,
  priority,
  category,
  sourceHints = [],
  notes = [],
  aliases = []
}) {
  const id = `default_or_enhancement_${normalizeText(stat)}`
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return makeTarget({
    id,
    label: `${stat}`,
    stat,
    bonusType: 'Default',
    stackKey: `Default:${stat}`,
    acceptableStackKeys: [
      `Enhancement:${stat}`,
      `Equipment:${stat}`,
      `Competence:${stat}`,
      ...aliases
    ],
    targetValue,
    minimumValue,
    priority,
    category,
    sourceHints,
    notes: [
      'Default and Enhancement are treated as compatible until raw item parsing is fully normalized.',
      ...notes
    ]
  });
}

function getAbilityTargets(stat, priorityBase = 90) {
  return [
    makeDefaultOrEnhancementTarget({
      stat,
      targetValue: 15,
      minimumValue: 14,
      priority: priorityBase,
      category: 'primary_stat',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment', 'sun_moon']
    }),

    makeTypedTarget({
      stat,
      bonusType: 'Insightful',
      targetValue: 7,
      minimumValue: 6,
      priority: priorityBase - 5,
      category: 'primary_stat',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment', 'sun_moon']
    }),

    makeTypedTarget({
      stat,
      bonusType: 'Quality',
      targetValue: 3,
      minimumValue: 3,
      priority: priorityBase - 10,
      category: 'primary_stat',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment', 'sun_moon']
    }),

    makeTypedTarget({
      stat,
      bonusType: 'Exceptional',
      targetValue: 2,
      minimumValue: 2,
      priority: priorityBase - 25,
      category: 'primary_stat',
      sourceHints: ['gear', 'sun_moon', 'legacy_item']
    }),

    makeTypedTarget({
      stat,
      bonusType: 'Festive',
      targetValue: 2,
      minimumValue: 2,
      priority: priorityBase - 35,
      category: 'primary_stat',
      sourceHints: ['augment']
    })
  ];
}

function getWisdomMonkTargets() {
  return [
    ...getAbilityTargets('Wisdom', 100),

    makeDefaultOrEnhancementTarget({
      stat: 'Stunning',
      targetValue: 17,
      minimumValue: 16,
      priority: 100,
      category: 'tactical_dc',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Stunning',
      bonusType: 'Insightful',
      targetValue: 6,
      minimumValue: 6,
      priority: 85,
      category: 'tactical_dc',
      sourceHints: ['gear', 'sun_moon', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Stunning',
      bonusType: 'Quality',
      targetValue: 3,
      minimumValue: 3,
      priority: 80,
      category: 'tactical_dc',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Combat Mastery',
      targetValue: 12,
      minimumValue: 10,
      priority: 98,
      category: 'tactical_dc',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Combat Mastery',
      bonusType: 'Insightful',
      targetValue: 6,
      minimumValue: 6,
      priority: 92,
      category: 'tactical_dc',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Combat Mastery',
      bonusType: 'Quality',
      targetValue: 3,
      minimumValue: 3,
      priority: 90,
      category: 'tactical_dc',
      sourceHints: ['gear', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Tactical DC',
      bonusType: 'Artifact',
      targetValue: 5,
      minimumValue: 5,
      priority: 70,
      category: 'set_bonus',
      sourceHints: ['set_bonus']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Doublestrike',
      targetValue: 16,
      minimumValue: 15,
      priority: 86,
      category: 'melee_damage',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Doublestrike',
      bonusType: 'Insightful',
      targetValue: 7,
      minimumValue: 6,
      priority: 78,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Doublestrike',
      bonusType: 'Quality',
      targetValue: 4,
      minimumValue: 4,
      priority: 72,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Doublestrike',
      bonusType: 'Artifact',
      targetValue: 15,
      minimumValue: 15,
      priority: 70,
      category: 'set_bonus',
      sourceHints: ['set_bonus']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Deadly',
      targetValue: 12,
      minimumValue: 11,
      priority: 78,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Deadly',
      bonusType: 'Insightful',
      targetValue: 5,
      minimumValue: 5,
      priority: 64,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Deadly',
      bonusType: 'Quality',
      targetValue: 3,
      minimumValue: 3,
      priority: 64,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Accuracy',
      targetValue: 24,
      minimumValue: 22,
      priority: 72,
      category: 'melee_accuracy',
      sourceHints: ['gear', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Accuracy',
      bonusType: 'Insightful',
      targetValue: 11,
      minimumValue: 10,
      priority: 62,
      category: 'melee_accuracy',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Accuracy',
      bonusType: 'Quality',
      targetValue: 5,
      minimumValue: 4,
      priority: 62,
      category: 'melee_accuracy',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Armor-Piercing',
      targetValue: 24,
      minimumValue: 21,
      priority: 74,
      category: 'melee_damage',
      sourceHints: ['gear', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Armor-Piercing',
      bonusType: 'Insightful',
      targetValue: 11,
      minimumValue: 10,
      priority: 66,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Armor-Piercing',
      bonusType: 'Artifact',
      targetValue: 30,
      minimumValue: 30,
      priority: 70,
      category: 'set_bonus',
      sourceHints: ['set_bonus']
    }),

    ...getAbilityTargets('Constitution', 76),

    makeDefaultOrEnhancementTarget({
      stat: 'PRR',
      targetValue: 38,
      minimumValue: 33,
      priority: 84,
      category: 'survivability',
      sourceHints: ['gear', 'crafting_augment'],
      aliases: [
        'Default:Physical Sheltering',
        'Enhancement:Physical Sheltering',
        'Equipment:Physical Sheltering',
        'Competence:Physical Sheltering'
      ]
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'MRR',
      targetValue: 38,
      minimumValue: 33,
      priority: 82,
      category: 'survivability',
      sourceHints: ['gear', 'crafting_augment'],
      aliases: [
        'Default:Magical Sheltering',
        'Enhancement:Magical Sheltering',
        'Equipment:Magical Sheltering',
        'Competence:Magical Sheltering'
      ]
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Physical Sheltering',
      targetValue: 38,
      minimumValue: 33,
      priority: 78,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Physical Sheltering',
      bonusType: 'Insightful',
      targetValue: 18,
      minimumValue: 17,
      priority: 70,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Physical Sheltering',
      bonusType: 'Quality',
      targetValue: 9,
      minimumValue: 8,
      priority: 60,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Magical Sheltering',
      targetValue: 38,
      minimumValue: 33,
      priority: 76,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Magical Sheltering',
      bonusType: 'Insightful',
      targetValue: 18,
      minimumValue: 16,
      priority: 66,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'False Life',
      targetValue: 57,
      minimumValue: 54,
      priority: 72,
      category: 'survivability',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Healing Amplification',
      targetValue: 61,
      minimumValue: 57,
      priority: 72,
      category: 'survivability',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Healing Amplification',
      bonusType: 'Exceptional',
      targetValue: 15,
      minimumValue: 15,
      priority: 56,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Dodge',
      targetValue: 15,
      minimumValue: 11,
      priority: 70,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Dodge',
      bonusType: 'Quality',
      targetValue: 3,
      minimumValue: 3,
      priority: 60,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Fortification',
      targetValue: 156,
      minimumValue: 142,
      priority: 66,
      category: 'survivability',
      sourceHints: ['gear', 'crafting_augment']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Resistance',
      targetValue: 11,
      minimumValue: 10,
      priority: 58,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeTypedTarget({
      stat: 'Resistance',
      bonusType: 'Insightful',
      targetValue: 5,
      minimumValue: 5,
      priority: 52,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Enhanced Ki',
      targetValue: 5,
      minimumValue: 4,
      priority: 78,
      category: 'monk',
      sourceHints: ['gear']
    })
  ];
}

function getGenericMeleeTargets(buildProfile = {}) {
  const targets = [
    makeDefaultOrEnhancementTarget({
      stat: 'Deadly',
      targetValue: 12,
      minimumValue: 11,
      priority: 70,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Accuracy',
      targetValue: 24,
      minimumValue: 22,
      priority: 68,
      category: 'melee_accuracy',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Doublestrike',
      targetValue: 16,
      minimumValue: 15,
      priority: 68,
      category: 'melee_damage',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Armor-Piercing',
      targetValue: 24,
      minimumValue: 21,
      priority: 66,
      category: 'melee_damage',
      sourceHints: ['gear']
    })
  ];

  for (const stat of buildProfile.primaryStats || []) {
    targets.push(...getAbilityTargets(stat, 85));
  }

  return targets;
}

function getGenericDefensiveTargets() {
  return [
    makeDefaultOrEnhancementTarget({
      stat: 'Constitution',
      targetValue: 15,
      minimumValue: 14,
      priority: 70,
      category: 'survivability',
      sourceHints: ['gear', 'normal_augment', 'crafting_augment']
    }),

    makeTypedTarget({
      stat: 'Constitution',
      bonusType: 'Insightful',
      targetValue: 6,
      minimumValue: 6,
      priority: 62,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Fortification',
      targetValue: 156,
      minimumValue: 142,
      priority: 64,
      category: 'survivability',
      sourceHints: ['gear']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'False Life',
      targetValue: 57,
      minimumValue: 54,
      priority: 64,
      category: 'survivability',
      sourceHints: ['gear', 'normal_augment']
    }),

    makeDefaultOrEnhancementTarget({
      stat: 'Healing Amplification',
      targetValue: 61,
      minimumValue: 57,
      priority: 62,
      category: 'survivability',
      sourceHints: ['gear', 'normal_augment']
    })
  ];
}

function mergeTargets(targets) {
  const byId = new Map();

  for (const target of targets || []) {
    if (!target || !target.id) {
      continue;
    }

    const existing = byId.get(target.id);

    if (!existing) {
      byId.set(target.id, target);
      continue;
    }

    byId.set(target.id, {
      ...existing,
      ...target,
      targetValue: Math.max(
        Number(existing.targetValue || 0),
        Number(target.targetValue || 0)
      ),
      minimumValue: Math.max(
        Number(existing.minimumValue || 0),
        Number(target.minimumValue || 0)
      ),
      priority: Math.max(
        Number(existing.priority || 0),
        Number(target.priority || 0)
      ),
      acceptableStackKeys: unique([
        ...(existing.acceptableStackKeys || []),
        ...(target.acceptableStackKeys || [])
      ]),
      sourceHints: unique([
        ...(existing.sourceHints || []),
        ...(target.sourceHints || [])
      ]),
      notes: unique([
        ...(existing.notes || []),
        ...(target.notes || [])
      ])
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => b.priority - a.priority);
}

function isWisdomMonkProfile(buildProfile = {}) {
  const buildTypes = buildProfile.buildTypes || [];
  const primaryStats = buildProfile.primaryStats || [];

  return (
    buildTypes.includes('monk') &&
    primaryStats.includes('Wisdom')
  );
}

function buildBonusTargets(buildProfile = {}) {
  const targets = [];

  if (isWisdomMonkProfile(buildProfile)) {
    targets.push(...getWisdomMonkTargets());
  } else {
    if ((buildProfile.buildTypes || []).includes('melee')) {
      targets.push(...getGenericMeleeTargets(buildProfile));
    }

    if (
      (buildProfile.buildTypes || []).includes('defensive') ||
      (buildProfile.buildTypes || []).includes('tank') ||
      (buildProfile.buildTypes || []).includes('monk')
    ) {
      targets.push(...getGenericDefensiveTargets());
    }

    for (const stat of buildProfile.primaryStats || []) {
      targets.push(...getAbilityTargets(stat, 85));
    }
  }

  return mergeTargets(targets);
}

function getTargetMap(buildProfile = {}) {
  const targets = buildBonusTargets(buildProfile);
  const map = new Map();

  for (const target of targets) {
    map.set(target.id, target);

    for (const stackKey of target.acceptableStackKeys || []) {
      if (!map.has(stackKey)) {
        map.set(stackKey, target);
      }
    }
  }

  return map;
}

function findTargetForStackKey(stackKey, targets = []) {
  for (const target of targets || []) {
    if ((target.acceptableStackKeys || []).includes(stackKey)) {
      return target;
    }
  }

  return null;
}

function bonusMatchesTarget(bonus, target) {
  if (!bonus || !target) {
    return false;
  }

  return (target.acceptableStackKeys || []).includes(bonus.stackKey);
}

function evaluateBonusAgainstTarget(bonus, target) {
  if (!bonusMatchesTarget(bonus, target)) {
    return null;
  }

  const value = Number(bonus.value || 0);
  const targetValue = Number(target.targetValue || 0);
  const minimumValue = Number(target.minimumValue || targetValue || 0);

  return {
    targetId: target.id,
    stackKey: bonus.stackKey,
    bonusRaw: bonus.raw,
    value,
    targetValue,
    minimumValue,
    meetsMinimum: value >= minimumValue,
    meetsTarget: value >= targetValue,
    missingToMinimum: Math.max(0, minimumValue - value),
    missingToTarget: Math.max(0, targetValue - value)
  };
}

function compactBonusTargetForAI(target) {
  return {
    id: target.id,
    label: target.label,
    stat: target.stat,
    bonusType: target.bonusType,
    stackKey: target.stackKey,
    acceptableStackKeys: target.acceptableStackKeys,
    targetValue: target.targetValue,
    minimumValue: target.minimumValue,
    priority: target.priority,
    category: target.category,
    sourceHints: target.sourceHints
  };
}

function compactBonusTargetsForAI(targets) {
  return (targets || []).map(compactBonusTargetForAI);
}

module.exports = {
  buildBonusTargets,
  compactBonusTargetsForAI,
  compactBonusTargetForAI,

  getTargetMap,
  findTargetForStackKey,

  bonusMatchesTarget,
  evaluateBonusAgainstTarget,

  makeTarget,
  makeTypedTarget,
  makeDefaultOrEnhancementTarget,

  getWisdomMonkTargets,
  getGenericMeleeTargets,
  getGenericDefensiveTargets,

  cleanText,
  normalizeText
};