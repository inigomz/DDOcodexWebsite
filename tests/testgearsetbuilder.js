// testgearsetbuilder.js

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadAllItems,
  searchItems,
  compactItemForAI
} = require('../tools/gearsearch');

const {
  loadCraftingAugments
} = require('../tools/craftingAugmentSearch');

const {
  buildCraftingAugmentPlan
} = require('../tools/craftingAugmentPlan');

const {
  buildStackAwareGearset,
  scoreCandidateAgainstGear,
  formatCoveredBonusList
} = require('../tools/gearSetBuilder');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const items = loadAllItems();
const craftingAugments = loadCraftingAugments();

const craftingAugmentPlan = buildCraftingAugmentPlan({
  craftingAugments,
  buildProfile,
  systems: ['Lamordia'],
  limitPerSlot: 5,
  minimumScore: 40
});

function createBaseQuery(buildProfile) {
  return {
    maxLevel: buildProfile.maxLevel || 34,
    priorityTerms: buildProfile.priorityTerms || [],
    secondaryTerms: buildProfile.secondaryTerms || [],
    avoidTerms: buildProfile.avoidTerms || [],
    buildProfile
  };
}

function getGeneralShouldInclude(buildProfile) {
  return [
    ...(buildProfile.priorityTerms || []),
    ...(buildProfile.secondaryTerms || [])
  ];
}

function shouldSkipOffhand(buildProfile) {
  const preferredWeaponSubtypes =
    buildProfile.preferredWeaponSubtypes || [];

  if (preferredWeaponSubtypes.includes('handwraps')) {
    return true;
  }

  const twoHandedWeaponSubtypes = [
    'falchion',
    'great_axe',
    'great_club',
    'great_sword',
    'maul',
    'quarterstaff',
    'long_bow',
    'short_bow'
  ];

  return preferredWeaponSubtypes.some(subtype =>
    twoHandedWeaponSubtypes.includes(subtype)
  );
}

