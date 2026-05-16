# Part 1 (What & why): 
The main use of GenAI in this project is to save the user some time when playing Dungeons and Dragons Online. I constantly find myself spending hours planning for gear when undergoing a new reincarnation if I wanted to play a different class. If I can find a way to create a program where we didnt need to spend hours of planning for a DDO gearset, I could save other people plenty of time.

# Part 2 (Iterations): 
Version was loosely tracked in the commit history. Since this is a MVP, no version tracking is needed until the core functions of the application are working. The test output folder keeps track of the most recent testing done. 

# Part 3 (Code walkthrough): 

Files in this program:
* augmentlist: Json files consisting of augment data.
* filigreelist: Json files containing filigree data.
* itemlist: Original data piped from DDO Wiki. 
* itemlist_enriched: Pre-processed data from the "itemlist" folder.
* netlify: Holds the netlify functions. This is the main functions that are called when running the program.
* scraper: Holds all the data pipeline functions.
* setlist: Json files containing gear set data.
* src: Source files and components that hold the frontend of the application.
* testoutput: This is where the test outcomes are stored.
* tests: This is where the testing for the tool functions are held.
* tools: This is where all the helper functions are located.
* .env.example: holds the example when creating a .env file.
* .gitignore: Used to remove unecessary clutter when installing packages
* index.html: Entry point for the react frontend
* LICENSE: displays the GNU 3.0 license.
* README.md: Instructions on how to run the program
* REPORT.md: Developer log documenting the process of creating this application.
* requirements.md: Displays the requirements to run this program.
* vite.config.js: Config file for running vite.

All information gathered is publicly accessible online at https://ddowiki.com/



# Part 4 (AI disclosure & safety): 

GenAI and Agentic AI was used in conjunction when creating this product. Kiro was the IDE used for agentic AI related work, while ChatGPT was used for API calls and debugging specific core features of the application. The data pipeline logic and methods used to capture data is my original work.

* As for AI assistant failures, GPT-4o-mini kept choosing the wrong items every time. Having 4o-mini parse though every json file also introduced a high token cost associated with every function call. Functions were created to reduce the amount of JSON files the AI had to parse though.

* The AI would also add the wrong effects inside items on very rare occasions. 
This was a result of 2 situations:
    * The AI did not understand the JSON schema
    * The json schema was too confusing for an AI to understand

* There is also a problem of the AI refusing to add item augments to items when explicitly saying to do so. This was mainly caused by the AI confusing the augments for items. Since there was no meta tag on the augments, the AI would read through the json file for augments and do nothing with it.

* Prompt engineering was something I also had to tackle. I had to make sure that specific system prompts were set so the user could not steer the AI away from Dungeons and Dragons related content.