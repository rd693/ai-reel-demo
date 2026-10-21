import fs from "fs/promises";
import path from "path";

import { reelRepo } from "../db/reelRepo";
import { renderJobRepo } from "../db/renderJobRepo";
import type { RenderJobView } from "../db/mappers";
import { assetBaseUrl, renderReelToMp4 } from "./renderReel";

/**
 * Running a render job, independent of who asked for one.
 *
 * This lived inside POST /api/render, which meant the only way to get an MP4
 * was to open the reel page and click Export. The scheduler could generate a
 * reel unattended overnight and still leave no video file, so the one stage
 * that needed no API keys was the one stage that needed a human.
 */

/**
 * How long a job may go without a heartbeat before it counts as abandoned.
 *
 * A live render writes a progress percent every few seconds, but the quiet
 * stretch before the first one is long: bundling the Remotion project takes
 * 20-60s and Chromium start-up follows it. Generous on purpose — the cost of
 * waiting is a reel that renders a few minutes late, and the cost of being
 * hasty is two processes rendering the same reel at once.
 */
const HEARTBEAT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Reels this process is rendering or about to render, mapped to their job id.
 *
 * The same reasoning as the in-flight set in generateReel: the row records the
 * last transition that was written, not whether anything is still working. It
 * also tells the abandoned-job sweep which rows are ours, so our own queued
 * jobs are never mistaken for the leftovers of a dead process.
 */
const claimedReels = new Map<string, string>();

/**
 * Renders run strictly one at a time per process.
 *
 * Remotion drives a headless Chromium over 1080x1920 frames, so two renders on
 * a laptop finish later than the same two in sequence — and the scheduler can
 * easily have a backlog of finished reels waiting. Jobs sit in the "queued"
 * status the schema always had until their turn comes.
 */
let queueTail: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queueTail.then(work);
    // The tail must never reject, or one failure would skip every render behind
    // it. Failures are recorded on the job row instead.
    queueTail = result.catch(() => {});
    return result;
}

export type StartRenderResult =
    /** Claimed and queued. `finished` resolves to the terminal row; it never rejects. */
    | { outcome: "started"; job: RenderJobView; finished: Promise<RenderJobView> }
    /** Someone is already rendering this reel — the existing job, not a second one. */
    | { outcome: "in-flight"; job: RenderJobView }
    | { outcome: "reel-not-found" }
    | { outcome: "nothing-to-render" };

/**
 * Fails render jobs whose process is gone, so the reels they belong to are not
 * blocked for good, and returns the ones it failed.
 *
 * A reel is also moved off "rendering": that status counts as in-flight for the
 * scheduler, so a restart mid-render used to stop the whole series generating
 * again, with nothing in the UI explaining why.
 */
export async function failAbandonedRenders(now: Date = new Date()): Promise<RenderJobView[]> {
    const abandoned = await renderJobRepo.failAbandoned(
        new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS),
        [...claimedReels.values()],
    );
    if (!abandoned.length) return abandoned;

    console.warn(
        `[render] ${abandoned.length} job(s) abandoned by a restart: ` +
            abandoned.map((job) => job.id).join(", "),
    );
    await reelRepo.clearInterruptedRendering(abandoned.map((job) => job.reelId));
    return abandoned;
}

/** Starts that have not finished claiming a job row yet. See startRenderJob. */
const startsInFlight = new Map<string, Promise<StartRenderResult>>();

/**
 * Claims a render for a reel and queues it, or reports why it did not.
 *
 * Both callers want the same answers: the API route turns them into status
 * codes, the scheduler into log lines. Nothing here is awaited to completion —
 * `finished` is there for a caller that wants to wait, such as the worker.
 *
 * Deliberately not an async function: the claim has to happen before the first
 * await, or two callers arriving in the same tick of the event loop — the page
 * clicking Export while the scheduler reaches the same reel — would both get
 * past the checks inside and create two jobs for one reel. Registering the
 * promise is the only claim available that early, so the second caller joins
 * the first rather than racing it.
 */
