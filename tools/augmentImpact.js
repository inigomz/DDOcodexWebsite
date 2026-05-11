// augmentImpact.js

const {
  parseBonusEffect
} = require('./bonusParser');

const {
  getResolvedItemEffects
} = require('./selectableEffects');

function getItemKey(item) {
  return item.itemKey || item.link || item.name;
}

function getAugmentEffects(augment) {
  if (!augment) {
    return [];
  }

  if (augment.effect) {
    return [augment.effect];
  }

  if (Array.isArray(augment.effects)) {
    return augment.effects;
  }

  if (Array.isArray(augment.effectsRaw)) {
    return augment.effectsRaw;
  }

  return [];
}

function parseStackBonusesFromEffects(effects, source) {
  return (effects || [])
    .map(effect => ({
      ...parseBonusEffect(effect),
      source
    }))
    .filter(bonus =>
      bonus.parsed &&
      bonus.stackKey &&
      bonus.value !== null &&
      bonus.value !== undefined
    );
}

function collectGearBonuses(equippedItems = [], buildProfile = {}) {
  const bonuses = [];

  for (const item of equippedItems) {
    const resolvedEffects = getResolvedItemEffects(item, buildProfile);

    const parsed = parseStackBonusesFromEffects(
      resolvedEffects,
      {
        type: 'item',
        name: item.name,
        itemKey: getItemKey(item),
        slot: item.slot
      }
    );

    bonuses.push(...parsed);
  }

  return bonuses;
}

function collectSelectedAugmentBonuses(selectedAugments = []) {
  const bonuses = [];

  for (const itemSelection of selectedAugments || []) {
    for (const selected of itemSelection.selectedAugments || []) {
      const augment = selected.augment;

      const effects = getAugmentEffects(augment);

      const parsed = parseStackBonusesFromEffects(
        effects,
        {
          type: 'augment',
          itemName: itemSelection.itemName,
          itemKey: itemSelection.itemKey,
          slotColor: selected.slotColor,
          name: augment.name,
          link: augment.link
        }
      );

      for (const bonus of parsed) {
        bonuses.push({
          ...bonus,
          selectedAugment: selected,
          itemSelection
        });
      }
    }
  }

  return bonuses;
}

function groupBonusesByStackKey(bonuses = []) {
  const groups = new Map();

  for (const bonus of bonuses) {
    if (!bonus.stackKey) {
      continue;
    }

    if (!groups.has(bonus.stackKey)) {
      groups.set(bonus.stackKey, []);
    }

    groups.get(bonus.stackKey).push(bonus);
  }

  return groups;
}

function sortBonusesByValueDescending(bonuses = []) {
  return [...bonuses].sort((a, b) => {
    const aValue = Number(a.value) || 0;
    const bValue = Number(b.value) || 0;

    return bValue - aValue;
  });
}

function getBestBonusForStack(stackBonuses = []) {
  const sorted = sortBonusesByValueDescending(stackBonuses);

  return sorted[0] || null;
}

function getSourceLabel(bonus) {
  const source = bonus.source || {};

  if (source.type === 'augment') {
    return `${source.name} slotted into ${source.itemName}`;
  }

  if (source.type === 'item') {
    return source.name;
  }

  if (source.type === 'set_bonus') {
    return `${source.setName} set bonus`;
  }

  return 'unknown source';
}

function compactBonus(bonus) {
  if (!bonus) {
    return null;
  }

  return {
    raw: bonus.raw,
    stackKey: bonus.stackKey,
    bonusType: bonus.bonusType,
    stat: bonus.stat,
    value: bonus.value,
    valueText: bonus.valueText,
    source: bonus.source,
    sourceLabel: getSourceLabel(bonus)
  };
}

function classifyAugmentBonusAgainstGear(augmentBonus, gearBonusesForStack = []) {
  const bestGearBonus = getBestBonusForStack(gearBonusesForStack);

  if (!bestGearBonus) {
    return {
      impactType: 'adds_new_stack_family',
      message: `${augmentBonus.raw} adds a new stack family: ${augmentBonus.stackKey}.`,
      bestGearBonus: null,
      suppressedGearBonuses: []
    };
  }

  const augmentValue = Number(augmentBonus.value) || 0;
  const bestGearValue = Number(bestGearBonus.value) || 0;

  if (augmentValue > bestGearValue) {
    const suppressedGearBonuses = gearBonusesForStack
      .filter(gearBonus =>
        Number(gearBonus.value) <= augmentValue
      );

    return {
      impactType: 'upgrades_existing_gear_bonus',
      message: `${augmentBonus.raw} upgrades ${bestGearBonus.raw} for ${augmentBonus.stackKey}.`,
      bestGearBonus,
      suppressedGearBonuses
    };
  }

  if (augmentValue === bestGearValue) {
    return {
      impactType: 'duplicates_existing_gear_bonus',
      message: `${augmentBonus.raw} duplicates ${bestGearBonus.raw} for ${augmentBonus.stackKey}.`,
      bestGearBonus,
      suppressedGearBonuses: []
    };
  }

  return {
    impactType: 'suppressed_by_existing_gear_bonus',
    message: `${augmentBonus.raw} is suppressed by ${bestGearBonus.raw} for ${augmentBonus.stackKey}.`,
    bestGearBonus,
    suppressedGearBonuses: []
  };
}

