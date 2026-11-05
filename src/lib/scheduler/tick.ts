import { prisma } from "../db/client";
import { reelRepo } from "../db/reelRepo";
import { generateReel, isGenerating } from "../pipeline/generateReel";
import { nextTopicFor, topicOptionsForReel } from "../pipeline/topicQueue";
import { isOnline } from "../net/online";
import { topicRepo } from "../db/topicRepo";
import { failAbandonedRenders, mediaHostReachable, startRenderJob } from "../remotion/runRenderJob";
import {
    isDue,
    isPausedError,
    IN_FLIGHT_STATUSES,
    PAUSED_ERROR_FILTER,
    PAUSED_INTERRUPTED,
    type DueVerdict,
} from "./schedule";

export type SeriesOutcome = {
    seriesId: string;
    name: string;
    action: "generated" | "resumed" | "skipped";
    reelId?: string;
    reason: string;
    /** The planned topic this reel was made from, when there was one. */
    topic?: string;
};

export type RenderOutcome = {
    reelId: string;
    title: string;
    action: "rendered" | "failed" | "skipped";
    reason: string;
    outputPath?: string;
};

export type TickResult = {
    checkedAt: Date;
    outcomes: SeriesOutcome[];
    started: number;
    renders: RenderOutcome[];
};

/**
 * Stages that mean generateReel is still working on a reel.
 *
 * "rendering" is deliberately excluded: it is set by the render itself, so a
 * reel left on it by an interrupted export is exactly what should be picked up
 * again rather than skipped.
 */
const MID_GENERATION = IN_FLIGHT_STATUSES.filter((status) => status !== "rendering");

/** A run writes after every stage and every image; this long without one means it died. */
const GENERATION_STALL_MS = 30 * 60 * 1000;

/**
 * Restarts reels that stopped for a reason that has since passed.
 *
 * Claimed with a conditional update, because the app and the worker are separate
 * processes: if somebody clicks Resume at the same moment, only one of them gets
 * the row and the providers are billed once.
 */
async function resumePausedReels(): Promise<SeriesOutcome[]> {
    const paused = await prisma.reel.findMany({
        where: {
            generationStatus: "failed",
            generationError: PAUSED_ERROR_FILTER,
            series: { status: "active" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, seriesId: true, series: { select: { name: true } } },
    });

    const outcomes: SeriesOutcome[] = [];
    for (const reel of paused) {
        const { count } = await prisma.reel.updateMany({
            where: { id: reel.id, generationStatus: "failed", generationError: PAUSED_ERROR_FILTER },
            data: { generationStatus: "pending", generationError: null },
        });
        if (!count) continue;

        console.log(`[scheduler] resuming "${reel.title}"`);
        await generateReel(reel.id, await topicOptionsForReel(reel.id));
        outcomes.push({
            seriesId: reel.seriesId,
            name: reel.series.name,
            action: "resumed",
            reelId: reel.id,
            reason: "picked up where it stopped",
        });
    }
    return outcomes;
}

/**
 * Reels that have everything a render needs and no video to show for it.
 *
 * Read off the artifacts rather than generationStatus, the same way
 * generateReel decides what is left to do. A shot with no image is what
 * disqualifies a reel — generateReel leaves a filtered shot unset on purpose so
 * a retry regenerates only that one, and rendering now would bake the gap into
 * the MP4 and record the reel as finished.
 */
export async function reelsAwaitingRender() {
    return prisma.reel.findMany({
        where: {
            AND: [
                { scenes: { some: {} } },
                { scenes: { none: { backgroundPath: null } } },
                { renderJobs: { none: { status: "completed" } } },
                { generationStatus: { notIn: MID_GENERATION } },
            ],
        },
        // Oldest first, so a backlog drains in the order it built up.
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true },
    });
}

/**
 * One pass of the scheduler.
 *
 * This is what makes the project a factory rather than a manual generator:
 * Series.frequency and the scheduling fields existed in the type from the
 * beginning but were read by nothing.
 *
 * Generation is awaited rather than fired and forgotten. A tick therefore
 * takes as long as the reels it starts, which is what keeps a slow provider
 * from letting ticks pile up on top of each other.
 *
 * Rendering follows generation here because an MP4 that only appears when
 * somebody opens the reel page and clicks Export is not a factory: an
 * unattended overnight run used to leave finished scenes and no video file.
 */