function getCandidateQueries(buildProfile) {
  const base = createBaseQuery(buildProfile);
  const generalShouldInclude = getGeneralShouldInclude(buildProfile);

  const preferredWeaponSubtypes =
    buildProfile.preferredWeaponSubtypes || [];

  const queries = [
    {
      label: 'Eyes',
      query: {
        ...base,
        slot: 'eyes',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Neck',
      query: {
        ...base,
        slot: 'neck',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Trinket',
      query: {
        ...base,
        slot: 'trinket',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Finger',
      query: {
        ...base,
        slot: 'finger',
        shouldInclude: generalShouldInclude,
        limit: 12
      }
    },
    {
      label: 'Hands',
      query: {
        ...base,
        slot: 'hands',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Body / Armor',
      query: {
        ...base,
        slot: 'armor',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Feet',
      query: {
        ...base,
        slot: 'feet',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Waist',
      query: {
        ...base,
        slot: 'waist',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Wrists',
      query: {
        ...base,
        slot: 'wrists',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Back',
      query: {
        ...base,
        slot: 'back',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    },
    {
      label: 'Head',
      query: {
        ...base,
        slot: 'head',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    }
  ];

  if (preferredWeaponSubtypes.length > 0) {
    queries.push({
      label: 'Weapon / Preferred Weapon',
      query: {
        ...base,
        slot: 'weapon',
        itemSubtypes: preferredWeaponSubtypes,
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    });
  } else {
    queries.push({
      label: 'Weapon',
      query: {
        ...base,
        slot: 'weapon',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    });
  }

  if (!shouldSkipOffhand(buildProfile)) {
    queries.push({
      label: 'Offhand',
      query: {
        ...base,
        slot: 'offhand',
        shouldInclude: generalShouldInclude,
        limit: 10
      }
    });
  }

  return queries;
}

function buildTestGearGroups() {
  const queryGroups = getCandidateQueries(buildProfile);

  return queryGroups.map(group => {
    const fullCandidates = searchItems(items, {
      ...group.query,
      limit: group.query.limit || 10
    });

    return {
      label: group.label,
      fullCandidates
    };
  });
}

function printCraftingPlanSummary() {
  console.log('\n=== Crafting Augment Plan Summary ===');

  console.log(
    `Loaded ${craftingAugments.length} crafting augments.`
  );

  console.log('\nTop useful crafting slots:');

  for (const slot of craftingAugmentPlan.usefulCraftingSlots.slice(0, 10)) {
    console.log(
      `- ${slot.label}: ${slot.bestCandidate.name} (${slot.bestCandidate.stackKey}, score ${slot.bestScore})`
    );
  }

  console.log('\nTop desired crafting stack keys:');

  for (const entry of craftingAugmentPlan.desiredCraftingStackKeys.slice(0, 15)) {
    console.log(
      `- ${entry.stackKey}: ${entry.bestCandidate} from ${entry.sourceSlotLabel} (score ${entry.bestScore})`
    );
  }
}

function printOriginalTopChoices(gearGroups) {
  console.log('\n=== Original Top Choices ===');

  for (const group of gearGroups) {
    const item = group.fullCandidates[0];

    if (!item) {
      console.log(`${group.label}: no candidates`);
      continue;
    }

    const compact = compactItemForAI(item, buildProfile);

    console.log(`\n${group.label}: ${item.name}`);
    console.log(`Score: ${item.searchScore}`);
    console.log('Effects:', compact.effects);
  }
}

function printStackAwareChoices(result) {
  console.log('\n=== Stack-Aware Top Choices ===');

  for (const group of result.gearGroups) {
    const item = group.fullCandidates[0];

    if (!item) {
      console.log(`${group.label}: no candidates`);
      continue;
    }

    const compact = compactItemForAI(item, buildProfile);
    const selection = group.stackAwareSelection;

    console.log(`\n${group.label}: ${item.name}`);
    console.log(`Dynamic score: ${selection?.dynamicScore ?? 'n/a'}`);
    console.log('Effects:', compact.effects);

    if (selection) {
      console.log('New bonuses:', selection.newBonuses);
      console.log('Upgraded bonuses:', selection.upgradedBonuses);
      console.log('Duplicate bonuses:', selection.duplicateBonuses);
      console.log('Suppressed bonuses:', selection.suppressedBonuses);

      console.log(
        'Crafting potential score:',
        selection.craftingPotential?.score ?? 0
      );

      if (
        selection.craftingPotential &&
        selection.craftingPotential.slotPotentials.length > 0
      ) {
        console.log(
          'Crafting slot potentials:',
          JSON.stringify(
            selection.craftingPotential.slotPotentials,
            null,
            2
          )
        );
      }
    }
  }
}

function printSelectionLog(result) {
  console.log('\n=== Selection Log ===');

  for (const entry of result.selectionLog) {
    console.log(`\n${entry.slotLabel}: ${entry.selectedItem}`);
    console.log(`Score: ${entry.score}`);

    if (entry.newBonuses.length > 0) {
      console.log('New:', entry.newBonuses);
    }

    if (entry.upgradedBonuses.length > 0) {
      console.log('Upgraded:', entry.upgradedBonuses);
    }

    if (entry.duplicateBonuses.length > 0) {
      console.log('Duplicates:', entry.duplicateBonuses);
    }

    if (entry.suppressedBonuses.length > 0) {
      console.log('Suppressed:', entry.suppressedBonuses);
    }

    if (
      entry.craftingPotential &&
      entry.craftingPotential.score > 0
    ) {
      console.log(
        'Crafting potential:',
        JSON.stringify(entry.craftingPotential, null, 2)
      );
    }
  }
}

function printCoveredBonuses(result) {
  console.log('\n=== Covered Bonuses ===');

  const covered = formatCoveredBonusList(result.coveredBonuses)
    .sort((a, b) => a.stackKey.localeCompare(b.stackKey));

  for (const bonus of covered) {
    console.log(
      `${bonus.stackKey}: ${bonus.raw} from ${bonus.source?.name || 'unknown'}`
    );
  }
}

function debugSingleSlot(gearGroups, slotLabel) {
  const group = gearGroups.find(entry => entry.label === slotLabel);

  if (!group) {
    return;
  }

  console.log(`\n=== Candidate Debug: ${slotLabel} ===`);

  const emptyCovered = new Map();

  const scored = group.fullCandidates
    .map(item =>
      scoreCandidateAgainstGear(
        item,
        emptyCovered,
        buildProfile,
        {
          craftingAugmentPlan
        }
      )
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const entry of scored) {
    console.log(`\n${entry.itemName}`);
    console.log(`Dynamic score: ${entry.score}`);
    console.log(
      'Useful bonuses:',
      entry.usefulBonuses.map(bonus => bonus.raw)
    );

    console.log(
      'Crafting potential score:',
      entry.craftingPotential?.score ?? 0
    );

    if (
      entry.craftingPotential &&
      entry.craftingPotential.slotPotentials.length > 0
    ) {
      console.log(
        'Crafting slot potentials:',
        JSON.stringify(
          entry.craftingPotential.slotPotentials,
          null,
          2
        )
      );
    }
  }
}

function main() {
  console.log(`Loaded ${items.length} items.`);
  console.log(`Goal: ${goal}`);
  console.log(`Build types: ${buildProfile.buildTypes.join(', ')}`);
  console.log(`Primary stats: ${buildProfile.primaryStats.join(', ') || 'none'}`);

  printCraftingPlanSummary();

  const gearGroups = buildTestGearGroups();

  console.log('\n=== Candidate Counts ===');
  for (const group of gearGroups) {
    console.log(`${group.label}: ${group.fullCandidates.length}`);
  }

  printOriginalTopChoices(gearGroups);

  const result = buildStackAwareGearset({
    gearGroups,
    buildProfile,
    craftingAugmentPlan
  });

  printStackAwareChoices(result);
  printSelectionLog(result);
  printCoveredBonuses(result);

  // Optional focused debug sections
  debugSingleSlot(gearGroups, 'Eyes');
  debugSingleSlot(gearGroups, 'Head');
  debugSingleSlot(gearGroups, 'Body / Armor');
  debugSingleSlot(gearGroups, 'Weapon / Preferred Weapon');
}

main();