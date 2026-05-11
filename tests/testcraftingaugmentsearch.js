// testcraftingaugmentsearch.js

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadCraftingAugments,
  searchCraftingAugments,
  compactCraftingAugmentForAI
} = require('../tools/craftingAugmentSearch');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const craftingAugments = loadCraftingAugments();

function printSearch(title, query) {
  const results = searchCraftingAugments(
    craftingAugments,
    {
      ...query,
      buildProfile,
      limit: 8
    }
  );

  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(
    results.map(compactCraftingAugmentForAI),
    null,
    2
  ));
}

console.log(`Loaded ${craftingAugments.length} crafting augments.`);
console.log(`Build max level: ${buildProfile.maxLevel}`);

printSearch('Lamordia Melancholic Accessory', {
  system: 'Lamordia',
  slotType: 'Melancholic',
  itemGroup: 'Accessory'
});

printSearch('Lamordia Dolorous Accessory', {
  system: 'Lamordia',
  slotType: 'Dolorous',
  itemGroup: 'Accessory'
});

printSearch('Lamordia Miserable Accessory', {
  system: 'Lamordia',
  slotType: 'Miserable',
  itemGroup: 'Accessory'
});

printSearch('Lamordia Woeful Weapon', {
  system: 'Lamordia',
  slotType: 'Woeful',
  itemGroup: 'Weapon'
});