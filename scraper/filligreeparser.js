// filigreeParser.js

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, '..', 'filigreelist');

function cleanText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSetName(raw) {
  const text = cleanText(raw);

  return {
    name: text.replace(/\s*\((Rare)\)\s*/gi, "").trim(),
    isRareSet: /\(Rare\)/i.test(text)
  };
}

function parseBonus(raw) {
  const text = cleanText(raw);

  // Example:
  // Strength +1
  // PRR +2
  // Arcane Spell Failure -10%

  const match = text.match(/^(.+?)\s*([+-]\d+)\s*(%)?$/);

  if (match) {
    return {
      name: cleanText(match[1]),
      value: Number(match[2]),
      unit: match[3] ? "percent" : "number",
      raw: text
    };
  }

  return {
    name: text,
    value: null,
    unit: null,
    raw: text
  };
}

function extractSetBonuses($, cell) {
  const bonuses = [];

  cell.find("li").each((_, li) => {
    const text = cleanText($(li).text());

    const match = text.match(/^(\d+)\s+Pieces:\s*(.+)$/i);

    if (match) {
      bonuses.push({
        pieces: Number(match[1]),
        effect: cleanText(match[2])
      });
    }
  });

  return bonuses;
}

function parseFiligreeHTML(html) {
  const $ = cheerio.load(html);

  const filigrees = [];

  let currentGeneration = null;
  let currentSet = null;
  let currentSetBonuses = [];

  // ONLY parse the real filigree table
  const filigreeTable = $("#Filigree_list")
    .closest("h2")
    .nextAll("table.wikitable.searchable")
    .first();

  if (!filigreeTable.length) {
    throw new Error("Could not find filigree table.");
  }

  filigreeTable.find("tbody > tr").each((_, row) => {

    const cells = $(row).children("th, td");

    // Skip column header row
    if ($(row).find("th[data-type]").length > 0) {
      return;
    }

    if (cells.length < 3) {
      return;
    }

    let index = 0;

    // New set row
    if (
      cells.eq(0).is("th") &&
      cells.eq(1).is("th")
    ) {

      currentGeneration = Number(
        cleanText(cells.eq(0).text())
      );

      currentSet = parseSetName(
        cells.eq(1).text()
      );

      index = 2;
    }

    if (!currentSet) {
      return;
    }

    const name = cleanText(
      cells.eq(index).text()
    );

    const effectRaw = cleanText(
      cells.eq(index + 1).text()
    );

    const rareBonusEffectRaw = cleanText(
      cells.eq(index + 2).text()
    );

    if (!name || !effectRaw) {
      return;
    }

    // Set bonuses only appear on first row due to rowspan
    const possibleSetBonusCell =
      cells.eq(index + 3);

    if (
      possibleSetBonusCell.length &&
      possibleSetBonusCell.find("li").length
    ) {
      currentSetBonuses = extractSetBonuses(
        $,
        possibleSetBonusCell
      );
    }

    filigrees.push({
      itemType: "filigree",

      generation: currentGeneration,

      setName: currentSet.name,

      isRareSet: currentSet.isRareSet,

      name,

      effectRaw,

      rareBonusEffectRaw:
        rareBonusEffectRaw || null,

      effect: parseBonus(effectRaw),

      rareBonusEffect:
        rareBonusEffectRaw
          ? parseBonus(rareBonusEffectRaw)
          : null,

      setBonuses: currentSetBonuses
    });
  });

  return filigrees;
}

async function scrapeFiligrees(url, outputFile) {

  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "DDO-Gear-Planner-Bot/1.0"
    }
  });

  const filigrees = parseFiligreeHTML(
    response.data
  );

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const filepath = path.join(OUTPUT_DIR, outputFile);

  fs.writeFileSync(
    filepath,
    JSON.stringify(filigrees, null, 2)
  );

  console.log(
    `Saved ${filigrees.length} filigrees to ${filepath}`
  );

  // Delay between requests
  await delay(750);
}

async function main() {

  await scrapeFiligrees(
    "https://ddowiki.com/page/Sentient_Weapon/Filigrees",
    "filigrees.json"
  );

}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseFiligreeHTML,
  parseBonus,
  scrapeFiligrees
};