// Import required modules
const readline = require('readline');                 // For CLI input
const { scrapeCategory } = require('./scraper');      // Import the scraper function

// Set up readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// List of scrapeable DDO categories
const categories = ['Cloth armor', 'Light armor', 'Medium armor', 'Heavy armor', 'Docents', 'Bucklers', 'Small shields', 'Large shields', 'Tower shields', 'Orbs', 'Head items', 'Hand items', 'Back items', 'Waist items', 'Feet items', 'Wrist items', 'Eye items', 'Neck items', 'Finger items', 'Trinket items', 'Clubs', 'Quarterstaffs', 'Daggers', 'Sickles', 'Light Maces', 'Heavy Maces', 'Morningstars', 'Heavy Crossbows', 'Light Crossbows', 'Hand Axes', 'Battle Axes', 'Great Axes', 'Kukris', 'Long Swords', 'Great Swords', 'Scimitars', 'Falchions', 'Long Bows', 'Short Swords', 'Rapiers', 'Heavy Picks', 'Light Picks', 'Light Hammers', 'War Hammers', 'Mauls', 'Great Clubs', 'Short Bows', 'Bastard Swords', 'Dwarven War Axes', 'Kamas', 'Khopeshes', 'Handwraps', 'Rune Arms', 'Great Crossbows', 'Repeating Heavy Crossbows', 'Repeating Light Crossbows', 'Throwing Axes', 'Throwing Daggers', 'Throwing Hammers', 'Darts', 'Shurikens', 'Collars' ];

// Display a numbered menu to the user
console.log('Select a category to scrape:');
categories.forEach((cat, i) => console.log(`${i + 1}) ${cat}`));

// Ask user to choose a category
rl.question('Enter a number: ', async (answer) => {
  const index = parseInt(answer, 10) - 1;     // Convert input to array index
  const selected = categories[index];         // Get the selected category

  // If answer is 0, do all categories
  if (answer === '0') {
    for (const category of categories) {
      try {
        const {filename, count} = await scrapeCategory(category);
        console.log(`${category}: ${count} items saved to ${filename}`);
        await new Promise(res => setTimeout(res, 500));
      } catch(err){
        console.error(`${category}: ${err.message}`)
      }
    }
    rl.close() // Exit input mode
    return;
  }

  if (!selected) {
    console.log('Invalid selection.');
    rl.close(); // Exit input mode
    return;
  }


  try {
    // Call the scrape function and wait for the result
    const { filename, count } = await scrapeCategory(selected);
    console.log(`SUCCESS: Saved ${filename} with ${count} items`);
  } catch (err) {
    // Display any error that occurred during scraping
    console.error('ERROR:', err.message);
  }

  rl.close(); // Clean up the readline interface
});

