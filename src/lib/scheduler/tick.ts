import { prisma } from "../db/client";
import { reelRepo } from "../db/reelRepo";
import { generateReel } from "../pipeline/generateReel";
import { isDue, IN_FLIGHT_STATUSES, type DueVerdict } from "./schedule";

export type SeriesOutcome = {
    seriesId: string;
    name: string;
    action: "generated" | "resumed" | "skipped";
    reelId?: string;
    reason: string;
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
            const reel = await reelRepo.create({
                seriesId: series.id,
                businessName: series.name,
                artStyle: series.artStyle as never, // free-text column, narrowed union in the domain type
                language: series.language,
                usePremiumImageStack: series.usePremiumImageStack,
                generationStatus: "pending",
            });

            console.log(`[scheduler] ${series.name}: generating (${verdict.reason})`);
            await generateReel(reel.id!, { niche: series.niche, subject: series.niche });
            started++;

            outcomes.push({
                seriesId: series.id,
                name: series.name,
                action: "generated",
                reelId: reel.id,
                reason: verdict.reason,
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
