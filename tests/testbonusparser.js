// testbonusparser.js

const {
  parseBonusEffect,
  findStackingConflicts
} = require('../tools/bonusParser');

const examples = [
  'Quality Wisdom +3',
  'Wisdom +14',
  'Insightful Wisdom +6',
  'Insightful Armor-Piercing 10%',
  'Doublestrike 15%',
  'Deadly X',
  '+30 Profane Bonus to Physical Resistance Rating',
  '+15% Artifact bonus to Doublestrike',
  '+15 Enhancement Bonus',
  'Stunning +16',
  'Combat Mastery +7',
  'Physical Sheltering +33',
  'Magical Sheltering +36',
  'Sapphire of Stunning +16',
  'One of the following: Strength +13 Dexterity +13 Constitution +13 Intelligence +13 Wisdom +13 Charisma +13',
  'Nearly FinishedOne of the following:Quality Intelligence +3Quality Wisdom +3Quality Charisma +3',
  'Almost ThereOne of the following:Insightful Strength +6Insightful Dexterity +6Insightful Constitution +6Insightful Intelligence +6Insightful Wisdom +6Insightful Charisma +6'
];

const parsed = examples.map(parseBonusEffect);

console.log(JSON.stringify(parsed, null, 2));

console.log('\n=== Stacking Conflicts Example ===');

const conflicts = findStackingConflicts([
  parseBonusEffect('Wisdom +13'),
  parseBonusEffect('Wisdom +14'),
  parseBonusEffect('Insightful Wisdom +5'),
  parseBonusEffect('Insightful Wisdom +6'),
  parseBonusEffect('Quality Wisdom +3')
]);

console.log(JSON.stringify(conflicts, null, 2));