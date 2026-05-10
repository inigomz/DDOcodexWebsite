// namedItemSetsParser.js

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://ddowiki.com';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeNoise($, cell) {
  const clone = cell.clone();

  clone.find('.tooltip').remove();
  clone.find('style').remove();
  clone.find('img').remove();
  clone.find('sup').remove();

  return clone;
}

function cleanSectionTitle(text) {
  return cleanText(text)
    .replace(/\[\s*edit\s*\]$/i, '')
    .trim();
}

function normalizeId(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseMinLevels(rawSetName) {
  const mlMatch = rawSetName.match(/\[ML:\s*([^\]]+)\]/i);

  if (!mlMatch) {
    return [];
  }

  return mlMatch[1]
    .split('/')
    .map(value => Number(value.trim()))
    .filter(value => !Number.isNaN(value));
}

function parseSetName($, setCell) {
  const cleanCell = removeNoise($, setCell);

  const rawSetName = cleanText(cleanCell.text());

  const minLevels = parseMinLevels(rawSetName);

  const setName = rawSetName
    .replace(/\[ML:\s*[^\]]+\]/gi, '')
    .replace(/\[no ML\]/gi, '')
    .trim();

  const explicitId = cleanCell.find('span[id]').first().attr('id');

  return {
    setId: explicitId
      ? normalizeId(explicitId.replace(/_/g, ' '))
      : normalizeId(setName),

    setName,
    rawSetName,
    minLevels
  };
}

function itemNameFromAnchor($, anchor) {
  const title = $(anchor).attr('title');

  if (title && title.startsWith('Item:')) {
    return cleanText(title.replace(/^Item:/, ''));
  }

  return cleanText($(anchor).text());
}

function parseSlotFromLine(lineText) {
  const match = lineText.match(/\s-\s(.+)$/);

  if (!match) {
    return null;
  }

  return cleanText(match[1])
    .replace(/;.*$/, '')
    .replace(/\(.*?\)/g, '')
    .trim();
}

function extractItems($, itemCell) {
  const cleanCell = removeNoise($, itemCell);

  const items = [];
  const seenLinks = new Set();
  const itemsRaw = [];

  cleanCell.find('li').each((_, li) => {
    const liText = cleanText($(li).text());

    if (liText) {
      itemsRaw.push(liText);
    }

    const slotText = parseSlotFromLine(liText);

    $(li).find('a[href^="/page/Item:"]').each((_, anchor) => {
      const href = $(anchor).attr('href');

      if (!href) {
        return;
      }

      const link = BASE_URL + href;

      if (seenLinks.has(link)) {
        return;
      }

      seenLinks.add(link);

      items.push({
        name: itemNameFromAnchor($, anchor),
        link,
        slotText
      });
    });
  });

  // Fallback for item cells that do not use <li>
  if (items.length === 0) {
    cleanCell.find('a[href^="/page/Item:"]').each((_, anchor) => {
      const href = $(anchor).attr('href');

      if (!href) {
        return;
      }

      const link = BASE_URL + href;

      if (seenLinks.has(link)) {
        return;
      }

      seenLinks.add(link);

      items.push({
        name: itemNameFromAnchor($, anchor),
        link,
        slotText: null
      });
    });
  }

  const fallbackRaw = cleanText(cleanCell.text());

  if (itemsRaw.length === 0 && fallbackRaw) {
    itemsRaw.push(fallbackRaw);
  }

  return {
    items,
    itemsRaw
  };
}

