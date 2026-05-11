// testaugmentimpact.js

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
  analyzeAugmentImpact
} = require('../tools/augmentImpact');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const items = loadAllItems();
const augments = loadAllAugments();

const equippedItems = [
  items.find(item => item.name === 'Legendary Raven\'s Sight'),
  items.find(item => item.name === 'Legendary Pendant of the Red Abishai'),
  items.find(item => item.name === 'Blood of Blossoms'),
  items.find(item => item.name === 'Antipode, Fist of the Horizon')
].filter(Boolean);

const itemsWithAugmentSlots = equippedItems.filter(item =>
  Array.isArray(item.augmentSlots) &&
  item.augmentSlots.length > 0
);

const augmentCandidateGroups = getAugmentCandidatesForItems(
  itemsWithAugmentSlots,
  augments,
  {
    goal: buildProfile.goal,
    maxLevel: buildProfile.maxLevel || 34,
    limitPerSlot: 5
  }
);

const selectedAugments = selectAugmentsForItems({
  items: itemsWithAugmentSlots,
  augmentCandidateGroups,
  buildProfile,
  allowRedundant: false
});

const impact = analyzeAugmentImpact({
  equippedItems,
  selectedAugments,
  buildProfile
});

console.log('\n=== Equipped Items ===');
console.log(equippedItems.map(item => item.name));

console.log('\n=== Selected Augments ===');
console.log(JSON.stringify(selectedAugments, null, 2));

console.log('\n=== Augment Impact ===');
console.log(JSON.stringify(impact, null, 2));