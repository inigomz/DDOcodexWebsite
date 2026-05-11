// testgearsearch.js

const {
  loadAllItems,
  searchItems,
  compactItemForAI
} = require('../tools/gearsearch');

const items = loadAllItems();

console.log(`Loaded ${items.length} items.`);

const wisdomEyes = searchItems(items, {
  slot: 'eyes',
  maxLevel: 34,
  shouldInclude: ['Wisdom'],
  priorityTerms: [
    'Wisdom',
    'Insightful Wisdom',
    'Quality Wisdom'
  ],
  secondaryTerms: [
    'Blue Augment Slot',
    'Green Augment Slot',
    'set'
  ],
  limit: 10
});

const compactResults = wisdomEyes.map(compactItemForAI);

console.log(JSON.stringify(compactResults, null, 2));