function parsePiecesRequired(text) {
  const match = cleanText(text).match(
    /(\d+)\s+(?:Pieces|Piece|Items|Item)(?:\s+Equipped)?/i
  );

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function parseTieredEffects(text) {
  const cleaned = cleanText(text);

  const tierMap = {
    '♦': 'heroic',
    '●': 'epic',
    '★': 'legendary'
  };

  const tierPattern = /([♦●★])\s*([+-]?\d+(?:\.\d+)?%?)/g;
  const matches = [...cleaned.matchAll(tierPattern)];

  if (matches.length === 0) {
    return [];
  }

  const sharedEffectText = cleanText(
    cleaned.replace(tierPattern, '')
  );

  return matches.map(match => ({
    tier: tierMap[match[1]],
    symbol: match[1],
    valueText: match[2],
    effect: sharedEffectText
  }));
}

function createBonusObject(text, piecesRequired) {
  const cleaned = cleanText(text);

  return {
    piecesRequired:
      piecesRequired ?? parsePiecesRequired(cleaned),

    effect:
      cleaned,

    effectRaw:
      cleaned,

    tieredEffects:
      parseTieredEffects(cleaned)
  };
}

function extractBonuses($, bonusCell) {
  const cleanCell = removeNoise($, bonusCell);

  const bonusRaw = cleanText(cleanCell.text());
  const bonuses = [];

  let currentPiecesRequired = parsePiecesRequired(bonusRaw);

  cleanCell.children().each((_, child) => {
    const childNode = $(child);
    const tagName = childNode.prop('tagName');

    const childText = cleanText(childNode.text());

    if (!childText) {
      return;
    }

    const piecesFromChild = parsePiecesRequired(childText);

    if (piecesFromChild !== null) {
      currentPiecesRequired = piecesFromChild;
    }

    if (tagName === 'UL' || tagName === 'OL') {
      childNode.find('> li').each((_, li) => {
        const liText = cleanText($(li).text());

        if (!liText) {
          return;
        }

        bonuses.push(
          createBonusObject(liText, currentPiecesRequired)
        );
      });

      return;
    }

    // Some pages put the entire bonus directly in a paragraph
    // instead of a list. Avoid adding pure headers such as
    // "3 Pieces Equipped:" as standalone bonus effects.
    if (
      tagName === 'P' &&
      !/^\d+\s+(?:Pieces|Piece|Items|Item)(?:\s+Equipped)?:?$/i.test(childText)
    ) {
      bonuses.push(
        createBonusObject(childText, currentPiecesRequired)
      );
    }
  });

  // Fallback for bonus cells that do not use <li>, <ul>, or useful <p>
  if (bonuses.length === 0 && bonusRaw) {
    bonuses.push(
      createBonusObject(bonusRaw, parsePiecesRequired(bonusRaw))
    );
  }

  return {
    bonusRaw,
    bonuses
  };
}

function isNamedSetTable($, table) {
  const headers = table
    .find('tr')
    .first()
    .find('th')
    .map((_, th) => cleanText($(th).text()))
    .get();

  const hasSetName =
    headers.some(header => header.toLowerCase().includes('set name'));

  const hasItems =
    headers.some(header => header.toLowerCase().includes('items'));

  const hasSetBonus =
    headers.some(header => header.toLowerCase().includes('set bonus'));

  return hasSetName && hasItems && hasSetBonus;
}

function getSourceSection($, table) {
  const heading = table.prevAll('h2, h3').first();

  if (!heading.length) {
    return null;
  }

  return cleanSectionTitle(heading.text());
}

function parseNamedItemSetsHTML(html) {
  const $ = cheerio.load(html);

  const namedSets = [];

  $('table.wikitable').each((_, tableElement) => {
    const table = $(tableElement);

    if (!isNamedSetTable($, table)) {
      return;
    }

    const sourceSection = getSourceSection($, table);

    table.find('tbody > tr').each((_, row) => {
      const cells = $(row).children('td, th');

      // Skip header row
      if ($(row).find('th').length > 0) {
        return;
      }

      if (cells.length < 3) {
        return;
      }

      const setInfo = parseSetName($, cells.eq(0));

      if (!setInfo.setName) {
        return;
      }

      const itemInfo = extractItems($, cells.eq(1));
      const bonusInfo = extractBonuses($, cells.eq(2));

      namedSets.push({
        setId: setInfo.setId,
        setName: setInfo.setName,
        rawSetName: setInfo.rawSetName,
        sourceSection,
        minLevels: setInfo.minLevels,

        items: itemInfo.items,
        itemsRaw: itemInfo.itemsRaw,

        bonusRaw: bonusInfo.bonusRaw,
        bonuses: bonusInfo.bonuses
      });
    });
  });

  return namedSets;
}

async function scrapeNamedItemSets() {
  const url = 'https://ddowiki.com/page/Named_item_sets';

  const outputDir = path.join(__dirname, '..', 'setlist');
  const outputFile = path.join(outputDir, 'named_item_sets.json');

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'DDO-Gear-Planner-Bot/1.0'
    }
  });

  const namedSets = parseNamedItemSetsHTML(response.data);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  fs.writeFileSync(
    outputFile,
    JSON.stringify(namedSets, null, 2)
  );

  console.log(`SUCCESS: Saved ${namedSets.length} named item sets.`);
  console.log(`Output: ${outputFile}`);

  await delay(750);

  return {
    outputFile,
    count: namedSets.length
  };
}

async function main() {
  try {
    await scrapeNamedItemSets();
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  scrapeNamedItemSets,
  parseNamedItemSetsHTML,
  parseTieredEffects
};