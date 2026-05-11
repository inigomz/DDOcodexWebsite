// testselectableeffects.js

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadAllItems
} = require('../tools/gearsearch');

const {
  getResolvedItemEffects,
  getSelectableSummaryForItem
} = require('../tools/selectableEffects');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const items = loadAllItems();

const testItemNames = [
  'Legendary Collective Sight',
  'The Changestone',
  'Legendary Alchemist\'s Crown',
  'Terrorweb Chitin Breastplate'
];

for (const itemName of testItemNames) {
  const item = items.find(entry => entry.name === itemName);

  if (!item) {
    console.log(`\nItem not found: ${itemName}`);
    continue;
  }

  console.log('\n==============================');
  console.log(item.name);
  console.log('==============================');

  console.log('\nSelectable groups:');
  console.log(JSON.stringify(
    getSelectableSummaryForItem(item, buildProfile),
    null,
    2
  ));

  console.log('\nResolved effects:');
  console.log(JSON.stringify(
    getResolvedItemEffects(item, buildProfile),
    null,
    2
  ));
}