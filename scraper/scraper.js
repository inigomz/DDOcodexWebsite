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

function parseMinLevel(value) {
  const cleaned = cleanText(value);

  if (
    !cleaned ||
    cleaned.toLowerCase() === 'none'
  ) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isNaN(number)
    ? null
    : number;
}

function cleanEnhancements(rawList) {
  const cleaned = [];
  let skipCount = 0;

  for (let i = 0; i < rawList.length; i++) {
    const entry = rawList[i];

    if (entry === 'Red Augment Slot') {
      cleaned.push(entry);
      skipCount = 6;
      continue;
    }

    if (entry === 'Orange Augment Slot') {
      cleaned.push(entry);
      skipCount = 13;
      continue;
    }

    if (entry === 'Purple Augment Slot') {
      cleaned.push(entry);
      skipCount = 17;
      continue;
    }

    if (entry === 'Yellow Augment Slot') {
      cleaned.push(entry);
      skipCount = 11;
      continue;
    }

    if (entry === 'Green Augment Slot') {
      cleaned.push(entry);
      skipCount = 22;
      continue;
    }

    if (entry === 'Colorless Augment Slot') {
      cleaned.push(entry);
      skipCount = 4;
      continue;
    }

    if (entry === 'Blue Augment Slot') {
      cleaned.push(entry);
      skipCount = 15;
      continue;
    }

    if (entry === 'Fountain of Necrotic Might') {
      cleaned.push(
        'Upgradeable - Primary Augment',
        'Upgradeable - Secondary Augment'
      );

      skipCount = 87;
      continue;
    }

    if (skipCount > 0) {
      skipCount--;
      continue;
    }

    cleaned.push(entry);
  }

  return [...new Set(cleaned)];
}

function extractEffects(rawEffects) {
  const augmentSlots = [];
  const craftingSlots = [];
  const setBonuses = [];
  const namedEffects = [];

  for (const effect of rawEffects) {
    // Normal augment slots:
    // Red Augment Slot
    // Orange Augment Slot
    // Purple Augment Slot
    const augmentMatch =
      effect.match(/^(.+?) Augment Slot$/i);

    if (augmentMatch) {
      augmentSlots.push(
        cleanText(augmentMatch[1])
      );
      continue;
    }

    // Special crafting slots:
    // Isle of Dread: Scale Slot (Weapon): Empty
    // Isle of Dread: Fang Slot (Accessory): Empty
    // Lamordia: Melancholic Slot (Weapon)
    // Lamordia: Dolorous Slot (Weapon)
    const craftingSlotMatch = effect.match(
      /^([^:]+):\s*([^:()]+?)\s+Slot\s+\((Weapon|Accessory|Armor)\)(?::\s*(.+))?$/i
    );

    if (craftingSlotMatch) {
      craftingSlots.push({
        system: cleanText(craftingSlotMatch[1]),
        slotType: cleanText(craftingSlotMatch[2]),
        itemGroup: cleanText(craftingSlotMatch[3]),
        status: craftingSlotMatch[4]
          ? cleanText(craftingSlotMatch[4])
          : null
      });
      continue;
    }

    // Set bonuses
    if (
      effect.includes('Set') ||
      effect.includes('Legendary') ||
      effect.includes('Profane Experiment')
    ) {
      setBonuses.push(effect);
      continue;
    }

    // Everything else is a normal named effect
    namedEffects.push(effect);
  }

  return {
    augmentSlots,
    craftingSlots,
    setBonuses,
    namedEffects
  };
}

function categoryToSlot(categoryName) {
  const map = {
    // Accessories
    'Head items': 'head',
    'Hand items': 'hands',
    'Back items': 'back',
    'Waist items': 'waist',
    'Feet items': 'feet',
    'Wrist items': 'wrists',
    'Eye items': 'eyes',
    'Neck items': 'neck',
    'Finger items': 'finger',
    'Trinket items': 'trinket',

    // Armor
    'Cloth armor': 'armor',
    'Light armor': 'armor',
    'Medium armor': 'armor',
    'Heavy armor': 'armor',
    'Docents': 'armor',

    // Offhand items
    'Bucklers': 'offhand',
    'Small shields': 'offhand',
    'Large shields': 'offhand',
    'Tower shields': 'offhand',
    'Orbs': 'offhand',
    'Rune Arms': 'offhand',

    // Weapons
    'Clubs': 'weapon',
    'Quarterstaffs': 'weapon',
    'Daggers': 'weapon',
    'Sickles': 'weapon',
    'Light Maces': 'weapon',
    'Heavy Maces': 'weapon',
    'Morningstars': 'weapon',
    'Heavy Crossbows': 'weapon',
    'Light Crossbows': 'weapon',
    'Hand Axes': 'weapon',
    'Battle Axes': 'weapon',
    'Great Axes': 'weapon',
    'Kukris': 'weapon',
    'Long Swords': 'weapon',
    'Great Swords': 'weapon',
    'Scimitars': 'weapon',
    'Falchions': 'weapon',
    'Long Bows': 'weapon',
    'Short Swords': 'weapon',
    'Rapiers': 'weapon',
    'Heavy Picks': 'weapon',
    'Light Picks': 'weapon',
    'Light Hammers': 'weapon',
    'War Hammers': 'weapon',
    'Mauls': 'weapon',
    'Great Clubs': 'weapon',
    'Short Bows': 'weapon',
    'Bastard Swords': 'weapon',
    'Dwarven War Axes': 'weapon',
    'Kamas': 'weapon',
    'Khopeshes': 'weapon',
    'Handwraps': 'weapon',
    'Great Crossbows': 'weapon',
    'Repeating Heavy Crossbows': 'weapon',
    'Repeating Light Crossbows': 'weapon',
    'Throwing Axes': 'weapon',
    'Throwing Daggers': 'weapon',
    'Throwing Hammers': 'weapon',
    'Darts': 'weapon',
    'Shurikens': 'weapon',

    // Pets
    'Collars': 'collar'
  };

  return map[categoryName] || null;
}

