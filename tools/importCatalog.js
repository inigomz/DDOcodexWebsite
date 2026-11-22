const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const batchSize = 500;

// Resolve catalog paths from the repository root so the script works from any directory.
function jsonFiles(directory, include) {
  return fs.readdirSync(path.join(root, directory))
    .filter(include)
    .sort()
    .map(file => `${directory}/${file}`);
}

function readDocuments(collection, file, identity, metadata = {}) {
  const source = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  // Crafting parsers wrap their records with scraper metadata.
  const rows = metadata.craftingSystem ? source?.recipes : source;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Expected a non-empty record array in ${file}`);
  }

  return rows.map((row, index) => {
    const location = `${file} record ${index + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Expected an object in ${location}`);
    }
    const parts = identity(row);
    if (parts.some(part => !(Number.isFinite(part) ||
        (typeof part === 'string' && part.trim())))) {
      throw new Error(`Missing or invalid identity in ${location}`);
    }
    // Use source identity so a refresh updates records whose effects or other fields changed.
    const id = createHash('sha256')
      .update(JSON.stringify([collection, ...parts]))
      .digest('hex');
    return { ...row, ...metadata, sourceFile: file, _id: id };
  });
}

function loadCatalog() {
  // The unmatched report sits beside the enriched gear but contains diagnostics.
  const gearFiles = jsonFiles('itemlist_enriched', file =>
    file.endsWith('.json') && file !== 'unmatched_named_set_items.json');
  const augmentFiles = jsonFiles('augmentlist', file => file.endsWith('_augments.json'));
  const craftingFiles = [
    ['dinosaur_bone', 'augmentlist/dinosaur_bone_crafting.json'],
    ['viktranium', 'augmentlist/viktranium_experiment_crafting.json']
  ];

  // Some gear keys repeat across categories, and filigree names repeat across generations.
  // Snowpeak filigrees have no generation, and some Dinosaur Bone recipes have no item group.
  return {
    items: gearFiles.flatMap(file => readDocuments('items', file, row => [file, row.itemKey])),
    augments: augmentFiles.flatMap(file => readDocuments('augments', file, row => [row.link || row.name])),
    namedSets: readDocuments('namedSets', 'setlist/named_item_sets.json', row => [row.setId]),
    filigrees: readDocuments('filigrees', 'filigreelist/filigrees.json',
      row => [row.generation ?? 'unassigned', row.setName, row.name]),
    craftingRecipes: craftingFiles.flatMap(([craftingSystem, file]) =>
      readDocuments('craftingRecipes', file,
        row => [
          craftingSystem, row.sectionId || row.sourceSection, row.slotType,
          row.itemGroup || 'ungrouped', row.name
        ],
        { craftingSystem }))
  };
}

function validateCatalog(catalog) {
  for (const [name, documents] of Object.entries(catalog)) {
    if (documents.length === 0) {
      throw new Error(`No source records found for ${name}`);
    }

    const ids = new Map();
    for (const document of documents) {
      const label = `${document.sourceFile} (${document.name || document.setName})`;
      if (ids.has(document._id)) {
        throw new Error(`Duplicate ${name} identity in ${ids.get(document._id)} and ${label}`);
      }
      ids.set(document._id, label);
    }
    console.log(`${name}: ${documents.length} records`);
  }
}

async function writeCatalog(catalog) {
  require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB || 'ddocodex';
  if (!uri) {
    throw new Error('Set MONGODB_URI to the full Atlas connection string before importing.');
  }

  const { MongoClient } = require('mongodb');
  let client;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    console.log(`Writing catalog to database ${databaseName}.`);
    const database = client.db(databaseName);

    for (const [name, documents] of Object.entries(catalog)) {
      const collection = database.collection(name);
      let inserted = 0;
      let matched = 0;
      // Replace each matching record so fields dropped by the scraper are cleared on refresh.
      for (let offset = 0; offset < documents.length; offset += batchSize) {
        const operations = documents.slice(offset, offset + batchSize).map(document => ({
          replaceOne: {
            filter: { _id: document._id },
            replacement: document,
            upsert: true
          }
        }));
        const result = await collection.bulkWrite(operations);
        inserted += result.upsertedCount;
        matched += result.matchedCount;
      }
      console.log(`${name}: ${inserted} inserted, ${matched} matched`);
    }
  } catch (error) {
    // Driver error details may contain connection information.
    const code = Number.isInteger(error.code) ? `, code ${error.code}` : '';
    throw new Error(`Atlas import failed (${error.constructor.name}${code}). Check Atlas access, credentials, and write permissions. Completed batches can be retried safely.`);
  } finally {
    await client?.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--dry-run', '--write'].includes(args[0]))) {
    throw new Error('Usage: node tools/importCatalog.js [--dry-run | --write]');
  }

  const catalog = loadCatalog();
  validateCatalog(catalog);
  if (args[0] === '--write') {
    await writeCatalog(catalog);
  } else {
    console.log('Dry run complete. No database connection was made.');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
