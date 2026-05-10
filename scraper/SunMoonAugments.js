// sunMoonAugmentParser.js

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const BASE_URL = "https://ddowiki.com";

function cleanText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeNoise($, cell) {
  const clone = cell.clone();

  clone.find(".tooltip").remove();
  clone.find("style").remove();
  clone.find("img").remove();
  clone.find("sup").remove();

  return clone;
}

function parseMinLevel(text) {
  const cleaned = cleanText(text);
  const number = Number(cleaned);

  return Number.isNaN(number) ? null : number;
}

function getItemInfo($, cell) {
  const cleanCell = removeNoise($, cell);

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
  const cleanCell = removeNoise($, cell);
  const results = [];

  cleanCell.find("li").each((_, li) => {
    const text = cleanText($(li).text());

    if (text) {
      results.push(text);
    }
  });

  // Some cells may not use <li>
  if (results.length === 0) {
    const fallback = cleanText(cleanCell.text());

    if (fallback) {
      results.push(fallback);
    }
  }

  return results;
}

function parseSunMoonAugmentHTML(html, options = {}) {
  const $ = cheerio.load(html);
  const augments = [];

  const table = $("table.wikitable.loot-table.viewPage").first();

  if (!table.length) {
    throw new Error("Could not find Sun/Moon augment table.");
  }

  table.find("tbody > tr").each((_, row) => {
    const cells = $(row).children("td, th");

    // Skip header row
    if ($(row).find("th").length > 0) {
      return;
    }

    if (cells.length < 6) {
      return;
    }

    const itemInfo = getItemInfo($, cells.eq(0));

    if (!itemInfo) {
      return;
    }

    augments.push({
      name: itemInfo.name,
      link: itemInfo.link,
      itemType: "augment",

      // This will usually be Sun or Moon
      augmentCategory: options.augmentCategory || null,

      // This comes from the Type column
      augmentType: cleanText(cells.eq(1).text()),

      effectsRaw: getListText($, cells.eq(2)),

      minLevel: parseMinLevel(cells.eq(3).text()),

      binding: cleanText(cells.eq(4).text()),

      locationRaw: getListText($, cells.eq(5))
    });
  });

  return augments;
}

async function scrapeSunMoonAugments(url, outputFile, options = {}) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "DDO-Gear-Planner-Bot/1.0"
    }
  });

  const augments = parseSunMoonAugmentHTML(response.data, options);

  fs.writeFileSync(
    outputFile,
    JSON.stringify(augments, null, 2)
  );

  console.log(`Saved ${augments.length} augments to ${outputFile}`);

  await delay(750);
}

async function main() {
  await scrapeSunMoonAugments(
    "https://ddowiki.com/page/Category:Moon_augments",
    "moon_augments.json",
    { augmentCategory: "Moon" }
  );

  await scrapeSunMoonAugments(
    "https://ddowiki.com/page/Category:Sun_augments",
    "sun_augments.json",
    { augmentCategory: "Sun" }
  );
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseSunMoonAugmentHTML,
  scrapeSunMoonAugments
};