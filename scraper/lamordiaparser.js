// viktraniumCraftingParser.js

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

function getItemInfo($, cell) {
  const cleanCell = removeNoise($, cell);
  const link = cleanCell.find('a[href^="/page/Item:"]').first();

  if (!link.length) {
    return {
      name: cleanText(cleanCell.text()),
      link: null
    };
  }

  return {
    name: cleanText(link.text()),
    link: BASE_URL + link.attr('href')
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

function parseRecipeTable($, table) {
  const sourceSection = getNearestSectionTitle($, table);
  const headers = getTableHeaders($, table);
  const recipeInfo = detectRecipeInfo(headers, sourceSection);

  const rows = [];
  let sharedCost = [];

  table.find('tbody > tr').each((_, row) => {
    const cells = $(row).children('td, th');

    // Skip header rows
    if ($(row).find('th').length > 0) {
      return;
    }

    if (cells.length < 2) {
      return;
    }

    const itemInfo = getItemInfo($, cells.eq(0));
    const effectRaw = getCellText($, cells.eq(1));

    let costRaw = sharedCost;

    // Cost often uses rowspan, so only the first row has the cost cell.
    if (cells.length >= 3) {
      const possibleCost = getListText($, cells.eq(2));

      if (possibleCost.length > 0) {
        sharedCost = possibleCost;
        costRaw = possibleCost;
      }
    }

    if (!itemInfo.name || !effectRaw) {
      return;
    }

    // Fallback: try to detect slot/group from the item name if headers did not give it.
    const fallbackText = `${itemInfo.name} ${sourceSection || ''}`;

    rows.push({
      itemType: 'crafting_augment',
      system: SYSTEM_NAME,

      slotType:
        recipeInfo.slotType || detectSlotType(fallbackText),

      itemGroup:
        recipeInfo.itemGroup || detectItemGroup(fallbackText),

      sourceSection,

      name: itemInfo.name,
      link: itemInfo.link,

      effectRaw,
      costRaw
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
  scrapeViktraniumCrafting
};