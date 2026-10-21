/**
 * Environment for the standalone scripts. Import it before anything else.
 *
 * Next loads .env.local automatically; a script does not — but calling
 * dotenv.config() at the top of one does not work either. `import` is hoisted
 * above every statement in a module, so by the time that line runs the imports
 * have already loaded, and src/lib/db/client reads DATABASE_URL exactly once,
 * when it loads. A module whose only job is to set the environment sidesteps
 * that: imports run in the order they are written, so this one goes first.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
