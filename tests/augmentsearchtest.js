// testaugmentsearch.js

const {
  loadAllAugments,
  searchAugments,
  compactAugmentForAI,
  getAugmentCandidatesForItem
} = require('../tools/augmentSearch');

const augments = loadAllAugments();

console.log(`Loaded ${augments.length} augments.`);

const greenWisdomAugments = searchAugments(augments, {
  slotColor: 'Green',
  maxLevel: 34,
  shouldInclude: ['Wisdom', 'PRR', 'MRR', 'Dodge', 'Resistance'],
  priorityTerms: ['Wisdom'],
  secondaryTerms: ['PRR', 'MRR', 'Dodge', 'Resistance'],
  limit: 10
});

console.log('\n=== Green Slot Candidates ===');
console.log(
  JSON.stringify(
    greenWisdomAugments.map(compactAugmentForAI),
    null,
    2
  )
);

const eyesOfDefilement = {
  name: 'Eyes of Defilement',
  itemKey: 'item:eyes_of_defilement',
  minLevel: 32,
  augmentSlots: ['Green', 'Yellow', 'Blue']
};

const candidatesForEyes = getAugmentCandidatesForItem(
  eyesOfDefilement,
  augments,
  {
    goal: 'Level 34 Wisdom Monk focused on Tactical DC, Stunning, PRR, MRR, Dodge, and survivability',
    maxLevel: 34,
    limitPerSlot: 5
  }
);

console.log('\n=== Augment Candidates for Eyes of Defilement ===');
console.log(JSON.stringify(candidatesForEyes, null, 2));