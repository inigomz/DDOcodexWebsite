// enrichItemsWithSets.js

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://ddowiki.com';

const itemDir = path.join(__dirname, '..', 'itemlist');
const setFile = path.join(__dirname, '..', 'setlist', 'named_item_sets.json');
const outputDir = path.join(__dirname, '..', 'itemlist_enriched');

const inPlace = process.argv.includes('--in-place');

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function linkToItemKey(link) {
  if (!link) {
    return null;
  }

  let cleaned = safeDecode(link)
    .split('#')[0]
    .split('?')[0]
    .trim();

  cleaned = cleaned
    .replace(BASE_URL + '/page/', '')
    .replace('/page/', '')
    .trim()
    .toLowerCase();

  return cleaned || null;
}

function normalizeSetId(setName) {
  return String(setName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeTieredEffects(tieredEffects) {
  if (!Array.isArray(tieredEffects)) {
    return [];
  }

  return tieredEffects.map(effect => ({
    tier: effect.tier || null,
    symbol: effect.symbol || null,
    valueText: effect.valueText || null,
    effect: effect.effect || '',
  }));
}

function normalizeBonus(bonus) {
  return {
    piecesRequired: bonus.piecesRequired ?? null,
    effect: bonus.effect || bonus.effectRaw || bonus.raw || '',
    effectRaw: bonus.effectRaw || bonus.effect || bonus.raw || '',
    tieredEffects: normalizeTieredEffects(bonus.tieredEffects),
  };
}

function createMembership(namedSet) {
  const setId =
    namedSet.setId || normalizeSetId(namedSet.setName);

  const bonuses = Array.isArray(namedSet.bonuses)
    ? namedSet.bonuses.map(normalizeBonus)
    : [];

  return {
    setId,

    setName:
      namedSet.setName,

    source:
      'named_item_sets',

    sourceSection:
      namedSet.sourceSection || null,

    minLevels:
      Array.isArray(namedSet.minLevels)
        ? namedSet.minLevels
        : [],

    availablePieces:
      Array.isArray(namedSet.items)
        ? namedSet.items.length
        : 0,

    bonusRaw:
      namedSet.bonusRaw || null,

    bonuses
  };
}

function createSetBonusEntries(memberships) {
  const setBonuses = [];

  for (const membership of memberships || []) {
    for (const bonus of membership.bonuses || []) {
      setBonuses.push({
        setId:
          membership.setId,

        setName:
          membership.setName,

        source:
          membership.source,

        sourceSection:
          membership.sourceSection,

        piecesRequired:
          bonus.piecesRequired ?? null,

        effect:
          bonus.effect || bonus.effectRaw || '',

        effectRaw:
          bonus.effectRaw || bonus.effect || '',

        tieredEffects:
          normalizeTieredEffects(bonus.tieredEffects)
      });
    }

    // Fallback if the named set parser only found bonusRaw
    if (
      (!membership.bonuses || membership.bonuses.length === 0) &&
      membership.bonusRaw
    ) {
      setBonuses.push({
        setId:
          membership.setId,

        setName:
          membership.setName,

        source:
          membership.source,

        sourceSection:
          membership.sourceSection,

        piecesRequired:
          null,

        effect:
          membership.bonusRaw,

        effectRaw:
          membership.bonusRaw,

        tieredEffects:
          []
      });
    }
  }

  return setBonuses;
}

function buildSetMembershipMap(namedSets) {
  const membershipMap = new Map();

  for (const namedSet of namedSets) {
    if (!Array.isArray(namedSet.items)) {
      continue;
    }

    for (const setItem of namedSet.items) {
      const itemKey = linkToItemKey(setItem.link);

      if (!itemKey) {
        continue;
      }

      if (!membershipMap.has(itemKey)) {
        membershipMap.set(itemKey, []);
      }

      const memberships = membershipMap.get(itemKey);
      const newMembership = createMembership(namedSet);

      const alreadyExists = memberships.some(
        membership => membership.setId === newMembership.setId
      );

      if (!alreadyExists) {
        memberships.push(newMembership);
      }
    }
  }

  return membershipMap;
}

function mergeSetMembership(existingMemberships, newMemberships) {
  const merged = new Map();

  for (const membership of existingMemberships || []) {
    const key =
      membership.setId || normalizeSetId(membership.setName);

    if (!key) {
      continue;
    }

    merged.set(key, membership);
  }

  for (const membership of newMemberships || []) {
    const key =
      membership.setId || normalizeSetId(membership.setName);

    if (!key) {
      continue;
    }

    merged.set(key, membership);
  }

  return [...merged.values()];
}

function setBonusKey(bonus) {
  if (typeof bonus === 'string') {
    return bonus.toLowerCase();
  }

  return [
    bonus.setId || '',
    bonus.piecesRequired ?? '',
    bonus.effect || bonus.effectRaw || bonus.raw || ''
  ]
    .join('|')
    .toLowerCase();
}

function mergeSetBonuses(existingBonuses, newBonuses) {
  const merged = new Map();

  for (const bonus of existingBonuses || []) {
    const key = setBonusKey(bonus);

    if (!key) {
      continue;
    }

    merged.set(key, bonus);
  }

  for (const bonus of newBonuses || []) {
    const key = setBonusKey(bonus);

    if (!key) {
      continue;
    }

    merged.set(key, bonus);
  }

  return [...merged.values()];
}

function readJsonFile(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeJsonFile(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function getJsonFiles(directory) {
  return fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(directory, file));
}

function enrichItemFile(filepath, membershipMap, matchedKeys) {
  const items = readJsonFile(filepath);

  if (!Array.isArray(items)) {
    console.log(`SKIPPED: ${path.basename(filepath)} is not an array`);

    return {
      file: path.basename(filepath),
      itemCount: 0,
      matchedCount: 0
    };
  }

  let matchedCount = 0;

  const enrichedItems = items.map(item => {
    const itemKey =
      item.itemKey || linkToItemKey(item.link);

    const newMemberships =
      membershipMap.get(itemKey) || [];

    if (newMemberships.length > 0) {
      matchedCount++;
      matchedKeys.add(itemKey);
    }

    const mergedMemberships =
      mergeSetMembership(
        item.setMembership || [],
        newMemberships
      );

    const newSetBonuses =
      createSetBonusEntries(newMemberships);

    const mergedSetBonuses =
      mergeSetBonuses(
        item.setBonuses || [],
        newSetBonuses
      );

    return {
      ...item,

      itemKey,

      setMembership:
        mergedMemberships,

      setBonuses:
        mergedSetBonuses
    };
  });

  const outputFile = inPlace
    ? filepath
    : path.join(outputDir, path.basename(filepath));

  writeJsonFile(outputFile, enrichedItems);

  return {
    file: path.basename(filepath),
    itemCount: enrichedItems.length,
    matchedCount
  };
}

function writeUnmatchedSetItems(membershipMap, matchedKeys) {
  const unmatched = [];

  for (const [itemKey, memberships] of membershipMap.entries()) {
    if (!matchedKeys.has(itemKey)) {
      unmatched.push({
        itemKey,
        memberships
      });
    }
  }

  const unmatchedFile = inPlace
    ? path.join(itemDir, 'unmatched_named_set_items.json')
    : path.join(outputDir, 'unmatched_named_set_items.json');

  writeJsonFile(unmatchedFile, unmatched);

  return {
    unmatchedFile,
    unmatchedCount: unmatched.length
  };
}

function main() {
  if (!fs.existsSync(setFile)) {
    throw new Error(`Could not find set file: ${setFile}`);
  }

  if (!fs.existsSync(itemDir)) {
    throw new Error(`Could not find item directory: ${itemDir}`);
  }

  if (!inPlace && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const namedSets = readJsonFile(setFile);
  const membershipMap = buildSetMembershipMap(namedSets);

  const itemFiles = getJsonFiles(itemDir);
  const matchedKeys = new Set();

  let totalItems = 0;
  let totalMatchedItems = 0;

  console.log(`Loaded ${namedSets.length} named item sets.`);
  console.log(`Built lookup for ${membershipMap.size} item links.`);
  console.log('');

  for (const filepath of itemFiles) {
    const result = enrichItemFile(filepath, membershipMap, matchedKeys);

    totalItems += result.itemCount;
    totalMatchedItems += result.matchedCount;

    console.log(
      `${result.file}: ${result.matchedCount}/${result.itemCount} items matched`
    );
  }

  const unmatched = writeUnmatchedSetItems(membershipMap, matchedKeys);

  console.log('');
  console.log('DONE');
  console.log(`Total items scanned: ${totalItems}`);
  console.log(`Total items matched to sets: ${totalMatchedItems}`);
  console.log(`Unmatched named-set item links: ${unmatched.unmatchedCount}`);
  console.log(`Unmatched report: ${unmatched.unmatchedFile}`);

  if (inPlace) {
    console.log('Mode: updated itemlist files in place');
  } else {
    console.log(`Mode: wrote enriched files to ${outputDir}`);
  }
}

try {
  main();
} catch (err) {
  console.error('ERROR:', err.message);
}