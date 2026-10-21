// First, and not a plain dotenv.config() here: see the note in scripts/env.ts.
// Loading it late left the worker on the default database whatever .env.local
// said, because the client reads DATABASE_URL when it is imported.
import "./env";

import { runSchedulerTick } from "../src/lib/scheduler/tick";

const INTERVAL_SECONDS = Number(process.env.WORKER_INTERVAL_SECONDS ?? 300);

let stopping = false;
let currentTick: Promise<unknown> | null = null;

async function tick() {
    const startedAt = new Date();
    try {
        const result = await runSchedulerTick(startedAt);

        const generated = result.outcomes.filter((o) => o.action !== "skipped");
        if (generated.length === 0) {
            const reasons = result.outcomes.map((o) => `${o.name}: ${o.reason}`);
            console.log(
                `[worker] ${startedAt.toISOString()} — nothing due` +
                    (reasons.length ? ` (${reasons.join("; ")})` : " (no series)"),
            );
        } else {
            for (const o of generated) {
                console.log(`[worker] ${o.action} "${o.name}" — ${o.reason} (reel ${o.reelId})`);
            }
        }

        // Renders are reported separately: a tick can render reels without
        // generating anything, which is what happens the morning after a run
        // that was interrupted part-way through.
        for (const r of result.renders) {
            if (r.action === "rendered") {
                console.log(`[worker] rendered "${r.title}" — ${r.outputPath}`);
            } else if (r.action === "failed") {
                console.error(`[worker] render failed for "${r.title}" — ${r.reason}`);
            } else {
                console.log(`[worker] no render for "${r.title}" — ${r.reason}`);
            }
        }
    } catch (error) {
        // A worker that dies on one bad tick is worse than one that logs and
        // tries again on the next interval.
        console.error("[worker] tick failed:", error);
    }
}

async function loop() {
    console.log(
        `[worker] started; checking every ${INTERVAL_SECONDS}s. Series with frequency "daily" or "weekly" ` +
            `generate automatically, and any reel with all its shots gets rendered to MP4 — one render at a time.`,
    );

    while (!stopping) {
        currentTick = tick();
        await currentTick;
        currentTick = null;
        if (stopping) break;

        await new Promise((resolve) => setTimeout(resolve, INTERVAL_SECONDS * 1000));
    }
}

// Finish the reel in progress rather than abandoning it half-generated.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        if (stopping) process.exit(1); // Second signal: give up immediately.
        stopping = true;
        console.log(`\n[worker] ${signal} received; finishing the current tick. Press again to force quit.`);
        Promise.resolve(currentTick).finally(() => process.exit(0));
    });
}

loop().catch((error) => {
    console.error("[worker] fatal:", error);
    process.exit(1);
});
