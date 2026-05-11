// lamordiaparser.js

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://ddowiki.com';

const SYSTEM_NAME = 'Lamordia';

const SLOT_TYPES = [
  'Melancholic',
  'Dolorous',
  'Miserable',
  'Woeful'
];

const ITEM_GROUPS = [
  'Weapon',
  'Accessory',
  'Armor'
];

function cleanText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeNoise($, cell) {
  const clone = cell.clone();

  clone.find('.tooltip').remove();
  clone.find('style').remove();
  clone.find('img').remove();
  clone.find('sup').remove();

  return clone;
}

function getCellText($, cell) {
  const cleanCell = removeNoise($, cell);

  return cleanText(cleanCell.text());
}

function getListText($, cell) {
  const cleanCell = removeNoise($, cell);
  const results = [];

  cleanCell.find('li').each((_, li) => {
    const text = cleanText($(li).text());

    if (text) {
      results.push(text);
    }
  });

  if (results.length === 0) {
    const fallback = cleanText(cleanCell.text());

    if (fallback) {
      results.push(fallback);
    }
  }

  return results;
}

function getNameFromItemLink(link) {
  if (!link) {
    return null;
  }

  const match = link.match(/\/page\/Item:([^#?]+)/);

  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1])
    .replace(/_/g, ' ')
    .trim();
}

function isWeakVisibleName(name) {
  const cleaned = cleanText(name).toLowerCase();

  return (
    cleaned === '(heroic)' ||
    cleaned === '(legendary)' ||
    cleaned === '(heroic - dreadful)' ||
    cleaned === 'heroic' ||
    cleaned === 'legendary' ||
    cleaned === ''
  );
}

function getItemInfo($, cell) {
  const cleanCell = removeNoise($, cell);
  const link = cleanCell.find('a[href^="/page/Item:"]').first();

  if (!link.length) {
    const fallbackName = cleanText(cleanCell.text());

    return {
      name: fallbackName,
      link: null,
      visibleName: fallbackName
    };
  }

  const visibleName = cleanText(link.text());
  const fullLink = BASE_URL + link.attr('href');

  const derivedName = getNameFromItemLink(link.attr('href'));

  const name = isWeakVisibleName(visibleName)
    ? derivedName || visibleName
    : visibleName;

  return {
    name,
    link: fullLink,
    visibleName
  };
}

function getNearestSectionTitle($, table) {
  const heading = table.prevAll('h2, h3, h4').first();

  if (!heading.length) {
    return null;
  }

  return cleanText(heading.text())
    .replace(/\[\s*edit\s*\]$/i, '')
    .trim();
}

function getTableHeaders($, table) {
  return table
    .find('tr')
    .first()
    .find('th')
    .map((_, th) => cleanText($(th).text()))
    .get();
}

function detectSlotType(text) {
  const lowered = cleanText(text).toLowerCase();

  return SLOT_TYPES.find(slotType =>
    lowered.includes(slotType.toLowerCase())
  ) || null;
}

function detectItemGroup(text) {
  const lowered = cleanText(text).toLowerCase();

  return ITEM_GROUPS.find(group =>
    lowered.includes(group.toLowerCase())
  ) || null;
}

function detectRecipeInfo(headers, sourceSection) {
  const combined = [
    ...headers,
    sourceSection || ''
  ].join(' ');

  const slotType = detectSlotType(combined);
  const itemGroup = detectItemGroup(combined);

  return {
    slotType,
    itemGroup
  };
}

function isViktraniumRecipeTable($, table) {
  const headers = getTableHeaders($, table);
  const headerText = headers.join(' ').toLowerCase();

  const hasEffectColumn =
    headerText.includes('effect') ||
    headerText.includes('enchantment') ||
    headerText.includes('bonus');

  const hasCostColumn =
    headerText.includes('cost') ||
    headerText.includes('ingredient');

  const mentionsSlotType =
    SLOT_TYPES.some(slotType =>
      headerText.includes(slotType.toLowerCase())
    );

  return hasEffectColumn && (hasCostColumn || mentionsSlotType);
}

function getFirstText(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function isNoHeroicVersion(text) {
  return cleanText(text)
    .toLowerCase()
    .includes('n/a (no heroic version');
}

function hasLegendaryOnlyName(name) {
  return cleanText(name)
    .toLowerCase()
    .includes('(legendary)');
}

function createTieredEffects({
  itemName,
  heroicEffectRaw,
  legendaryEffectRaw
}) {
  const tieredEffects = [];

  const heroicIsMissing = isNoHeroicVersion(heroicEffectRaw);

  if (heroicEffectRaw && !heroicIsMissing && !hasLegendaryOnlyName(itemName)) {
    tieredEffects.push({
      tier: 'heroic',
      effectRaw: heroicEffectRaw
    });
  }

  if (legendaryEffectRaw) {
    tieredEffects.push({
      tier: 'legendary',
      effectRaw: legendaryEffectRaw
    });
  } else if (hasLegendaryOnlyName(itemName) && heroicEffectRaw && !heroicIsMissing) {
    tieredEffects.push({
      tier: 'legendary',
      effectRaw: heroicEffectRaw
    });
  }

  return tieredEffects;
}

function parseRecipeTable($, table) {
  const sourceSection = getNearestSectionTitle($, table);
  const headers = getTableHeaders($, table);
  const recipeInfo = detectRecipeInfo(headers, sourceSection);

  const rows = [];
  let sharedLegendaryEffectRawList = [];

  table.find('tbody > tr').each((_, row) => {
    const cells = $(row).children('td, th');

    // Skip header rows.
    if ($(row).find('th').length > 0) {
      return;
    }

    if (cells.length < 2) {
      return;
    }

    const itemInfo = getItemInfo($, cells.eq(0));

    // The second column is the heroic effect in Heroic rows.
    const heroicEffectRaw = getCellText($, cells.eq(1));

    let legendaryEffectRawList = sharedLegendaryEffectRawList;

    // The third column is named "cost" by the old parser,
    // but for this table it often contains the Legendary effect.
    // It can use rowspan, so later rows may inherit the same cell.
    if (cells.length >= 3) {
      const possibleLegendaryEffect = getListText($, cells.eq(2));

      if (possibleLegendaryEffect.length > 0) {
        sharedLegendaryEffectRawList = possibleLegendaryEffect;
        legendaryEffectRawList = possibleLegendaryEffect;
      }
    }

    const legendaryEffectRaw = getFirstText(legendaryEffectRawList);

    if (!itemInfo.name || !heroicEffectRaw) {
      return;
    }

    const fallbackText = `${itemInfo.name} ${sourceSection || ''}`;

    const slotType =
      recipeInfo.slotType || detectSlotType(fallbackText);

    const itemGroup =
      recipeInfo.itemGroup || detectItemGroup(fallbackText);

    const tieredEffects = createTieredEffects({
      itemName: itemInfo.name,
      heroicEffectRaw,
      legendaryEffectRaw
    });

    rows.push({
      itemType: 'crafting_augment',
      system: SYSTEM_NAME,

      slotType,
      itemGroup,

      sourceSection,

      name: itemInfo.name,
      visibleName: itemInfo.visibleName,
      link: itemInfo.link,

      heroicEffectRaw: isNoHeroicVersion(heroicEffectRaw)
        ? null
        : heroicEffectRaw,

      legendaryEffectRaw,

      tieredEffects,

      // Backward compatibility with older planner code.
      // New planner code should prefer heroicEffectRaw,
      // legendaryEffectRaw, or tieredEffects.
      effectRaw: heroicEffectRaw,
      costRaw: legendaryEffectRawList
    });
  });

  return rows;
}

function parseViktraniumCraftingHTML(html) {
  const $ = cheerio.load(html);

  const result = {
    recipes: [],
    skippedTables: 0
  };

  $('table.wikitable').each((_, tableElement) => {
    const table = $(tableElement);

    if (!isViktraniumRecipeTable($, table)) {
      result.skippedTables++;
      return;
    }

    const rows = parseRecipeTable($, table);

    // Keep only rows that have Lamordia-style slot metadata.
    const validRows = rows.filter(row =>
      row.slotType && row.itemGroup
    );

    result.recipes.push(...validRows);
  });

  return result;
}

async function scrapeViktraniumCrafting(url, outputFile) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'DDO-Gear-Planner-Bot/1.0'
    }
  });

  const parsed = parseViktraniumCraftingHTML(response.data);

  fs.writeFileSync(
    outputFile,
    JSON.stringify(parsed, null, 2)
  );

  console.log(`Saved ${parsed.recipes.length} Viktranium/Lamordia recipes.`);
  console.log(`Skipped tables: ${parsed.skippedTables}`);

  await delay(750);
}

async function main() {
  await scrapeViktraniumCrafting(
    'https://ddowiki.com/page/Viktranium_Experiment_crafting',
    'viktranium_experiment_crafting.json'
  );
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseViktraniumCraftingHTML,
  parseRecipeTable,
  scrapeViktraniumCrafting,

  // Exported for tests/debugging.
  getFirstText,
  isNoHeroicVersion,
  createTieredEffects,
  getNameFromItemLink
};