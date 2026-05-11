// testbuildprofile.js

const {
  buildProfileFromGoal,
  compactBuildProfileForAI
} = require('../tools/buildProfile');

const goal =
  'Level 34 Wisdom-based Monk using handwraps, focused on Tactical DC, Stunning, Wisdom, PRR, MRR, Dodge, and survivability.';

const profile = buildProfileFromGoal(goal);

console.log(JSON.stringify(compactBuildProfileForAI(profile), null, 2));