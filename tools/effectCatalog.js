const {
  parseBonusEffect,
} = require('./bonusParser');

const {
  dedupeEffects,
  getResolvedItemEffects,
  getSelectableEffectGroupsFromEffects,
} = require('./selectableEffects');

const PREFIX_ORDER = [
  'Default',
  'Enhancement',
  'Equipment',
  'Competence',
  'Insightful',
  'Quality',
  'Exceptional',
  'Artifact',
  'Profane',
  'Sacred',
  'Alchemical',
  'Morale',
  'Luck',
  'Resistance',
  'Natural Armor',
  'Protection',
  'Festive',
];

const MALFORMED_STAT_PATTERN = /\d|,|\band\b|^hidden effect:/i;
const TRAILING_PREFIX_PATTERN = new RegExp(
  `\\s-\\s(?:${PREFIX_ORDER.join('|')})$`,
  'i',
);

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getRawItemEffects(item = {}) {
  const fields = [
    item.namedEffects,
    item.effects,
    item.effectsRaw,
    item.enhancements,
  ];

  for (const field of fields) {
    if (Array.isArray(field) && field.length > 0) {
      return field;
    }

    if (field) {
      return [field];
    }
  }

  return [];
}

function getCatalogEffects(item = {}) {
  const rawEffects = getRawItemEffects(item);
  const groups = getSelectableEffectGroupsFromEffects(rawEffects);
  const choices = groups.flatMap(
    (group) => group.choices.map((choice) => choice.raw),
  );

  return dedupeEffects([
    ...getResolvedItemEffects(item),
    ...choices,
  ]);
}

function isSetRequirementLine(effect) {
  const text = normalizeText(effect);

  return text.includes('pieces equipped')
    || /^\d+\s+pieces?\s+equipped/i.test(cleanText(effect));
}

function isCatalogBonus(parsed, rawEffect) {
  if (
    !parsed
    || !parsed.parsed
    || !parsed.stackKey
    || parsed.value === null
    || parsed.value === undefined
  ) {
    return false;
  }

  const stat = cleanText(parsed.stat);

  if (
    !stat
    || stat.length > 80
    || MALFORMED_STAT_PATTERN.test(stat)
    || TRAILING_PREFIX_PATTERN.test(stat)
  ) {
    return false;
  }

  return !isSetRequirementLine(rawEffect)
    && !String(rawEffect).includes('\u2192')
    && !/(one of|upgrade|becomes|\badds?\b|charges?|augment slot)/i.test(stat);
}

function getPrefixOrder(prefix) {
  const index = PREFIX_ORDER.indexOf(prefix);

  return index === -1 ? PREFIX_ORDER.length : index;
}