function categoryToSubtype(categoryName) {
  const map = {
    // Shields
    'Bucklers': 'buckler',
    'Small shields': 'small_shield',
    'Large shields': 'large_shield',
    'Tower shields': 'tower_shield',

    // Spellcasting
    'Orbs': 'orb',
    'Rune Arms': 'rune_arm',

    // Weapons
    'Clubs': 'club',
    'Quarterstaffs': 'quarterstaff',
    'Daggers': 'dagger',
    'Sickles': 'sickle',
    'Light Maces': 'light_mace',
    'Heavy Maces': 'heavy_mace',
    'Morningstars': 'morningstar',
    'Heavy Crossbows': 'heavy_crossbow',
    'Light Crossbows': 'light_crossbow',
    'Hand Axes': 'hand_axe',
    'Battle Axes': 'battle_axe',
    'Great Axes': 'great_axe',
    'Kukris': 'kukri',
    'Long Swords': 'long_sword',
    'Great Swords': 'great_sword',
    'Scimitars': 'scimitar',
    'Falchions': 'falchion',
    'Long Bows': 'long_bow',
    'Short Swords': 'short_sword',
    'Rapiers': 'rapier',
    'Heavy Picks': 'heavy_pick',
    'Light Picks': 'light_pick',
    'Light Hammers': 'light_hammer',
    'War Hammers': 'war_hammer',
    'Mauls': 'maul',
    'Great Clubs': 'great_club',
    'Short Bows': 'short_bow',
    'Bastard Swords': 'bastard_sword',
    'Dwarven War Axes': 'dwarven_war_axe',
    'Kamas': 'kama',
    'Khopeshes': 'khopesh',
    'Handwraps': 'handwraps',
    'Great Crossbows': 'great_crossbow',
    'Repeating Heavy Crossbows': 'repeating_heavy_crossbow',
    'Repeating Light Crossbows': 'repeating_light_crossbow',
    'Throwing Axes': 'throwing_axe',
    'Throwing Daggers': 'throwing_dagger',
    'Throwing Hammers': 'throwing_hammer',
    'Darts': 'dart',
    'Shurikens': 'shuriken'
  };

  return map[categoryName] || null;
}

function categoryToHandedness(categoryName) {
  const map = {
    // Two-handed weapons
    'Falchions': 'two_handed',
    'Great Axes': 'two_handed',
    'Great Clubs': 'two_handed',
    'Great Swords': 'two_handed',
    'Mauls': 'two_handed',
    'Quarterstaffs': 'two_handed',

    'Long Bows': 'two_handed',
    'Short Bows': 'two_handed',

    // Offhand-only
    'Bucklers': 'offhand_only',
    'Small shields': 'offhand_only',
    'Large shields': 'offhand_only',
    'Tower shields': 'offhand_only',
    'Orbs': 'offhand_only',
    'Rune Arms': 'offhand_only'
  };

  return map[categoryName] || 'one_handed';
}

async function scrapeCategory(categoryName) {
  const url =
    `https://ddowiki.com/page/Category:${encodeURIComponent(categoryName)}`;

  const outputDir =
    path.join(__dirname, '..', 'itemlist');

  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'DDO-Gear-Planner-Bot/1.0'
      }
    });

    const $ = cheerio.load(data);

    const items = [];

    $('table.wikitable tr').each((_, row) => {
      const cols = $(row).find('td');

      if (cols.length < 3) {
        return;
      }

      const anchor =
        $(cols[0]).find('a[href]').first();

      if (!anchor.length) {
        return;
      }

      const name =
        cleanText(anchor.text());

      const href =
        anchor.attr('href');

      if (!href) {
        return;
      }

      const link =
        BASE_URL + href;

      if (link.includes('/Category:')) {
        return;
      }

      const minLevel =
        parseMinLevel(
          $(cols[2]).text()
        );

      const rawEnhancements = [];

      $(cols[1]).find('li').each((_, li) => {
        const clone = $(li).clone();

        clone.find('.tooltip').remove();
        clone.find('style').remove();
        clone.find('img').remove();
        clone.find('sup').remove();

        const text =
          cleanText(clone.text());

        if (!text) {
          return;
        }

        if (
          text.toLowerCase()
            .includes('category:')
        ) {
          return;
        }

        rawEnhancements.push(text);
      });

      const effectsRaw =
        cleanEnhancements(rawEnhancements);

      const {
        augmentSlots,
        craftingSlots,
        setBonuses,
        namedEffects
      } = extractEffects(effectsRaw);

      items.push({
        name,

        link,

        slot:
          categoryToSlot(categoryName),

        itemSubtype:
          categoryToSubtype(categoryName),

        handedness:
          categoryToHandedness(categoryName),

        category:
          categoryName,

        minLevel,

        effectsRaw,

        augmentSlots,

        craftingSlots,

        setBonuses,

        namedEffects
      });
    });

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const filename =
      `${categoryName
        .toLowerCase()
        .replace(/\s+/g, '_')}.json`;

    const filepath =
      path.join(outputDir, filename);

    fs.writeFileSync(
      filepath,
      JSON.stringify(items, null, 2)
    );

    console.log(
      `SUCCESS: Saved ${filename} with ${items.length} items`
    );

    await delay(750);

    return {
      filename,
      count: items.length
    };

  } catch (err) {
    throw new Error(
      `ERROR: Failed to scrape ${categoryName}: ${err.message}`
    );
  }
}

module.exports = {
  scrapeCategory
};