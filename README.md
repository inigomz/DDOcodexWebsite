# DDO Codex — Gear Planner

https://cevangelddocodex.netlify.app/

An AI-powered gear planner for *Dungeons & Dragons Online (DDO)*. Describe your build in plain English and get a full optimized gear loadout — items, augments, crafting assignments, gap analysis, and an AI advisor report.

---

## What it does

- Parses a natural-language build goal (level, class, primary stat, weapon type, armor preference)
- Searches enriched item data across all equipment slots
- Selects a stack-aware gear set that avoids duplicate bonus stacking
- Plans normal augments and Lamordia crafting augments to fill stat gaps
- Validates slot rules, augment rules, and stacking conflicts
- Optionally sends the full result to OpenAI (gpt-4o-mini) for a written advisor report
- Includes a **floating DDO-only chatbot** powered by OpenAI for general DDO questions (builds, quests, mechanics, items, set bonuses, etc.) — animated with [anime.js](https://animejs.com) v4

---

## Requirements

- **Node.js** v18 or higher
- **npm** v8 or higher
- An **OpenAI API key** (needed for the AI advisor feature **and the chatbot**)
- A **Netlify account** (only needed for deployment)

---

## Local development

### 1. Clone the repo

```bash
git clone https://github.com/inigomz/DDOcodexWebsite.git
cd DDOcodexWebsite
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example env file and add your OpenAI key:

```bash
cp .env.example .env
```

Edit `.env`:

```
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
```



### 4. Start the local dev server

```bash
npm run dev
```

This runs `netlify dev`, which starts two things at once:
- The **React frontend** (Vite) on port 5173
- The **Netlify Functions emulator** on port 8888

Open **http://localhost:8888** in your browser.

> If you don't have `netlify-cli` installed globally, it runs from the local `node_modules`. No separate install needed.

---

## How to use the planner

1. Type a build description in the text box, for example:
   - `Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, PRR, MRR, and Dodge`
   - `Level 34 Strength melee fighter using great axe and heavy armor, focused on Melee Power and Doublestrike`
2. Click **Plan Gear**
3. Review the selected gear, augment plan, remaining gaps, and stacking conflicts
4. Click **Get AI Advice** for a written breakdown from the advisor

The planner reads the following from your description automatically:
- Character level (defaults to 34 if not specified)
- Build type (melee, tactical, monk, caster, tank, defensive)
- Primary stat (Strength, Dexterity, Wisdom, etc.)
- Preferred weapon subtype (handwraps, great axe, falchion, etc.)
- Armor preference (cloth, light, medium, heavy)

---

## DDO chatbot

A floating chat button (bottom-right of every page) opens a DDO-only assistant powered by OpenAI. Use it for general questions that aren't tied to a specific gear plan — class mechanics, quest details, set bonuses, reincarnation rules, enhancement trees, and so on.

- **Animation**: anime.js v4 drives an idle pulse, hover spring, click bounce, and panel slide-in
- **Strict scope**: the system prompt refuses anything not related to *Dungeons & Dragons Online*
- **Conversation memory**: the last 10 turns are sent back as context on each request
- **Endpoint**: `POST /.netlify/functions/ddoChat` with `{ message, history }`, returns `{ reply }`
- **Model**: `gpt-4o-mini` by default (override with the `OPENAI_MODEL` env var)

The chatbot needs `OPENAI_API_KEY` set — locally in `.env`, in production via Netlify environment variables.

---

## Build for production

```bash
npm run build
```

Outputs a static bundle to `dist/`. This is what Netlify deploys.

---

## Deploy to Netlify

### One-time setup

1. Push the repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
3. Select your repository — Netlify auto-detects `netlify.toml` and uses `npm run build` / `dist` automatically
4. Go to **Site configuration → Environment variables** and add:
   - `OPENAI_API_KEY` — your OpenAI API key
   - `OPENAI_MODEL` — `gpt-4o-mini` (optional, this is the default)
   - `USE_OPENAI_ADVISOR` — `true` (optional, defaults to true when key is present)
5. Click **Deploy site**

### Continuous deployment

After the initial setup, every `git push` to the main branch triggers an automatic redeploy. No manual steps required.

---

## Scraper scripts (data pipeline)

The item, augment, and set data in `itemlist_enriched/`, `augmentlist/`, and `setlist/` is pre-scraped from [ddowiki.com](https://ddowiki.com). You only need to re-run the scrapers if you want to refresh the data.

```bash
# Scrape all item categories interactively
node scraper/menu.js

# Scrape named item sets
node scraper/nameditemsetsparser.js

# Scrape augments
node scraper/augmentscraper.js

# Scrape Lamordia (Viktranium Experiment) crafting recipes
node scraper/lamordiaparser.js

# Scrape dinosaur bone crafting recipes
node scraper/dinocrafting.js

# Scrape filigrees
node scraper/filligreeparser.js

# Enrich item files with set membership data (writes to itemlist_enriched/)
node scraper/enrichItemsWithSets.js
```

Scrapers use a polite 750ms delay between requests and identify themselves as `DDO-Gear-Planner-Bot/1.0`.

---

## Manual test scripts

The `tests/` directory contains standalone scripts for testing individual pipeline modules. Run them with Node directly — no test runner required.

```bash
node tests/testgearsetbuilder.js
node tests/testaugmentgapplanner.js
node tests/testgearsetvalidator.js
node tests/testbuildprofile.js
```

---

## Project structure

```
DDOcodexWebsite/
├── src/                        # React frontend (Vite)
│   ├── components/
│   │   ├── PlannerForm.jsx     # Build goal input form
│   │   ├── GearResults.jsx     # Gear, augments, gaps, conflicts display
│   │   ├── AdvisorReport.jsx   # AI advisor markdown output
│   │   └── DDOChatbot.jsx      # Floating DDO-only chatbot (anime.js animations)
│   ├── App.jsx                 # Root component, API calls
│   └── main.jsx                # React entry point
├── netlify/
│   └── functions/
│       ├── planGear.js         # Full planner pipeline (no OpenAI)
│       ├── advisor.js          # OpenAI advisor endpoint
│       └── ddoChat.js          # DDO-only chatbot endpoint (OpenAI)
├── tools/                      # Core planner logic (Node.js modules)
├── scraper/                    # Data collection scripts
├── tests/                      # Manual smoke-test scripts
├── itemlist_enriched/          # Enriched item JSON data
├── augmentlist/                # Augment and crafting recipe JSON data
├── setlist/                    # Named item set JSON data
├── filigreelist/               # Filigree JSON data
├── .env                        # Local secrets (gitignored)
├── .env.example                # Template for .env
├── netlify.toml                # Netlify build and function config
└── package.json
```

---

## Data sources

All game data is scraped from [DDO Wiki](https://ddowiki.com). This project is not affiliated with Standing Stone Games.
