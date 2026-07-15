const assert = require('node:assert/strict');
const test = require('node:test');

const {
  handler,
} = require('../netlify/functions/planGear');

const {
  buildBonusTargets,
} = require('../tools/bonusTargets');

const {
  scoreItem,
} = require('../tools/gearsearch');

const {
  getResolvedItemEffects,
} = require('../tools/selectableEffects');

const {
  buildNeutralProfile,
} = require('../tools/buildProfile');

const TEST_GOAL = 'level 34 wisdom monk melee defensive handwraps';

const QUALITY_WISDOM_PROFILE = {
  primaryStats: [],
  priorityTerms: [],
  secondaryTerms: [],
  avoidTerms: [],
  selectedEffects: [
    {
      effectId: 'wisdom',
      stat: 'Wisdom',
      prefixes: ['Quality'],
    },
  ],
};

async function invokePlanner(httpMethod, body = null) {
  const response = await handler({
    httpMethod,
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });

  return {
    ...response,
    json: response.body ? JSON.parse(response.body) : null,
  };
}

test('neutral profile does not infer build preferences', () => {
  const profile = buildNeutralProfile();

  assert.equal(profile.maxLevel, 34);
  assert.equal(profile.useNaturalLanguage, false);
  assert.deepEqual(profile.buildTypes, []);
  assert.deepEqual(profile.primaryStats, []);
  assert.deepEqual(profile.priorityTerms, []);
  assert.deepEqual(profile.secondaryTerms, []);
  assert.deepEqual(profile.avoidTerms, []);
  assert.deepEqual(profile.preferredWeaponSubtypes, []);
  assert.equal(profile.armorPreference.enforceArmorType, false);
  assert.deepEqual(profile.armorPreference.allowedArmorTypes, []);
});

