// augmentSearch.js

const fs = require('fs');
const path = require('path');

const DEFAULT_AUGMENT_DIR = path.join(__dirname, '..', 'augmentlist');

function readJsonFile(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function getJsonFiles(directory) {
  return fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(directory, file));
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function cleanColor(value) {
  if (!value) return null;

  return String(value)
    .replace(/_augments?/i, '')
    .replace(/\.json$/i, '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function colorFromFilename(filepath) {
  const filename = path.basename(filepath, '.json');

  if (filename.includes('blue')) return 'Blue';
  if (filename.includes('colorless')) return 'Colorless';
  if (filename.includes('green')) return 'Green';
  if (filename.includes('moon')) return 'Moon';
  if (filename.includes('orange')) return 'Orange';
  if (filename.includes('purple')) return 'Purple';
  if (filename.includes('red')) return 'Red';
  if (filename.includes('sun')) return 'Sun';
  if (filename.includes('yellow')) return 'Yellow';

  return cleanColor(filename);
}

function getAugmentColor(augment, fallbackColor = null) {
  return (
    augment.augmentColor ||
    augment.augmentCategory ||
    augment.augmentType ||
    fallbackColor ||
    null
  );
}

function loadAllAugments(augmentDir = DEFAULT_AUGMENT_DIR) {
  const files = getJsonFiles(augmentDir);
  const allAugments = [];

  for (const file of files) {
    const data = readJsonFile(file);

    // Skip non-array files such as crafting recipe objects.
    if (!Array.isArray(data)) {
      continue;
    }

    const fallbackColor = colorFromFilename(file);

    for (const augment of data) {
      allAugments.push({
        ...augment,
        augmentColor: getAugmentColor(augment, fallbackColor),
        sourceFile: path.basename(file)
      });
    }
  }

  return allAugments;
}

function getAllowedAugmentColorsForSlot(slotColor) {
  const color = cleanColor(slotColor);

  const compatibility = {
    Colorless: ['Colorless'],

    Red: ['Red', 'Colorless'],
    Blue: ['Blue', 'Colorless'],
    Yellow: ['Yellow', 'Colorless'],

    Orange: ['Orange', 'Red', 'Yellow', 'Colorless'],
    Purple: ['Purple', 'Red', 'Blue', 'Colorless'],
    Green: ['Green', 'Blue', 'Yellow', 'Colorless'],

    Sun: ['Sun'],
    Moon: ['Moon']
  };

  return compatibility[color] || [color];
}

function augmentTextBlob(augment) {
  return [
    augment.name,
    augment.augmentColor,
    augment.binding,
    ...(augment.effectsRaw || []),
    ...(augment.sourceRaw || []),
    ...(augment.locationRaw || [])
  ]
    .join(' ')
    .toLowerCase();
}

function hasAllTerms(augment, terms) {
  if (!terms || terms.length === 0) {
    return true;
  }

  const blob = augmentTextBlob(augment);

  return terms.every(term =>
    blob.includes(normalizeText(term))
  );
}

function hasAnyTerm(augment, terms) {
  if (!terms || terms.length === 0) {
    return true;
  }

  const blob = augmentTextBlob(augment);

  return terms.some(term =>
    blob.includes(normalizeText(term))
  );
}

function matchesAugmentSlot(augment, slotColor) {
  if (!slotColor) {
    return true;
  }

  const allowedColors = getAllowedAugmentColorsForSlot(slotColor);
  const augmentColor = getAugmentColor(augment);

  return allowedColors.includes(augmentColor);
}

function matchesAugment(augment, query = {}) {
  if (
    query.maxLevel !== undefined &&
    augment.minLevel !== null &&
    augment.minLevel > query.maxLevel
  ) {
    return false;
  }

  if (
    query.minLevel !== undefined &&
    augment.minLevel !== null &&
    augment.minLevel < query.minLevel
  ) {
    return false;
  }

  if (query.slotColor && !matchesAugmentSlot(augment, query.slotColor)) {
    return false;
  }

  if (
    query.augmentColor &&
    getAugmentColor(augment) !== query.augmentColor
  ) {
    return false;
  }

  if (query.mustInclude && !hasAllTerms(augment, query.mustInclude)) {
    return false;
  }

  if (query.shouldInclude && !hasAnyTerm(augment, query.shouldInclude)) {
    return false;
  }

  if (query.exclude && hasAnyTerm(augment, query.exclude)) {
    return false;
  }

  return true;
}

function scoreAugment(augment, query = {}) {
  let score = 0;
  const blob = augmentTextBlob(augment);

  for (const term of query.priorityTerms || []) {
    if (blob.includes(normalizeText(term))) {
      score += 10;
    }
  }

  for (const term of query.secondaryTerms || []) {
    if (blob.includes(normalizeText(term))) {
      score += 3;
    }
  }

  // Prefer augments closer to the target level.
  if (query.maxLevel !== undefined && augment.minLevel !== null) {
    score += Math.max(0, augment.minLevel);
  }

  return score;
}

function searchAugments(augments, query = {}) {
  const limit = query.limit || 10;

  return augments
    .filter(augment => matchesAugment(augment, query))
    .map(augment => ({
      ...augment,
      searchScore: scoreAugment(augment, query)
    }))
    .sort((a, b) => {
      if (b.searchScore !== a.searchScore) {
        return b.searchScore - a.searchScore;
      }

      return (b.minLevel || 0) - (a.minLevel || 0);
    })
    .slice(0, limit);
}

function compactAugmentForAI(augment) {
  return {
    name: augment.name,
    link: augment.link,
    augmentColor: getAugmentColor(augment),
    minLevel: augment.minLevel,
    effects: augment.effectsRaw || [],
    binding: augment.binding || null,
    searchScore: augment.searchScore
  };
}

function buildAugmentQueryFromGoal(goal, slotColor, maxLevel = 34) {
  const loweredGoal = normalizeText(goal);

  const priorityTerms = [];
  const secondaryTerms = [];

  if (loweredGoal.includes('wisdom') || loweredGoal.includes('monk')) {
    priorityTerms.push('Wisdom');
  }

  if (
    loweredGoal.includes('tactical') ||
    loweredGoal.includes('stunning') ||
    loweredGoal.includes('dc')
  ) {
    priorityTerms.push(
      'Stunning',
      'Combat Mastery',
      'Tactical',
      'DC'
    );
  }

  if (
    loweredGoal.includes('survivability') ||
    loweredGoal.includes('defense')
  ) {
    secondaryTerms.push(
      'PRR',
      'MRR',
      'Dodge',
      'Sheltering',
      'Resistance',
      'False Life',
      'Fortification',
      'Healing Amplification'
    );
  }

  return {
    slotColor,
    maxLevel,
    priorityTerms,
    secondaryTerms,
    limit: 8
  };
}

function getAugmentCandidatesForItem(item, augments, options = {}) {
  const goal = options.goal || '';
  const maxLevel = options.maxLevel || 34;
  const limitPerSlot = options.limitPerSlot || 8;

  const result = [];

  for (const slotColor of item.augmentSlots || []) {
    const query = {
      ...buildAugmentQueryFromGoal(goal, slotColor, maxLevel),
      limit: limitPerSlot
    };

    const candidates = searchAugments(augments, query);

    result.push({
      itemName: item.name,
      itemKey: item.itemKey,
      slotColor,
      allowedColors: getAllowedAugmentColorsForSlot(slotColor),
      candidates: candidates.map(compactAugmentForAI)
    });
  }

  return result;
}

function getAugmentCandidatesForItems(items, augments, options = {}) {
  const result = [];

  for (const item of items) {
    const itemAugmentCandidates =
      getAugmentCandidatesForItem(item, augments, options);

    if (itemAugmentCandidates.length > 0) {
      result.push({
        itemName: item.name,
        itemKey: item.itemKey,
        augmentSlots: item.augmentSlots || [],
        augmentCandidates: itemAugmentCandidates
      });
    }
  }

  return result;
}

module.exports = {
  loadAllAugments,
  searchAugments,
  compactAugmentForAI,
  getAllowedAugmentColorsForSlot,
  getAugmentCandidatesForItem,
  getAugmentCandidatesForItems
};