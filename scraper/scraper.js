const axios = require('axios');      // For making HTTP requests
const cheerio = require('cheerio');  // For parsing HTML
const fs = require('fs');            // For saving JSON to disk
const path = require('path');        // For saving JSOn to itemlist


function cleanEnhancements(rawList) {
  const cleaned = [];
  let skipCount = 0;

  for (let i = 0; i < rawList.length; i++) {
    const entry = rawList[i];

    // Handle Red Augment Slot
    if (entry === 'Red Augment Slot') {
      cleaned.push(entry);
      skipCount = 6; // exactly 6 false entries follow
      continue;
    }

    // Handle Orange Augment Slot
    if (entry === 'Orange Augment Slot') {
      cleaned.push(entry);
      skipCount = 13; // exactly 13 false entries follow
      continue;
    }

    // Handle Purple Augment Slot
    if (entry === 'Purple Augment Slot'){
      cleaned.push(entry);
      skipCount = 17; // exactly 17 false entries follow
      continue
    }
    
    // Handle Yellow Augment Slot
    if (entry === 'Yellow Augment Slot'){
      cleaned.push(entry);
      skipCount = 11;
      continue
    }

    // Handle Green Augment Slot
    if (entry === 'Green Augment Slot'){
      cleaned.push(entry);
      skipCount = 22;
      continue
    }

    // Handle Colorless Augment Slot
    if (entry === 'Colorless Augment Slot'){
      cleaned.push(entry);
      skipCount = 4;
      continue
    }

    // Handle Blue Augment Slot
    if (entry === 'Blue Augment Slot'){
      cleaned.push(entry);
      skipCount = 15;
      continue
    }
    
    // Handle Primary and secondary Augment slot (edge case)
    if (entry === 'Fountain of Necrotic Might'){
      cleaned.push('Upgradeable - Primary Augment', 'Upgradeable - Secondary Augment')
      skipCount = 87
      continue;
    }

    // Skip tooltip-generated junk
    if (skipCount > 0) {
      skipCount--;
      continue;
    }

    // Everything else is valid
    cleaned.push(entry);
  }

  return [...new Set(cleaned)];
}
// Main function to scrape a specific item category
async function scrapeCategory(categoryName) {
  // Construct the URL to the DDO Wiki Category page
  const url = `https://ddowiki.com/page/Category:${encodeURIComponent(categoryName)}`;
  const outputDir = path.join(__dirname, '..', 'itemlist');
  
  try {
    const { data } = await axios.get(url); // Download page HTML
    const $ = cheerio.load(data);          // Load it into cheerio
    const items = [];                      // Hold the final scraped results

    // Go through each row of the first wikitable
    $('table.wikitable tr').each((_, row) => {
      const cols = $(row).find('td'); //find all data cells
      if (cols.length < 3) return; // Skip headers or malformed rows

      // Extract name and link
      const anchor = $(cols[0]).find('a'); //look for anchor attributes
      const name = anchor.text().trim();
      const link = 'https://ddowiki.com' + anchor.attr('href');

      // Skip category redirects
      if (link.includes('/Category:')) return;

      // Extract minimum level
      const minLevel = $(cols[2]).text().trim();

      // Extract enhancements from <href> tags inside column 2
      
      const enhancements = [];

      $(cols[1]).find('li').each((_, li) => {
        const a = $(li).find('a[href]').first();
        const text = a.text().trim();

        // Skip if no valid text or href
        if (!a.length || !text) return;

        // Skip anything with "Category:" in it
        if (text.toLowerCase().includes('category:')) return;

        enhancements.push(text);
      });

      // Save all info into the items list
      items.push({ name, link, minLevel, enhancements: cleanEnhancements(enhancements) });
    });

    // Create a filename like 'handwraps.json' and direct it to itemlist
    const filename = `${categoryName.toLowerCase().replace(/\s+/g, '_')}.json`;
    const filepath = path.join(outputDir, filename);

    // If itemlist doesn't exist, create a new folder and call it itemlist.
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    // Write the full item list to disk
    fs.writeFileSync(filepath, JSON.stringify(items, null, 2));
    console.log(`SUCCESS: Saved ${filename} with ${items.length} items`);

    // Return useful metadata
    return { filename, count: items.length };
  } catch (err) {
    throw new Error(`ERROR: Failed to scrape ${categoryName}: ${err.message}`);
  }
}

// Export the function so other files (like menu.js) can use it
module.exports = { scrapeCategory };