function buildFinalStackSummary({
  gearBonuses,
  augmentBonuses
}) {
  const allBonuses = [
    ...(gearBonuses || []),
    ...(augmentBonuses || [])
  ];

  const groups = groupBonusesByStackKey(allBonuses);
  const summaries = [];

  for (const [stackKey, bonuses] of groups.entries()) {
    const sorted = sortBonusesByValueDescending(bonuses);
    const winningBonus = sorted[0];
    const suppressedBonuses = sorted.slice(1);

    if (suppressedBonuses.length === 0) {
      continue;
    }

    summaries.push({
      stackKey,
      winningBonus: compactBonus(winningBonus),
      suppressedBonuses: suppressedBonuses.map(compactBonus)
    });
  }

  return summaries;
}

function analyzeAugmentImpact({
  equippedItems,
  selectedAugments = [],
  buildProfile = {}
}) {
  const gearBonuses = collectGearBonuses(
    equippedItems,
    buildProfile
  );

  const augmentBonuses = collectSelectedAugmentBonuses(
    selectedAugments
  );

  const gearBonusesByStackKey = groupBonusesByStackKey(gearBonuses);

  const augmentImpacts = augmentBonuses.map(augmentBonus => {
    const gearBonusesForStack =
      gearBonusesByStackKey.get(augmentBonus.stackKey) || [];

    const classification = classifyAugmentBonusAgainstGear(
      augmentBonus,
      gearBonusesForStack
    );

    return {
      augment: augmentBonus.source.name,
      itemName: augmentBonus.source.itemName,
      itemKey: augmentBonus.source.itemKey,
      slotColor: augmentBonus.source.slotColor,

      effect: augmentBonus.raw,
      stackKey: augmentBonus.stackKey,
      stat: augmentBonus.stat,
      value: augmentBonus.value,
      valueText: augmentBonus.valueText,

      impactType: classification.impactType,
      message: classification.message,

      bestExistingGearBonus: compactBonus(
        classification.bestGearBonus
      ),

      suppressedGearBonuses:
        classification.suppressedGearBonuses.map(compactBonus)
    };
  });

  const finalStackSummary = buildFinalStackSummary({
    gearBonuses,
    augmentBonuses
  });

  const counts = {
    totalSelectedAugmentBonuses: augmentImpacts.length,
    addsNewStackFamily: augmentImpacts.filter(
      impact => impact.impactType === 'adds_new_stack_family'
    ).length,
    upgradesExistingGearBonus: augmentImpacts.filter(
      impact => impact.impactType === 'upgrades_existing_gear_bonus'
    ).length,
    duplicatesExistingGearBonus: augmentImpacts.filter(
      impact => impact.impactType === 'duplicates_existing_gear_bonus'
    ).length,
    suppressedByExistingGearBonus: augmentImpacts.filter(
      impact => impact.impactType === 'suppressed_by_existing_gear_bonus'
    ).length
  };

  return {
    counts,
    augmentImpacts,
    finalStackSummary
  };
}

function compactAugmentImpactForAI(impactResult) {
  return {
    counts: impactResult.counts,

    augmentImpacts: (impactResult.augmentImpacts || []).map(impact => ({
      augment: impact.augment,
      itemName: impact.itemName,
      slotColor: impact.slotColor,
      effect: impact.effect,
      stackKey: impact.stackKey,
      impactType: impact.impactType,
      message: impact.message,
      bestExistingGearBonus: impact.bestExistingGearBonus
        ? {
            raw: impact.bestExistingGearBonus.raw,
            sourceLabel: impact.bestExistingGearBonus.sourceLabel
          }
        : null,
      suppressedGearBonuses: (impact.suppressedGearBonuses || []).map(bonus => ({
        raw: bonus.raw,
        sourceLabel: bonus.sourceLabel
      }))
    })),

    finalStackSummary: (impactResult.finalStackSummary || []).map(summary => ({
      stackKey: summary.stackKey,
      winningBonus: {
        raw: summary.winningBonus.raw,
        sourceLabel: summary.winningBonus.sourceLabel
      },
      suppressedBonuses: summary.suppressedBonuses.map(bonus => ({
        raw: bonus.raw,
        sourceLabel: bonus.sourceLabel
      }))
    }))
  };
}

module.exports = {
  analyzeAugmentImpact,
  compactAugmentImpactForAI,

  collectGearBonuses,
  collectSelectedAugmentBonuses,
  classifyAugmentBonusAgainstGear,
  buildFinalStackSummary
};