// testbonustargets.js

const {
  buildProfileFromGoal
} = require('../tools/buildProfile');

const {
  buildBonusTargets,
  compactBonusTargetsForAI
} = require('../tools/bonusTargets');

const goal =
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const buildProfile = buildProfileFromGoal(goal);
const targets = buildBonusTargets(buildProfile);

console.log(`Target count: ${targets.length}`);

console.log(JSON.stringify(
  compactBonusTargetsForAI(targets),
  null,
  2
));