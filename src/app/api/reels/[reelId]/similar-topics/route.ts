import { NextResponse } from "next/server";

import { discoverSimilar, DEFAULT_SIMILAR_COUNT } from "@/lib/pipeline/similarTopics";

type Params = { params: Promise<{ reelId: string }> };

/**
 * Finds topics like this reel and adds them to its series' queue.
 *
 * Awaited, like planning: three model calls and a YouTube search, so tens of
 * seconds, and the user is waiting to see the ideas.
 */
export async function POST(req: Request, { params }: Params) {
    const { reelId } = await params;

    try {
        const body = await req.json().catch(() => ({}));
        const count = Math.min(20, Math.max(1, Number(body.count) || DEFAULT_SIMILAR_COUNT));
        const result = await discoverSimilar(reelId, { count });

        return NextResponse.json({
            reel: result.reel,
            dna: result.dna,
            inserted: result.inserted,
            duplicates: result.duplicates,
            provider: result.provider,
            signals: {
                nicheVideos: result.signals.topVideos.length,
                notes: result.signals.notes,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[api/reels/:id/similar-topics] failed:", message);
        const status = message === "Reel not found" ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
