// testCraftingSearch.js

const {
  loadAllItems,
  searchItems,
  compactItemForAI
} = require('../tools/gearsearch');

const items = loadAllItems();

console.log(`Loaded ${items.length} items.`);

// Test 1: Find Lamordia weapons
const lamordiaWeapons = searchItems(items, {
  slot: 'weapon',
  maxLevel: 34,
  requiredCraftingSlot: {
    system: 'Lamordia',
    itemGroup: 'Weapon'
  },
  limit: 10
});

console.log('\n=== Lamordia Weapons ===');
console.log(
  JSON.stringify(
    lamordiaWeapons.map(compactItemForAI),
    null,
    2
  )
);

// Test 2: Find Isle of Dread Scale weapon slots
const isleOfDreadScaleWeapons = searchItems(items, {
  slot: 'weapon',
  maxLevel: 34,
  requiredCraftingSlot: {
    system: 'Isle of Dread',
    slotType: 'Scale',
    itemGroup: 'Weapon'
  },
  limit: 10
});

console.log('\n=== Isle of Dread Scale Weapons ===');
console.log(
  JSON.stringify(
    isleOfDreadScaleWeapons.map(compactItemForAI),
    null,
    2
  )
);

// Test 3: Find War Hammers with crafting slots
const warHammersWithCrafting = searchItems(items, {
  slot: 'weapon',
  itemSubtype: 'war_hammer',
  maxLevel: 34,
  mustInclude: [],
  requiredCraftingSlot: {
    itemGroup: 'Weapon'
  },
  limit: 10
});

console.log('\n=== War Hammers With Crafting Slots ===');
console.log(
  JSON.stringify(
    warHammersWithCrafting.map(compactItemForAI),
    null,
    2
  )
);

// Test 4: Find items with Orange augment slots
const orangeSlotWeapons = searchItems(items, {
  slot: 'weapon',
  maxLevel: 34,
  requiredAugmentSlot: 'Orange',
  limit: 10
});

console.log('\n=== Weapons With Orange Augment Slot ===');
console.log(
  JSON.stringify(
    orangeSlotWeapons.map(compactItemForAI),
    null,
    2
  )
);