// testaugmentselection.js

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadAllAugments,
  getAugmentCandidatesForItem
} = require('../tools/augmentSearch');

const {
  selectAugmentsForItem
} = require('../tools/augmentSelection');

const goal =
  'Level 34 Wisdom-based Monk using handwraps, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const augments = loadAllAugments();

const eyesOfDefilement = {
  name: 'Eyes of Defilement',
  itemKey: 'item:eyes_of_defilement',
  minLevel: 32,
  effects: [
    'Quality Wisdom +3',
    'Quality Potency +28',
    'Insightful Spell Lore V',
    'Utter Disintegration Guard',
    'Taint of Evil'
  ],
  augmentSlots: ['Green', 'Yellow', 'Blue']
};

const augmentCandidates = getAugmentCandidatesForItem(
  eyesOfDefilement,
  augments,
  {
    goal,
    maxLevel: 34,
    limitPerSlot: 5
  }
);

const usedAugmentKeys = new Set();

const selected = selectAugmentsForItem({
  item: eyesOfDefilement,
  augmentCandidatesForItem: augmentCandidates,
  buildProfile,
  usedAugmentKeys
});

console.log(JSON.stringify(selected, null, 2));