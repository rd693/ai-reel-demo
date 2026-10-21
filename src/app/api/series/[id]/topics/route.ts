import { NextResponse } from "next/server";

import { seriesRepo } from "@/lib/db/seriesRepo";
import { topicRepo } from "@/lib/db/topicRepo";
import { refillQueue, DEFAULT_PLAN_COUNT } from "@/lib/pipeline/topicQueue";

type Params = { params: Promise<{ id: string }> };

/** The whole queue for a series: planned, used and skipped, in queue order. */
export async function GET(_req: Request, { params }: Params) {
    const { id } = await params;

    try {
        const topics = await topicRepo.list(id);
        return NextResponse.json({
            topics,
            counts: {
                planned: topics.filter((t) => t.status === "planned").length,
                used: topics.filter((t) => t.status === "used").length,
                skipped: topics.filter((t) => t.status === "skipped").length,
            },
        });
    } catch (error) {
        console.error("[api/series/:id/topics] list failed:", error);
        return NextResponse.json({ error: "Failed to read topics" }, { status: 500 });
    }
}

/**
 * Plans a batch of topics and adds them to the queue.
 *
 * Awaited rather than backgrounded, unlike reel generation: the user is
 * looking at the queue and the answer *is* the result. It is one model call
 * plus two HTTP fetches, so it takes tens of seconds rather than the minutes a
 * reel takes.
 */
export async function POST(req: Request, { params }: Params) {
    const { id } = await params;

    try {
        const series = await seriesRepo.getById(id);
        if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const count = Math.min(40, Math.max(1, Number(body.count) || DEFAULT_PLAN_COUNT));

        const result = await refillQueue(id, { count, geo: body.geo });

        return NextResponse.json({
            inserted: result.inserted,
            duplicates: result.duplicates,
            provider: result.provider,
            // What the plan was actually based on, so the UI can be honest
            // about whether this batch saw live data or not.
            signals: {
                geo: result.signals.geo,
                fetchedAt: result.signals.fetchedAt,
                risingQueries: result.signals.risingQueries.length,
                nicheVideos: result.signals.topVideos.length,
                notes: result.signals.notes,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[api/series/:id/topics] planning failed:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
