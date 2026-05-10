// augmentParser.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, '..', 'augmentlist');

const BASE_URL = "https://ddowiki.com";

function cleanText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMinLevel(text) {
  const cleaned = cleanText(text);
  const number = Number(cleaned);

  return Number.isNaN(number) ? null : number;
}

function removeTooltipNoise($, cell) {
  const clone = cell.clone();

  clone.find(".tooltip").remove();
  clone.find("style").remove();
  clone.find("img").remove();
  clone.find("sup").remove();

  return clone;
}

function getItemInfo($, nameCell) {
  const cleanCell = removeTooltipNoise($, nameCell);

  const link = cleanCell.find('a[href^="/page/Item:"]').first();

  if (!link.length) {
    return null;
  }

  return {
    name: cleanText(link.text()),
    link: BASE_URL + link.attr("href")
  };
}

function getListText($, cell) {
  const cleanCell = removeTooltipNoise($, cell);

  const results = [];

  cleanCell.find("li").each((_, li) => {
    const text = cleanText($(li).text());

    if (text) {
      results.push(text);
    }
  });

  return results;
}

function parseAugmentRow($, row) {
  const tds = $(row).find("> td");

  // Expected augment category table:
  // 0 = edit metadata
  // 1 = augment name
  // 2 = color
  // 3 = effect
  // 4 = minimum level
  // 5 = binding
  // 6 = source
  if (tds.length < 6) {
    return null;
  }

  const itemInfo = getItemInfo($, tds.eq(1));
  if (!itemInfo) {
    return null;
  }

  return {
    name: itemInfo.name,
    link: itemInfo.link,
    itemType: "augment",
    augmentColor: cleanText(tds.eq(2).text()),
    minLevel: parseMinLevel(tds.eq(4).text()),
    binding: cleanText(tds.eq(5).text()),
    effectsRaw: getListText($, tds.eq(3)),
    sourceRaw: tds.length >= 7 ? getListText($, tds.eq(6)) : []
  };
}

function parseAugmentCategoryHTML(html) {
  const $ = cheerio.load(html);
  const augments = [];

  $("tr").each((_, row) => {
    const augment = parseAugmentRow($, row);

    if (augment) {
      augments.push(augment);
    }
  });

  return augments;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeAugmentCategory(url, outputFile) {
  const response = await axios.get(url);

  const augments = parseAugmentCategoryHTML(response.data);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const filepath = path.join(OUTPUT_DIR, outputFile);
  fs.writeFileSync(filepath, JSON.stringify(augments, null, 2));

  console.log(`Saved ${augments.length} augments to ${filepath}`);

  await delay(750);
}

// Example usage
async function main() {
  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Colorless_augments",
    "colorless_augments.json"
  );

  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Red_augments",
    "red_augments.json"
  );

  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Blue_augments",
    "blue_augments.json"
  );
  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Yellow_augments",
    "yellow_augments.json"
  );
  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Purple_augments",
    "purple_augments.json"
  );
  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Orange_augments",
    "orange_augments.json"
  );
  await scrapeAugmentCategory(
    "https://ddowiki.com/page/Category:Green_augments",
    "green_augments.json"
  );
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseAugmentCategoryHTML,
  parseAugmentRow,
  scrapeAugmentCategory
};