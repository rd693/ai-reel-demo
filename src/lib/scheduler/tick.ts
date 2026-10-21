import { prisma } from "../db/client";
import { reelRepo } from "../db/reelRepo";
import { generateReel } from "../pipeline/generateReel";
import { nextTopicFor } from "../pipeline/topicQueue";
import { topicRepo } from "../db/topicRepo";
import { isDue, IN_FLIGHT_STATUSES, type DueVerdict } from "./schedule";

export type SeriesOutcome = {
    seriesId: string;
    name: string;
    action: "generated" | "resumed" | "skipped";
    reelId?: string;
    reason: string;
    /** The planned topic this reel was made from, when there was one. */
    topic?: string;
};

export type TickResult = {
    checkedAt: Date;
    outcomes: SeriesOutcome[];
    started: number;
};

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
 */
export async function runSchedulerTick(now: Date = new Date()): Promise<TickResult> {
    const allSeries = await prisma.series.findMany({
        include: {
            reels: {
                orderBy: { createdAt: "desc" },
                select: { id: true, createdAt: true, generationStatus: true },
            },
        },
    });

    const outcomes: SeriesOutcome[] = [];
    let started = 0;

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
                    select: { script: true },
                });
                if (!after?.script?.trim()) {
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

    return { checkedAt: now, outcomes, started };
}
