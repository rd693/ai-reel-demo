import { prisma } from "../db/client";
import { topicRepo, type TopicIdea } from "../db/topicRepo";
import { planTopics } from "./planTopics";
import type { TrendSignals } from "../trends";

/**
 * The queue as the rest of the app uses it: refill it, and take from it.
 *
 * Both the dashboard and the scheduler need these two operations, and neither
 * should have to know that refilling means reading reel history, collecting
 * trend signals, calling a model and deduplicating the result.
 */

/** How many topics one planning run asks for. */
export const DEFAULT_PLAN_COUNT = 20;

/** Refill automatically when the queue drops to this. */
export const LOW_WATER_MARK = 3;

/** Reel titles the planner is shown, to keep the prompt a sane size. */
const TITLE_HISTORY = 40;

export type RefillResult = {
    inserted: TopicIdea[];
    duplicates: string[];
    provider: string;
    signals: TrendSignals;
};

export async function refillQueue(
    seriesId: string,
    options: { count?: number; geo?: string } = {},
): Promise<RefillResult> {
    const series = await prisma.series.findUnique({
        where: { id: seriesId },
        include: {
            reels: {
                orderBy: { createdAt: "desc" },
                take: TITLE_HISTORY,
                select: { title: true },
            },
        },
    });
    if (!series) throw new Error(`Series ${seriesId} not found`);

    // Reel titles matter as much as queued ones: a series that has been
    // generating from the bare niche for weeks already has history, and the
    // planner must not propose what it has already published.
    const avoidTitles = [
        ...new Set([...(await topicRepo.knownTitles(seriesId)), ...series.reels.map((r) => r.title)]),
    ].filter(Boolean);

    const plan = await planTopics({
        niche: series.niche,
        language: series.language,
        seriesContext: series.seriesContext,
        targetDuration: series.targetDuration || 60,
        avoidTitles,
        count: options.count ?? DEFAULT_PLAN_COUNT,
        geo: options.geo,
    });

    const { inserted, duplicates } = await topicRepo.insertMany(seriesId, plan.topics);

    console.log(
        `[topics] ${series.name}: planned ${plan.topics.length}, inserted ${inserted.length}` +
            (duplicates.length ? `, ${duplicates.length} duplicate(s) dropped` : ""),
    );

    return { inserted, duplicates, provider: plan.provider, signals: plan.signals };
}

/**
 * The next topic for a series, planning more when the queue has run dry.
 *
 * Returns null only when planning also failed — the caller then falls back to
 * generating from the niche, which is what the scheduler did for every reel
 * before the queue existed. A planning outage should slow the channel down,
 * not stop it.
 */
export async function nextTopicFor(
    seriesId: string,
    options: { autoPlan?: boolean } = {},
): Promise<TopicIdea | null> {
    const existing = await topicRepo.nextPlanned(seriesId);
    if (existing) {
        // Refill in the background while there is still a queue to work
        // through, so a run is never blocked waiting on the planner.
        const remaining = await topicRepo.countPlanned(seriesId);
        if (options.autoPlan !== false && remaining <= LOW_WATER_MARK) {
            console.log(`[topics] queue down to ${remaining}; refilling in the background`);
            void refillQueue(seriesId).catch((error) =>
                console.warn("[topics] background refill failed:", error),
            );
        }
        return existing;
    }

    if (options.autoPlan === false) return null;

    try {
        console.log(`[topics] queue empty for ${seriesId}; planning now`);
        await refillQueue(seriesId);
    } catch (error) {
        console.warn("[topics] planning failed:", error);
        return null;
    }

    return topicRepo.nextPlanned(seriesId);
}
