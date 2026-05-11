// testgearsetvalidator.js

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadAllItems
} = require('../tools/gearsearch');

const {
  loadAllAugments,
  getAugmentCandidatesForItems
} = require('../tools/augmentSearch');

const {
  selectAugmentsForItems
} = require('../tools/augmentSelection');

const {
  validateGearset
} = require('../tools/gearsetValidator');

const goal =
  'Level 34 Wisdom-based Monk using handwraps, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);

const items = loadAllItems();
const augments = loadAllAugments();

// Manually choose test equipped items from full item data
const equippedItems = [
  items.find(item => item.name === 'Eyes of Defilement'),
  items.find(item => item.name === 'The Family\'s Blessing'),
  items.find(item => item.name === 'Legendary Stonedust Handwraps'),
  items.find(item => item.slot === 'offhand')
].filter(Boolean);

// Build augment candidates for those equipped items
const augmentCandidateGroups = getAugmentCandidatesForItems(
  equippedItems,
  augments,
  {
    goal,
    maxLevel: 34,
    limitPerSlot: 5
  }
);

// Select augments using your selector
const selectedAugments = selectAugmentsForItems({
  items: equippedItems,
  augmentCandidateGroups,
  buildProfile,
  allowRedundant: false
});

// Validate the gearset
const result = validateGearset({
  equippedItems,
  selectedAugments,
  buildProfile
});

console.log(JSON.stringify(result, null, 2));