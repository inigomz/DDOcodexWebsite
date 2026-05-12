// openaiGearAdvisor.js

const fs = require('fs');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

let OpenAI = null;

try {
  OpenAI = require('openai');
} catch (error) {
  OpenAI = null;
}

const DEFAULT_BUILD_SUMMARY_PATH = path.join(
  __dirname,
  '..',
  'testoutput',
  'build_summary_test_output.json'
);

const DEFAULT_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'testoutput',
  'openai_gear_advice_output.md'
);

const DEFAULT_MODEL =
  process.env.OPENAI_MODEL || 'gpt-4.0-mini';

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(asArray(values).filter(Boolean))];
}

function readJsonFile(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  return JSON.parse(
    fs.readFileSync(filepath, 'utf8')
  );
}

function writeTextFile(filepath, content) {
  const outputDir = path.dirname(filepath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(filepath, content, 'utf8');
}

function normalizeSelectedGear(summary = {}) {
  return asArray(summary.selectedGear).map(item => ({
    ...item,
    effects: unique(
      asArray(item.effects)
        .map(cleanText)
        .filter(Boolean)
    ),
    augmentSlots: asArray(item.augmentSlots),
    craftingSlots: asArray(item.craftingSlots)
  }));
}

function normalizeBuildSummary(summary = {}) {
  return {
    ...summary,

    goal: summary.goal || '',

    buildProfile: summary.buildProfile || {},

    counts: summary.counts || {},

    selectedGear: normalizeSelectedGear(summary),

    normalAugments:
      asArray(summary.normalAugments),

    craftingAugments:
      asArray(summary.craftingAugments),

    remainingGaps:
      asArray(summary.remainingGaps),

    remainingStackingConflicts:
      asArray(summary.remainingStackingConflicts),

    swapLog:
      asArray(summary.swapLog),

    advisorNotes:
      asArray(summary.advisorNotes),

    scoreBreakdown:
      summary.scoreBreakdown || null
  };
}

function validateBuildSummary(summary = {}) {
  const requiredFields = [
    'goal',
    'counts',
    'selectedGear',
    'normalAugments',
    'craftingAugments',
    'remainingGaps'
  ];

  const missing = requiredFields.filter(field =>
    summary[field] === undefined ||
    summary[field] === null
  );

  if (missing.length > 0) {
    throw new Error(
      `Build summary is missing required field(s): ${missing.join(', ')}`
    );
  }
}

function loadBuildSummary(
  summaryPath = DEFAULT_BUILD_SUMMARY_PATH
) {
  const summary = readJsonFile(summaryPath);
  const normalized = normalizeBuildSummary(summary);

  validateBuildSummary(normalized);

  return normalized;
}

function getTopItems(items = [], limit = 12) {
  return asArray(items).slice(0, limit);
}

function compactSummaryForPrompt(summary = {}) {
  const scoreBreakdown = summary.scoreBreakdown || null;

  return {
    goal: summary.goal,
    buildProfile: summary.buildProfile,
    counts: summary.counts,

    selectedGear:
      getTopItems(summary.selectedGear, 20),

    normalAugments:
      getTopItems(summary.normalAugments, 20),

    craftingAugments:
      getTopItems(summary.craftingAugments, 20),

    remainingGaps:
      getTopItems(summary.remainingGaps, 15),

    remainingStackingConflicts:
      getTopItems(summary.remainingStackingConflicts, 12),

    swapLog:
      asArray(summary.swapLog),

    advisorNotes:
      asArray(summary.advisorNotes),

    scoreBreakdown: scoreBreakdown
      ? {
          score: scoreBreakdown.score,
          counts: scoreBreakdown.counts || {},
          topGapPenalties:
            getTopItems(
              scoreBreakdown.topGapPenalties || [],
              10
            ),
          topConflictPenalties:
            getTopItems(
              scoreBreakdown.topConflictPenalties || [],
              10
            )
        }
      : null
  };
}

function buildAdvisorInstructions() {
  return [
    'You are a DDO gear advisor.',
    'You are reviewing a final optimized gearset summary produced by a gear planner.',
    'Do not invent gear, augments, set bonuses, or effects that are not present in the summary.',
    'Prioritize practical build advice for a level 34 Wisdom-based Monk using handwraps and cloth armor.',
    'Explain whether the build is structurally valid.',
    'Explain the normal augment assignments and crafting augment assignments.',
    'Explain the most important remaining gaps.',
    'Explain the remaining stacking conflicts without exaggerating them.',
    'Distinguish between serious problems and acceptable leftovers.',
    'Keep the advice actionable and easy to read.'
  ].join('\n');
}

function buildAdvisorPrompt(summary = {}) {
  const compactSummary = compactSummaryForPrompt(summary);

  return [
    'Review this DDO gearset summary and produce a practical advisor report.',
    '',
    'The report should include:',
    '1. Overall verdict',
    '2. What the build is doing well',
    '3. Normal augment plan',
    '4. Crafting augment plan',
    '5. Highest-priority remaining gaps',
    '6. Stacking conflicts that still matter',
    '7. Suggested next optimization targets',
    '8. Short final recommendation',
    '',
    'Build summary JSON:',
    JSON.stringify(compactSummary, null, 2)
  ].join('\n');
}

function createOpenAIClient() {
  if (!OpenAI) {
    throw new Error(
      'The openai package is not installed. Run: npm install openai'
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to your environment or .env file.'
    );
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

function extractOutputText(response = {}) {
  if (response.output_text) {
    return response.output_text;
  }

  const output = asArray(response.output);
  const textParts = [];

  for (const outputItem of output) {
    const content = asArray(outputItem.content);

    for (const contentItem of content) {
      if (contentItem.text) {
        textParts.push(contentItem.text);
      }

      if (contentItem.type === 'output_text' && contentItem.text) {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join('\n').trim();
}

async function generateGearAdvice({
  buildSummary,
  summaryPath = DEFAULT_BUILD_SUMMARY_PATH,
  model = DEFAULT_MODEL,
  client = null
} = {}) {
  const summary =
    buildSummary ||
    loadBuildSummary(summaryPath);

  const openaiClient =
    client ||
    createOpenAIClient();

  const response = await openaiClient.responses.create({
    model,
    instructions: buildAdvisorInstructions(),
    input: buildAdvisorPrompt(summary)
  });

  return {
    model,
    summary,
    advice: extractOutputText(response)
  };
}

function buildLocalFallbackAdvice(summary = {}) {
  const lines = [];

  lines.push('# Gear Advisor Report');
  lines.push('');

  lines.push('## Overall Verdict');
  lines.push(
    summary.counts.validationErrorCount > 0
      ? 'The build has validation errors and should not be treated as final yet.'
      : 'The build is structurally valid and ready for advisor review.'
  );

  lines.push('');
  lines.push('## Current Counts');
  lines.push(`- Met targets: ${summary.counts.metTargetCount || 0}`);
  lines.push(`- Open gaps: ${summary.counts.openGapCount || 0}`);
  lines.push(`- Normal augment assignments: ${summary.counts.normalAssignmentCount || 0}`);
  lines.push(`- Crafting augment assignments: ${summary.counts.craftingAssignmentCount || 0}`);
  lines.push(`- Stacking conflicts: ${summary.counts.stackingConflictCount || 0}`);
  lines.push(`- Relevant conflicts: ${summary.counts.relevantConflictCount || 0}`);

  lines.push('');
  lines.push('## Selected Gear');

  for (const item of asArray(summary.selectedGear)) {
    lines.push(`- ${item.slot || 'unknown'}: ${item.name || 'unknown item'}`);
  }

  lines.push('');
  lines.push('## Highest-Priority Remaining Gaps');

  for (const gap of asArray(summary.remainingGaps).slice(0, 10)) {
    lines.push(
      `- ${gap.label}: current ${gap.currentValue}, minimum ${gap.minimumValue}, target ${gap.targetValue}, status ${gap.status}`
    );
  }

  lines.push('');
  lines.push('## Normal Augments');

  for (const augment of asArray(summary.normalAugments)) {
    lines.push(
      `- ${augment.augmentName} into ${augment.itemName}: ${augment.effect}`
    );
  }

  lines.push('');
  lines.push('## Crafting Augments');

  for (const augment of asArray(summary.craftingAugments)) {
    lines.push(
      `- ${augment.augmentName} on ${augment.itemName}: ${augment.effect}`
    );
  }

  lines.push('');
  lines.push('## Remaining Stacking Conflicts');

  for (const conflict of asArray(summary.remainingStackingConflicts).slice(0, 10)) {
    const winner = conflict.winningBonus?.raw || 'unknown winner';
    const suppressed = asArray(conflict.suppressedBonuses)
      .map(bonus => bonus.raw)
      .filter(Boolean)
      .join(', ');

    lines.push(
      `- ${conflict.stackKey}: ${winner} suppresses ${suppressed}`
    );
  }

  lines.push('');
  lines.push('## Optimizer Swaps');

  for (const swap of asArray(summary.swapLog)) {
    lines.push(
      `- Pass ${swap.pass}: ${swap.slotLabel}: ${swap.oldItemName} -> ${swap.newItemName}`
    );
  }

  return lines.join('\n');
}

async function generateAndSaveGearAdvice({
  summaryPath = DEFAULT_BUILD_SUMMARY_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
  model = DEFAULT_MODEL,
  useOpenAI = true
} = {}) {
  const summary = loadBuildSummary(summaryPath);

  let advice = '';

  if (useOpenAI) {
    const result = await generateGearAdvice({
      buildSummary: summary,
      model
    });

    advice = result.advice;
  } else {
    advice = buildLocalFallbackAdvice(summary);
  }

  if (!advice) {
    advice = buildLocalFallbackAdvice(summary);
  }

  writeTextFile(outputPath, advice);

  return {
    summary,
    advice,
    outputPath
  };
}

async function main() {
  const summaryPath =
    process.argv[2] ||
    DEFAULT_BUILD_SUMMARY_PATH;

  const outputPath =
    process.argv[3] ||
    DEFAULT_OUTPUT_PATH;

  const useOpenAI =
    process.env.USE_OPENAI_ADVISOR !== 'false';

  const result = await generateAndSaveGearAdvice({
    summaryPath,
    outputPath,
    model: DEFAULT_MODEL,
    useOpenAI
  });

  console.log('');
  console.log('OpenAI gear advisor complete.');
  console.log(`Summary input: ${summaryPath}`);
  console.log(`Advice output: ${result.outputPath}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('');
    console.error('openaiGearAdvisor.js failed:');
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  generateGearAdvice,
  generateAndSaveGearAdvice,

  buildAdvisorInstructions,
  buildAdvisorPrompt,
  buildLocalFallbackAdvice,

  loadBuildSummary,
  normalizeBuildSummary,
  compactSummaryForPrompt,

  extractOutputText,

  DEFAULT_BUILD_SUMMARY_PATH,
  DEFAULT_OUTPUT_PATH
};