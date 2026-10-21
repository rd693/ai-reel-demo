/**
 * Points the render check at a database of its own. Imported first, for the
 * reason scripts/env.ts explains.
 *
 * It matters more here than anywhere: a scheduler tick generates whatever is
 * due, and running the check against the real database would spend real money
 * on real series.
 */
import "./env";

export const CHECK_DB = process.env.CHECK_RENDER_DB ?? "file:./dev-check-render.db";
process.env.DATABASE_URL = CHECK_DB;
