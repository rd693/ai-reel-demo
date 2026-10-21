import { prisma } from "./client";
import { topicKey, type PlannedTopic } from "../pipeline/planTopics";

/**
 * The topic queue.
 *
 * Duplicate prevention lives here rather than in the planner's prompt: a model
 * asked not to repeat itself still will, across runs it cannot see. Existing
 * keys are filtered before insert and the unique index on
 * (seriesId, dedupeKey) catches whatever races past.
 */

export type TopicStatus = "planned" | "used" | "skipped";

export type TopicIdea = {
    id: string;
    seriesId: string;
    title: string;
    subject: string;
    angle?: string;
    rationale?: string;
    trendSource: string;
    score: number;
    status: TopicStatus;
    sortOrder: number;
    usedReelId?: string;
    usedAt?: Date;
    createdAt: Date;
};

type Row = {
    id: string;
    seriesId: string;
    title: string;
    subject: string;
    angle: string | null;
    rationale: string | null;
    trendSource: string;
    score: number;
    status: string;
    sortOrder: number;
    usedReelId: string | null;
    usedAt: Date | null;
    createdAt: Date;
};

function toTopic(row: Row): TopicIdea {
    return {
        id: row.id,
        seriesId: row.seriesId,
        title: row.title,
        subject: row.subject,
        angle: row.angle ?? undefined,
        rationale: row.rationale ?? undefined,
        trendSource: row.trendSource,
        score: row.score,
        status: row.status as TopicStatus,
        sortOrder: row.sortOrder,
        usedReelId: row.usedReelId ?? undefined,
        usedAt: row.usedAt ?? undefined,
        createdAt: row.createdAt,
    };
}

/** Queue order: best score first, with the planner's ordering as the tiebreak. */
const QUEUE_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

export type InsertReport = {
    inserted: TopicIdea[];
    /** Titles rejected as duplicates of something already in the queue. */
    duplicates: string[];
};

export const topicRepo = {
    async list(seriesId: string): Promise<TopicIdea[]> {
        const rows = await prisma.topicIdea.findMany({
            where: { seriesId },
            orderBy: QUEUE_ORDER,
        });
        return rows.map(toTopic);
    },

    async countPlanned(seriesId: string): Promise<number> {
        return prisma.topicIdea.count({ where: { seriesId, status: "planned" } });
    },

    /**
     * Every title this series has already queued, used or rejected.
     *
     * Rejected titles are included deliberately: a topic the user skipped
     * should not come back in the next batch.
     */
    async knownTitles(seriesId: string): Promise<string[]> {
        const rows = await prisma.topicIdea.findMany({
            where: { seriesId },
            select: { title: true },
        });
        return rows.map((r) => r.title);
    },

    /**
     * Adds planned topics, newly scored ones first, skipping duplicates.
     *
     * sortOrder is derived from the score so that a later batch containing a
     * stronger topic can still reach the front of the queue, while the planner
     * ordering inside one batch is preserved by the createdAt tiebreak.
     */
    async insertMany(seriesId: string, topics: PlannedTopic[]): Promise<InsertReport> {
        const existing = new Set(
            (await prisma.topicIdea.findMany({ where: { seriesId }, select: { dedupeKey: true } })).map(
                (r) => r.dedupeKey,
            ),
        );

        const inserted: TopicIdea[] = [];
        const duplicates: string[] = [];

        for (const topic of topics) {
            const dedupeKey = topicKey(topic.title);
            if (!dedupeKey || existing.has(dedupeKey)) {
                duplicates.push(topic.title);
                continue;
            }
            existing.add(dedupeKey);

            try {
                const row = await prisma.topicIdea.create({
                    data: {
                        seriesId,
                        title: topic.title,
                        subject: topic.subject,
                        angle: topic.angle || null,
                        rationale: topic.rationale || null,
                        trendSource: topic.trendSource,
                        score: topic.score,
                        dedupeKey,
                        // Highest score first; SQLite sorts ascending, so the
                        // score is stored inverted.
                        sortOrder: 100 - topic.score,
                    },
                });
                inserted.push(toTopic(row));
            } catch (error) {
                // The unique index is the real guard. Losing a race here means
                // the topic already exists, which is the outcome we wanted.
                console.warn(`[topics] could not insert "${topic.title}":`, error);
                duplicates.push(topic.title);
            }
        }

        return { inserted, duplicates };
    },

    /** The next topic to make, or null when the queue is empty. */
    async nextPlanned(seriesId: string): Promise<TopicIdea | null> {
        const row = await prisma.topicIdea.findFirst({
            where: { seriesId, status: "planned" },
            orderBy: QUEUE_ORDER,
        });
        return row ? toTopic(row) : null;
    },

    /**
     * Claims a topic for a reel before generation starts.
     *
     * Claiming up front rather than on success is what stops two scheduler
     * passes from making the same video; `release` puts it back if the reel
     * never got as far as a script.
     */
    async claim(topicId: string, reelId: string): Promise<TopicIdea | null> {
        const row = await prisma.topicIdea.update({
            where: { id: topicId },
            data: { status: "used", usedReelId: reelId, usedAt: new Date() },
        });
        return row ? toTopic(row) : null;
    },

    async release(topicId: string): Promise<void> {
        await prisma.topicIdea
            .update({
                where: { id: topicId },
                data: { status: "planned", usedReelId: null, usedAt: null },
            })
            .catch(() => {});
    },

    async update(
        topicId: string,
        patch: Partial<Pick<TopicIdea, "title" | "subject" | "angle" | "status" | "sortOrder" | "score">>,
    ): Promise<TopicIdea | null> {
        const data: Record<string, unknown> = {};
        if (patch.title !== undefined) {
            data.title = patch.title;
            // The key has to follow the title or an edited topic could be
            // proposed again under its new wording.
            data.dedupeKey = topicKey(patch.title);
        }
        if (patch.subject !== undefined) data.subject = patch.subject;
        if (patch.angle !== undefined) data.angle = patch.angle || null;
        if (patch.status !== undefined) data.status = patch.status;
        if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
        if (patch.score !== undefined) data.score = patch.score;

        const row = await prisma.topicIdea.update({ where: { id: topicId }, data }).catch(() => null);
        return row ? toTopic(row) : null;
    },

    async remove(topicId: string): Promise<boolean> {
        const deleted = await prisma.topicIdea.delete({ where: { id: topicId } }).catch(() => null);
        return !!deleted;
    },
};
