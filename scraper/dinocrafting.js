// dinoCraftingParser.js

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const BASE_URL = "https://ddowiki.com";

const SECTIONS = [
  "Scale_(Weapons)",
  "Fang_(Weapons)",
  "Claw_(Weapons)",
  "Horn_(Weapons)",

  "Scale_(Accessories)",
  "Fang_(Accessories)",
  "Claw_(Accessories)",
  "Horn_(Accessories)",

  "Scale_(Armors)",
  "Fang_(Armors)",

  "Set_Bonus",
  "Raid_Augments"
];

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
    link: BASE_URL + link.attr("href")
  };
}

function getCellText($, cell) {
  const cleanCell = removeNoise($, cell);
  return cleanText(cleanCell.text());
}

function getListText($, cell) {
  const cleanCell = removeNoise($, cell);
  const results = [];

  cleanCell.find("li").each((_, li) => {
    const text = cleanText($(li).text());
    if (text) results.push(text);
  });

  if (results.length === 0) {
    const fallback = cleanText(cleanCell.text());
    if (fallback) results.push(fallback);
  }

  return results;
}

function decodeSectionName(sectionId) {
  return sectionId.replace(/_/g, " ");
}

function parseSectionType(sectionId) {
  const match = sectionId.match(/^(.+)_\((.+)\)$/);

  if (!match) {
    return {
      slotType: sectionId.replace(/_/g, " "),
      itemGroup: null
    };
  }

  return {
    slotType: match[1],
    itemGroup: match[2]
  };
}

function getTableForSection($, sectionId) {
  const heading = $(`#${sectionId}`);

  if (!heading.length) {
    return null;
  }

  return heading
    .closest("h2, h3, h4")
    .nextAll("table.wikitable")
    .first();
}

function parseRecipeTable($, table, sectionId) {
  const rows = [];
  let sharedCost = [];

  const sectionInfo = parseSectionType(sectionId);

  table.find("tbody > tr").each((_, row) => {
    const cells = $(row).children("td, th");

    // Skip header row
    if ($(row).find("th").length > 0) {
      return;
    }

    if (cells.length < 2) {
      return;
    }

    const itemInfo = getItemInfo($, cells.eq(0));
    const effect = getCellText($, cells.eq(1));

    let cost = [];

    // Cost often appears once with rowspan
    if (cells.length >= 3) {
      cost = getListText($, cells.eq(2));
      if (cost.length > 0) {
        sharedCost = cost;
      }
    } else {
      cost = sharedCost;
    }

    if (!itemInfo.name || !effect) {
      return;
    }

    rows.push({
      itemType: "dinosaur_bone_augment",
      sectionId,
      sectionName: decodeSectionName(sectionId),
      slotType: sectionInfo.slotType,
      itemGroup: sectionInfo.itemGroup,
      name: itemInfo.name,
      link: itemInfo.link,
      effectRaw: effect,
      costRaw: cost
    });
  });

  return rows;
}

function parseDinosaurBoneCraftingHTML(html) {
  const $ = cheerio.load(html);

  const result = {
    recipes: [],
    missingSections: []
  };

  for (const sectionId of SECTIONS) {
    const table = getTableForSection($, sectionId);

    if (!table || !table.length) {
      result.missingSections.push(sectionId);
      continue;
    }

    const rows = parseRecipeTable($, table, sectionId);
    result.recipes.push(...rows);
  }

  return result;
}

async function scrapeDinosaurBoneCrafting(url, outputFile) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "DDO-Gear-Planner-Bot/1.0"
    }
  });

  const parsed = parseDinosaurBoneCraftingHTML(response.data);

  fs.writeFileSync(
    outputFile,
    JSON.stringify(parsed, null, 2)
  );

  console.log(`Saved ${parsed.recipes.length} dinosaur bone recipes.`);
  console.log(`Missing sections: ${parsed.missingSections.join(", ") || "none"}`);

  await delay(750);
}

async function main() {
  await scrapeDinosaurBoneCrafting(
    "https://ddowiki.com/page/Dinosaur_Bone_crafting",
    "dinosaur_bone_crafting.json"
  );
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseDinosaurBoneCraftingHTML,
  parseRecipeTable,
  scrapeDinosaurBoneCrafting
};