export function startRenderJob(reelId: string): Promise<StartRenderResult> {
    const pending = startsInFlight.get(reelId);
    if (pending) return pending;

    // By the time this settles the reel is in claimedReels, so later callers
    // get the in-flight answer from there.
    const started = claimAndQueue(reelId).finally(() => startsInFlight.delete(reelId));
    startsInFlight.set(reelId, started);
    return started;
}

async function claimAndQueue(reelId: string): Promise<StartRenderResult> {
    // A job left behind by a restart would read as in-flight below and block
    // this reel from ever rendering again, so it is cleared first.
    await failAbandonedRenders();

    const reel = await reelRepo.getById(reelId);
    if (!reel) return { outcome: "reel-not-found" };
    if (!reel.scenes.length) return { outcome: "nothing-to-render" };

    const claimedJobId = claimedReels.get(reelId);
    if (claimedJobId) {
        const job = await renderJobRepo.getById(claimedJobId);
        if (job) return { outcome: "in-flight", job };
    }

    const existing = await renderJobRepo.latestForReel(reelId);
    if (existing && (existing.status === "queued" || existing.status === "processing")) {
        return { outcome: "in-flight", job: existing };
    }

    const job = await renderJobRepo.create(reelId);
    claimedReels.set(reelId, job.id);

    return { outcome: "started", job, finished: enqueue(() => runJob(reelId, job)) };
}

/**
 * Fails fast when nothing is serving the shot images.
 *
 * The renderer loads every local path over HTTP, so `npm run worker` on its own
 * — without the app running — spends minutes bundling and then dies on an image
 * timeout. At 2am the difference between that and one clear line is the whole
 * difference between a fixable morning and a mystery.
 */
async function requireMediaHost(scenes: { backgroundUrl?: string }[]): Promise<void> {
    const local = scenes.find((scene) => scene.backgroundUrl?.startsWith("/"))?.backgroundUrl;
    if (!local) return; // Nothing on this host to fetch.

    const url = `${assetBaseUrl()}${local}`;
    const reachable = await fetch(url, { signal: AbortSignal.timeout(5000) })
        .then((res) => {
            void res.body?.cancel();
            return res.ok;
        })
        .catch(() => false);

    if (!reachable) {
        throw new Error(
            `Cannot fetch ${url}. The renderer loads every shot over HTTP, so the app has to be ` +
                `running (npm run dev) — or NEXT_PUBLIC_SITE_URL has to point at where it is.`,
        );
    }
}

/** Never rejects: every outcome is written to the job row and returned. */
async function runJob(reelId: string, job: RenderJobView): Promise<RenderJobView> {
    const outputDir = path.join(process.cwd(), "public", "renders", reelId);
    const outputPath = path.join(outputDir, `${job.id}.mp4`);
    const publicPath = `/renders/${reelId}/${job.id}.mp4`;

    try {
        // Read the reel here rather than reusing what the caller checked: a job
        // can wait minutes behind another render, and what gets rendered should
        // be what is saved now.
        const reel = await reelRepo.getById(reelId);
        if (!reel) throw new Error(`Reel ${reelId} no longer exists`);

        await requireMediaHost(reel.scenes);

        await fs.mkdir(outputDir, { recursive: true });
        await renderJobRepo.markProcessing(job.id);
        await reelRepo.setStatus(reelId, "rendering");

        let lastWritten = 0;
        await renderReelToMp4({
            reelId,
            reelData: reel,
            outputPath,
            onProgress: (progress) => {
                // Throttle to whole percents: renderMedia fires this per frame,
                // which would be thousands of writes per render.
                const percent = Math.round(progress * 100);
                if (percent > lastWritten) {
                    lastWritten = percent;
                    void renderJobRepo.setProgress(job.id, percent).catch(() => {});
                }
            },
        });

        await renderJobRepo.markCompleted(job.id, publicPath);
        await reelRepo.setStatus(reelId, "completed");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[render] Job ${job.id} failed:`, message);
        await renderJobRepo.markFailed(job.id, message).catch(() => {});
        await reelRepo.setStatus(reelId, "failed", message).catch(() => {});
    } finally {
        claimedReels.delete(reelId);
    }

    const terminal = await renderJobRepo.getById(job.id).catch(() => null);
    return terminal ?? job;
}