test('planner effect selection and locking API', async (t) => {
  const catalogResponse = await invokePlanner('GET');

  await t.test('GET returns a clean effect catalog with selectable prefixes', () => {
    assert.equal(catalogResponse.statusCode, 200);
    assert.match(
      catalogResponse.headers['Access-Control-Allow-Methods'],
      /GET/,
    );

    const { effects } = catalogResponse.json;

    assert.ok(Array.isArray(effects));
    assert.ok(effects.length > 100);
    assert.equal(
      new Set(effects.map((effect) => effect.id)).size,
      effects.length,
    );

    const forbiddenCatalogText = /\d|,|\band\b|one of|upgrade|becomes|\badds?\b|charges?|augment slot|^hidden effect:/i;
    const trailingPrefixText = /\s-\s(?:insightful|quality|exceptional|artifact|profane|festive)$/i;

    for (const effect of effects) {
      assert.ok(effect.id);
      assert.ok(effect.name);
      assert.ok(effect.name.length <= 80);
      assert.doesNotMatch(effect.name, forbiddenCatalogText);
      assert.doesNotMatch(effect.name, trailingPrefixText);
      assert.ok(effect.prefixes.length > 0);
      assert.equal(
        new Set(effect.prefixes.map((prefix) => prefix.id)).size,
        effect.prefixes.length,
      );

      for (const prefix of effect.prefixes) {
        assert.equal(prefix.stackKey, `${prefix.id}:${effect.name}`);
        assert.ok(prefix.itemCount > 0);
      }
    }

    const wisdom = effects.find((effect) => effect.id === 'wisdom');

    assert.ok(wisdom);
    assert.deepEqual(
      ['Default', 'Insightful', 'Quality'].every(
        (prefixId) => wisdom.prefixes.some(
          (prefix) => prefix.id === prefixId,
        ),
      ),
      true,
    );
    assert.equal(
      wisdom.prefixes.find((prefix) => prefix.id === 'Default').label,
      'Standard / no prefix',
    );
  });

  await t.test('selected prefixes use exact scoring and exact targets', () => {
    const query = {
      maxLevel: 34,
      slot: 'head',
      buildProfile: QUALITY_WISDOM_PROFILE,
    };
    const standardItem = {
      name: 'Standard Wisdom Helm',
      itemKey: 'test:standard-wisdom-helm',
      slot: 'head',
      minLevel: 30,
      namedEffects: ['Wisdom +15'],
    };
    const qualityItem = {
      name: 'Quality Wisdom Helm',
      itemKey: 'test:quality-wisdom-helm',
      slot: 'head',
      minLevel: 30,
      namedEffects: ['Quality Wisdom +3'],
    };

    assert.ok(
      scoreItem(qualityItem, query) > scoreItem(standardItem, query),
    );

    const targets = buildBonusTargets(QUALITY_WISDOM_PROFILE);

    assert.equal(targets.length, 1);
    assert.equal(targets[0].stackKey, 'Quality:Wisdom');
    assert.deepEqual(
      targets[0].acceptableStackKeys,
      ['Quality:Wisdom'],
    );
    assert.equal(targets[0].category, 'user_selected');
  });

  await t.test('selected prefixes resolve selectable item effects exactly', () => {
    const item = {
      name: 'Selectable Wisdom Helm',
      itemKey: 'test:selectable-wisdom-helm',
      slot: 'head',
      namedEffects: [
        'One of the following: Wisdom +13 Insightful Wisdom +6 Quality Wisdom +3',
        'Wisdom +13',
        'Insightful Wisdom +6',
        'Quality Wisdom +3',
      ],
    };
    const resolved = getResolvedItemEffects(
      item,
      {
        ...QUALITY_WISDOM_PROFILE,
        primaryStats: ['Strength'],
      },
    );

    assert.deepEqual(resolved, ['Quality Wisdom +3']);
  });

  const legacyResponse = await invokePlanner(
    'POST',
    { goal: TEST_GOAL },
  );

  await t.test('POST remains compatible with a legacy goal-only request', () => {
    assert.equal(legacyResponse.statusCode, 200);
    assert.ok(legacyResponse.json.summary);
    assert.ok(legacyResponse.json.summary.selectedGear.length > 0);
    assert.deepEqual(legacyResponse.json.effectSelections, []);
    assert.equal(legacyResponse.json.useNaturalLanguage, true);
  });

  const effectsOnlyResponse = await invokePlanner(
    'POST',
    {
      goal: 'level 10 strength monk using a quarterstaff',
      useNaturalLanguage: false,
      effectSelections: [
        {
          effectId: 'wisdom',
          prefixes: ['Quality'],
        },
      ],
    },
  );

  await t.test('effect selections can plan without natural-language parsing', () => {
    assert.equal(effectsOnlyResponse.statusCode, 200);
    assert.equal(effectsOnlyResponse.json.useNaturalLanguage, false);
    assert.equal(effectsOnlyResponse.json.summary.goal, 'Selected effects only');
    assert.equal(
      effectsOnlyResponse.json.summary.buildProfile.useNaturalLanguage,
      false,
    );
    assert.equal(effectsOnlyResponse.json.summary.buildProfile.maxLevel, 34);
    assert.deepEqual(
      effectsOnlyResponse.json.summary.buildProfile.buildTypes,
      [],
    );
    assert.deepEqual(
      effectsOnlyResponse.json.summary.buildProfile.primaryStats,
      [],
    );
    assert.deepEqual(
      effectsOnlyResponse.json.effectSelections,
      [{
        effectId: 'wisdom',
        stat: 'Wisdom',
        prefixes: ['Quality'],
      }],
    );
    assert.ok(effectsOnlyResponse.json.candidateGroups.length > 0);
  });

  const effectsOnlyHeadGroup = effectsOnlyResponse.json.candidateGroups.find(
    (group) => group.groupId === 'head' && group.candidates.length > 1,
  );

  assert.ok(
    effectsOnlyHeadGroup,
    'Expected effects-only planning to return head alternatives.',
  );

  const effectsOnlyLockedHead = effectsOnlyHeadGroup.candidates[1];
  const effectsOnlyLockedResponse = await invokePlanner(
    'POST',
    {
      useNaturalLanguage: false,
      effectSelections: [
        {
          effectId: 'wisdom',
          prefixes: ['Quality'],
        },
      ],
      lockedItems: {
        head: effectsOnlyLockedHead.itemKey,
      },
    },
  );

  await t.test('effects-only mode persists through a locked-item rerun', () => {
    assert.equal(effectsOnlyLockedResponse.statusCode, 200);
    assert.equal(effectsOnlyLockedResponse.json.useNaturalLanguage, false);

    const lockedGroup = effectsOnlyLockedResponse.json.candidateGroups.find(
      (group) => group.groupId === 'head',
    );

    assert.equal(lockedGroup.selectedItemKey, effectsOnlyLockedHead.itemKey);
    assert.equal(lockedGroup.lockedItemKey, effectsOnlyLockedHead.itemKey);
  });

  const emptyEffectsOnlyResponse = await invokePlanner(
    'POST',
    {
      useNaturalLanguage: false,
      effectSelections: [],
    },
  );

  await t.test('effects-only planning requires at least one effect', () => {
    assert.equal(emptyEffectsOnlyResponse.statusCode, 400);
    assert.match(emptyEffectsOnlyResponse.json.error, /at least one effect/i);
  });

  const invalidEffectsOnlyResponse = await invokePlanner(
    'POST',
    {
      useNaturalLanguage: false,
      effectSelections: [
        {
          effectId: 'not-a-real-effect',
          prefixes: ['Default'],
        },
      ],
    },
  );

  await t.test('invalid effects cannot bypass effects-only validation', () => {
    assert.equal(invalidEffectsOnlyResponse.statusCode, 400);
    assert.match(invalidEffectsOnlyResponse.json.error, /at least one effect/i);
  });

  const genericWeaponResponse = await invokePlanner(
    'POST',
    {
      useNaturalLanguage: false,
      effectSelections: [
        {
          effectId: 'doublestrike',
          prefixes: ['Default'],
        },
      ],
    },
  );

  await t.test('effects-only planning keeps generic weapon and offhand valid', () => {
    assert.equal(genericWeaponResponse.statusCode, 200);
    assert.equal(
      genericWeaponResponse.json.summary.counts.validationErrorCount,
      0,
    );
  });

  await t.test('candidate groups contain at most five unique items', () => {
    const groups = legacyResponse.json.candidateGroups;

    assert.ok(Array.isArray(groups));
    assert.ok(groups.length > 0);
    assert.ok(groups.some((group) => group.candidates.length === 5));
    assert.equal(
      new Set(groups.map((group) => group.groupId)).size,
      groups.length,
    );

    for (const group of groups) {
      const itemKeys = group.candidates.map((item) => item.itemKey);

      assert.ok(group.candidates.length > 0);
      assert.ok(group.candidates.length <= 5);
      assert.equal(new Set(itemKeys).size, itemKeys.length);
      assert.equal(group.selectedItemKey, itemKeys[0]);
    }
  });

  const headGroup = legacyResponse.json.candidateGroups.find(
    (group) => group.groupId === 'head' && group.candidates.length > 1,
  );

  assert.ok(headGroup, 'Expected at least two head candidates.');

  const lockedHead = headGroup.candidates[1];
  const lockedResponse = await invokePlanner(
    'POST',
    {
      goal: TEST_GOAL,
      lockedItems: {
        head: lockedHead.itemKey,
      },
    },
  );

  await t.test('a valid locked item remains selected while planning continues', () => {
    assert.equal(lockedResponse.statusCode, 200);

    const lockedGroup = lockedResponse.json.candidateGroups.find(
      (group) => group.groupId === 'head',
    );

    assert.ok(lockedGroup);
    assert.equal(lockedGroup.lockedItemKey, lockedHead.itemKey);
    assert.equal(lockedGroup.selectedItemKey, lockedHead.itemKey);
    assert.equal(lockedGroup.candidates[0].itemKey, lockedHead.itemKey);
    assert.ok(
      lockedResponse.json.summary.selectedGear.some(
        (item) => item.itemKey === lockedHead.itemKey,
      ),
    );
  });

  const invalidResponse = await invokePlanner(
    'POST',
    {
      goal: TEST_GOAL,
      lockedItems: {
        head: 'item:this_item_does_not_exist',
        unknown_group: 'item:this_group_does_not_exist',
      },
    },
  );

  await t.test('invalid item and group locks return a client error', () => {
    assert.equal(invalidResponse.statusCode, 400);
    assert.match(invalidResponse.json.error, /locked items/i);
    assert.ok(invalidResponse.json.invalidLocks.includes('head'));
    assert.ok(invalidResponse.json.invalidLocks.includes('unknown_group'));
  });
});