export async function runSchedulerTick(now: Date = new Date()): Promise<TickResult> {
    // Before anything reads generationStatus: a reel stuck on "rendering" by a
    // dead process counts as in-flight, and would hold up its whole series.
    await failAbandonedRenders(now);

    const running = await prisma.reel.findMany({
        where: { generationStatus: { in: MID_GENERATION } },
        select: { id: true },
    });
    await reelRepo.pauseStalled(
        MID_GENERATION,
        new Date(now.getTime() - GENERATION_STALL_MS),
        running.filter((reel) => isGenerating(reel.id)).map((reel) => reel.id),
        PAUSED_INTERRUPTED,
    );

    const online = await isOnline();
    const outcomes: SeriesOutcome[] = online ? await resumePausedReels() : [];

    const allSeries = await prisma.series.findMany({
        include: {
            reels: {
                orderBy: { createdAt: "desc" },
                select: { id: true, createdAt: true, generationStatus: true },
            },
        },
    });

    let started = outcomes.length;

    for (const series of allSeries) {
        const inFlight = series.reels.find((r) => IN_FLIGHT_STATUSES.includes(r.generationStatus));

        const verdict: DueVerdict = isDue(
            {
                frequency: series.frequency,
                status: series.status,
                lastGeneratedAt: series.reels[0]?.createdAt,
                hasInFlightReel: !!inFlight,
            },
            now,
        );

        if (!verdict.due) {
            outcomes.push({
                seriesId: series.id,
                name: series.name,
                action: "skipped",
                reason: verdict.reason,
            });
            continue;
        }

        // Starting now would claim a topic and leave behind a reel that can only
        // fail. Still due at the next tick, so nothing is lost by waiting.
        if (!online) {
            outcomes.push({
                seriesId: series.id,
                name: series.name,
                action: "skipped",
                reason: "no internet; will generate when the connection returns",
            });
            continue;
        }

        try {
            // What to make. Without a queue every scheduled reel was generated
            // from series.niche — the same line every run — so the writer
            // re-picked a subject with no memory and converged on the obvious
            // ones. A planning outage falls back to that old behaviour rather
            // than skipping the slot.
            const topic = await nextTopicFor(series.id);
            if (!topic) {
                console.warn(
                    `[scheduler] ${series.name}: no planned topic available; falling back to the niche`,
                );
            }

            const reel = await reelRepo.create({
                seriesId: series.id,
                businessName: topic?.title ?? series.name,
                artStyle: series.artStyle as never, // free-text column, narrowed union in the domain type
                language: series.language,
                usePremiumImageStack: series.usePremiumImageStack,
                generationStatus: "pending",
            });

            // Claimed before generating, not after: two passes must never be
            // able to make the same video. Released below if the reel never
            // reached a script, so a provider outage does not consume a topic.
            if (topic) await topicRepo.claim(topic.id, reel.id!);

            console.log(
                `[scheduler] ${series.name}: generating (${verdict.reason})` +
                    (topic ? ` — "${topic.title}"` : ""),
            );
            await generateReel(reel.id!, {
                niche: series.niche,
                subject: topic?.subject ?? series.niche,
                topicTitle: topic?.title,
                topicAngle: topic?.angle,
            });
            started++;

            if (topic) {
                const after = await prisma.reel.findUnique({
                    where: { id: reel.id! },
                    select: { script: true, generationError: true },
                });
                // A paused reel keeps its topic: it will write that script later.
                if (!after?.script?.trim() && !isPausedError(after?.generationError)) {
                    console.warn(`[scheduler] ${series.name}: no script produced; returning topic to the queue`);
                    await topicRepo.release(topic.id);
                }
            }

            outcomes.push({
                seriesId: series.id,
                name: series.name,
                action: "generated",
                reelId: reel.id,
                reason: verdict.reason,
                topic: topic?.title,
            });
        } catch (error) {
            // generateReel records its own failures on the reel row; this only
            // catches problems creating the row, which must not stop the loop.
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[scheduler] ${series.name}: could not start —`, message);
            outcomes.push({
                seriesId: series.id,
                name: series.name,
                action: "skipped",
                reason: `failed to start: ${message}`,
            });
        }
    }

    // Rendering costs no API credits, so it runs for every ready reel rather
    // than only for the series that were due — a paused or manual series still
    // deserves the MP4 for a reel it has already paid to generate. Renders are
    // serialised inside runRenderJob, so this loop never stacks two Chromiums.
    const renders: RenderOutcome[] = [];
    const awaitingRender = await reelsAwaitingRender();

    // With the app stopped, every one of these would fail its first fetch. That
    // used to write a failed job and a failed reel for each, every five minutes,
    // for reels with nothing wrong with them. They wait for the app instead.
    if (awaitingRender.length && !(await mediaHostReachable())) {
        return {
            checkedAt: now,
            outcomes,
            started,
            renders: awaitingRender.map((reel) => ({
                reelId: reel.id,
                title: reel.title,
                action: "skipped" as const,
                reason: "the app is not running (npm run dev); will render when it is",
            })),
        };
    }

    for (const reel of awaitingRender) {
        try {
            const result = await startRenderJob(reel.id);

            if (result.outcome !== "started") {
                renders.push({
                    reelId: reel.id,
                    title: reel.title,
                    action: "skipped",
                    reason:
                        result.outcome === "in-flight"
                            ? `a render is already in flight (job ${result.job.id})`
                            : result.outcome,
                });
                continue;
            }

            console.log(`[scheduler] rendering "${reel.title}" (job ${result.job.id})`);

            // Awaited for the same reason generation is, plus one of its own:
            // the worker's shutdown handler waits on the tick, so Ctrl-C
            // finishes the render instead of leaving a half-written MP4.
            const job = await result.finished;
            renders.push({
                reelId: reel.id,
                title: reel.title,
                action: job.status === "completed" ? "rendered" : "failed",
                reason:
                    job.status === "completed"
                        ? (job.outputPath ?? "rendered")
                        : (job.error ?? "render failed"),
                outputPath: job.outputPath,
            });
        } catch (error) {
            // Failures inside the render are recorded on the job row; this only
            // catches trouble starting one, which must not stop the loop.
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[scheduler] could not render "${reel.title}" —`, message);
            renders.push({
                reelId: reel.id,
                title: reel.title,
                action: "failed",
                reason: `failed to start: ${message}`,
            });
        }
    }

    return { checkedAt: now, outcomes, started, renders };
}
