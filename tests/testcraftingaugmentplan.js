// testcraftingaugmentplan.js

const fs = require('fs');
const path = require('path');

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  loadCraftingAugments
} = require('../tools/craftingAugmentSearch');

const {
  buildCraftingAugmentPlan,
  compactCraftingAugmentPlanForAI
} = require('../tools/craftingAugmentPlan');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const craftingAugments = loadCraftingAugments();

const plan = buildCraftingAugmentPlan({
  craftingAugments,
  buildProfile,
  systems: ['Lamordia'],
  limitPerSlot: 5,
  minimumScore: 1
});

const compactPlan = compactCraftingAugmentPlanForAI(plan);

const outputDir = path.join(__dirname, '..', 'testoutput');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const outputFile = path.join(
  outputDir,
  'crafting_augment_plan_test_output.json'
);

fs.writeFileSync(
  outputFile,
  JSON.stringify(compactPlan, null, 2)
);

console.log(`Loaded ${craftingAugments.length} crafting augments.`);
console.log(`Build max level: ${buildProfile.maxLevel}`);
console.log('');
console.log(`Saved full crafting augment plan to:`);
console.log(outputFile);

console.log('');
console.log('Top useful crafting slots:');

for (const slot of compactPlan.usefulCraftingSlots.slice(0, 10)) {
  console.log(
    `- ${slot.label}: ${slot.bestCandidate.name} (${slot.bestCandidate.stackKey}, score ${slot.bestScore})`
  );
}

console.log('');
console.log('Top desired crafting stack keys:');

for (const entry of compactPlan.desiredCraftingStackKeys.slice(0, 15)) {
  console.log(
    `- ${entry.stackKey}: ${entry.bestCandidate} from ${entry.sourceSlotLabel} (score ${entry.bestScore})`
  );
}