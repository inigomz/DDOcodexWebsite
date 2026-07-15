const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  getResolvedItemEffects,
  getSelectableEffectGroupsFromEffects,
  isChoiceGroupText,
} = require('../tools/selectableEffects');

const {
  loadAllItems,
  getScorableEffects,
  scoreItem,
} = require('../tools/gearsearch');

const {
  validateGearset,
} = require('../tools/gearsetValidator');

const {
  compactSelectedGearItem,
} = require('../tools/buildSummary');

const {
  parseItemBonuses,
} = require('../tools/bonusParser');

const {
  buildStackAwareGearset,
} = require('../tools/gearSetBuilder');

const WISDOM_PROFILE = {
  primaryStats: ['Wisdom'],
  priorityTerms: [],
  secondaryTerms: [],
  avoidTerms: [],
};

function loadItems(filename) {
  const filepath = path.join(
    __dirname,
    '..',
    'itemlist_enriched',
    filename,
  );

  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function findItem(filename, name) {
  const item = loadItems(filename).find(
    (candidate) => candidate.name === name,
  );

  assert.ok(item, `Expected ${name} in ${filename}`);
  return item;
}

test('repeated item effects do not change search score or validation', () => {
  const baseItem = {
    name: 'Canonical Wisdom Helm',
    itemKey: 'test:canonical-wisdom-helm',
    slot: 'head',
    minLevel: 1,
    namedEffects: ['Wisdom +14'],
  };

  const duplicateItem = {
    ...baseItem,
    namedEffects: [
      'Wisdom +14',
      ' wisdom   +14 ',
      'WISDOM +14',
    ],
  };

  const query = {
    maxLevel: 34,
    slot: 'head',
    buildProfile: WISDOM_PROFILE,
  };

  assert.deepEqual(
    getScorableEffects(duplicateItem, WISDOM_PROFILE),
    ['Wisdom +14'],
  );
  assert.equal(scoreItem(duplicateItem, query), scoreItem(baseItem, query));

  const validation = validateGearset({
    equippedItems: [duplicateItem],
    buildProfile: WISDOM_PROFILE,
  });

  assert.equal(validation.stackingConflicts.length, 0);
  assert.equal(validation.bonusSources.length, 1);
});

test('legacy fallback fields are deduplicated per item', () => {
  const item = {
    name: 'Legacy Wisdom Helm',
    itemKey: 'test:legacy-wisdom-helm',
    slot: 'head',
    effectsRaw: ['Wisdom +14'],
    enhancements: [' wisdom   +14 '],
  };

  assert.deepEqual(
    getResolvedItemEffects(item, WISDOM_PROFILE),
    ['Wisdom +14'],
  );
  assert.equal(parseItemBonuses(item).length, 1);
});

test('item loading excludes nameless enrichment report rows', () => {
  const itemDir = path.join(__dirname, '..', 'itemlist_enriched');
  const items = loadAllItems(itemDir);

  assert.ok(items.length > 7000);
  assert.equal(items.some((item) => !item.name), false);
});

test('identical bonuses from different items remain a real conflict', () => {
  const validation = validateGearset({
    equippedItems: [
      {
        name: 'Wisdom Helm',
        itemKey: 'test:wisdom-helm',
        slot: 'head',
        namedEffects: ['Wisdom +14'],
      },
      {
        name: 'Wisdom Necklace',
        itemKey: 'test:wisdom-necklace',
        slot: 'neck',
        namedEffects: ['Wisdom +14'],
      },
    ],
    buildProfile: WISDOM_PROFILE,
  });

  assert.equal(validation.stackingConflicts.length, 1);
  assert.equal(validation.stackingConflicts[0].stackKey, 'Default:Wisdom');
});

test('gear selection prefers a complementary effect over a suppressed copy', () => {
  const result = buildStackAwareGearset({
    buildProfile: {
      ...WISDOM_PROFILE,
      priorityTerms: ['Deadly'],
    },
    gearGroups: [
      {
        label: 'Head',
        requestedLimit: 2,
        fullCandidates: [
          {
            name: 'Anchor Wisdom Helm',
            itemKey: 'test:anchor-wisdom-helm',
            slot: 'head',
            searchScore: 2000,
            namedEffects: ['Wisdom +14'],
          },
        ],
      },
      {
        label: 'Neck',
        requestedLimit: 2,
        fullCandidates: [
          {
            name: 'Redundant Wisdom Necklace',
            itemKey: 'test:redundant-wisdom-necklace',
            slot: 'neck',
            searchScore: 1000,
            namedEffects: ['Wisdom +14'],
          },
          {
            name: 'Complementary Deadly Necklace',
            itemKey: 'test:complementary-deadly-necklace',
            slot: 'neck',
            searchScore: 0,
            namedEffects: ['Deadly +10'],
          },
        ],
      },
    ],
  });

  assert.deepEqual(
    result.selectedItems.map((item) => item.name),
    ['Anchor Wisdom Helm', 'Complementary Deadly Necklace'],
  );
});

test('Collective Sight resolves and displays one real choice per group', () => {
  const item = findItem('eye_items.json', 'Legendary Collective Sight');
  const resolved = getResolvedItemEffects(item, WISDOM_PROFILE);
  const compact = compactSelectedGearItem(item, WISDOM_PROFILE);

  assert.ok(resolved.includes('Wisdom +13'));
  assert.ok(resolved.includes('Insightful Wisdom +6'));
  assert.ok(resolved.includes('Quality Resistance +2'));
  assert.ok(resolved.includes('Temperance of Belief'));
  assert.equal(resolved.some(isChoiceGroupText), false);
  assert.equal(resolved.some((effect) => effect === 'Strength +13'), false);
  assert.deepEqual(compact.effects, resolved);
});

test("Shade's Hood retains one fully-qualified elemental choice", () => {
  const item = findItem('head_items.json', "Shade's Hood (level 14)");
  const resolved = getResolvedItemEffects(item, WISDOM_PROFILE);
  const elementalChoices = resolved.filter(
    (effect) => /^(Acid|Cold|Fire|Electric|Sonic) Resistance \+25$/.test(effect),
  );

  assert.ok(resolved.includes('Resistance +5'));
  assert.equal(elementalChoices.length, 1);
  assert.equal(resolved.includes('Resistance +25'), false);
  assert.equal(resolved.some(isChoiceGroupText), false);
});

test('every current choice wrapper maps to actual source effects', () => {
  const itemDir = path.join(__dirname, '..', 'itemlist_enriched');
  const files = fs.readdirSync(itemDir).filter(
    (filename) => filename.endsWith('.json')
      && filename !== 'unmatched_named_set_items.json',
  );
  let groupCount = 0;

  for (const filename of files) {
    for (const item of loadItems(filename)) {
      const effects = item.namedEffects || item.effects || item.effectsRaw || [];
      const groups = getSelectableEffectGroupsFromEffects(
        effects,
        WISDOM_PROFILE,
      );

      for (const group of groups) {
        groupCount += 1;
        assert.ok(
          group.choices.length >= 2,
          `${item.name} has an unresolved choice wrapper: ${group.wrapper}`,
        );
      }
    }
  }

  assert.ok(groupCount >= 200);
});