function buildEffectCatalog(items = [], augments = []) {
  const effectsById = new Map();

  function addSourceEffects({
    source,
    sourceKey,
    sourceType,
    effects,
  }) {
    const seenStackKeys = new Set();

    for (const effect of effects) {
      const parsed = parseBonusEffect(effect);

      if (
        !isCatalogBonus(parsed, effect)
        || seenStackKeys.has(parsed.stackKey)
      ) {
        continue;
      }

      seenStackKeys.add(parsed.stackKey);

      const stat = cleanText(parsed.stat);
      const effectId = slugify(stat);

      if (!effectId) {
        continue;
      }

      if (!effectsById.has(effectId)) {
        effectsById.set(effectId, {
          id: effectId,
          name: stat,
          sourceKeys: new Set(),
          prefixesById: new Map(),
        });
      }

      const catalogEffect = effectsById.get(effectId);
      const prefix = cleanText(parsed.bonusType || 'Default') || 'Default';

      if (!catalogEffect.prefixesById.has(prefix)) {
        catalogEffect.prefixesById.set(prefix, {
          id: prefix,
          label: prefix === 'Default' ? 'Standard / no prefix' : prefix,
          stackKey: parsed.stackKey,
          sourceKeys: new Set(),
          sources: {
            gear: 0,
            augment: 0,
          },
          minValue: Number(parsed.value || 0),
          maxValue: Number(parsed.value || 0),
          minLevel: Number(source.minLevel || 0),
          maxLevel: Number(source.minLevel || 0),
        });
      }

      const catalogPrefix = catalogEffect.prefixesById.get(prefix);

      catalogEffect.sourceKeys.add(sourceKey);
      catalogPrefix.sourceKeys.add(sourceKey);
      catalogPrefix.sources[sourceType] += 1;
      catalogPrefix.minValue = Math.min(
        catalogPrefix.minValue,
        Number(parsed.value || 0),
      );
      catalogPrefix.maxValue = Math.max(
        catalogPrefix.maxValue,
        Number(parsed.value || 0),
      );
      catalogPrefix.minLevel = Math.min(
        catalogPrefix.minLevel,
        Number(source.minLevel || 0),
      );
      catalogPrefix.maxLevel = Math.max(
        catalogPrefix.maxLevel,
        Number(source.minLevel || 0),
      );
    }
  }

  for (const item of items || []) {
    addSourceEffects({
      source: item,
      sourceKey: `gear:${item.itemKey || item.link || item.name}`,
      sourceType: 'gear',
      effects: getCatalogEffects(item),
    });
  }

  for (const augment of augments || []) {
    addSourceEffects({
      source: augment,
      sourceKey: `augment:${augment.itemKey || augment.link || augment.name}`,
      sourceType: 'augment',
      effects: dedupeEffects([
        ...(Array.isArray(augment.effectsRaw) ? augment.effectsRaw : []),
        ...(Array.isArray(augment.effects) ? augment.effects : []),
        ...(augment.effect ? [augment.effect] : []),
      ]),
    });
  }

  return Array.from(effectsById.values())
    .map((effect) => ({
      id: effect.id,
      name: effect.name,
      itemCount: effect.sourceKeys.size,
      prefixes: Array.from(effect.prefixesById.values())
        .map((prefix) => ({
          id: prefix.id,
          label: prefix.label,
          stackKey: prefix.stackKey,
          itemCount: prefix.sourceKeys.size,
          sources: prefix.sources,
          minValue: prefix.minValue,
          maxValue: prefix.maxValue,
          minLevel: prefix.minLevel,
          maxLevel: prefix.maxLevel,
        }))
        .sort((a, b) => {
          const orderDifference = getPrefixOrder(a.id) - getPrefixOrder(b.id);

          return orderDifference || a.label.localeCompare(b.label);
        }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeEffectSelections(selections = [], catalog = []) {
  const catalogById = new Map(
    catalog.map((effect) => [effect.id, effect]),
  );
  const normalized = [];
  const seen = new Set();

  for (const selection of (Array.isArray(selections) ? selections : []).slice(0, 25)) {
    const effect = catalogById.get(String(selection?.effectId || ''));

    if (!effect || seen.has(effect.id)) {
      continue;
    }

    const availablePrefixes = new Set(
      effect.prefixes.map((prefix) => prefix.id),
    );
    const prefixes = Array.from(new Set(
      (Array.isArray(selection.prefixes) ? selection.prefixes : [])
        .map(String)
        .filter((prefix) => availablePrefixes.has(prefix)),
    ));

    if (prefixes.length === 0) {
      continue;
    }

    seen.add(effect.id);
    normalized.push({
      effectId: effect.id,
      stat: effect.name,
      prefixes,
    });
  }

  return normalized;
}

function applyEffectSelectionsToProfile(buildProfile = {}, selections = []) {
  return {
    ...buildProfile,
    selectedEffects: selections,
  };
}

module.exports = {
  buildEffectCatalog,
  normalizeEffectSelections,
  applyEffectSelectionsToProfile,
  getCatalogEffects,
  slugify,
};
