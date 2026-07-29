import { NextResponse } from "next/server";
import { reelRepo } from "@/lib/db/reelRepo";
import { seriesRepo } from "@/lib/db/seriesRepo";
import { generateReel } from "@/lib/pipeline/generateReel";

type Params = { params: Promise<{ id: string }> };

/**
 * Creates an empty reel and starts generating it.
 *
 * Returns as soon as the row exists rather than waiting for the pipeline: a
 * full reel takes minutes (LLM, TTS, transcription, one image per scene) and
 * would blow past any request timeout. The client polls GET /api/reels/[id]
 * and watches generationStatus.
 */
export async function POST(req: Request, { params }: Params) {
    const { id } = await params;

    try {
        const series = await seriesRepo.getById(id);
        if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));

        const reel = await reelRepo.create({
            seriesId: id,
            businessName: body.title ?? series.name,
            artStyle: body.artStyle ?? series.artStyle,
            visualStyleOverride: body.visualStyleOverride,
            language: series.language,
            usePremiumImageStack: series.usePremiumImageStack ?? false,
            musicSettings: series.musicSettings,
            captionStyle: series.captionStyle,
            generationStatus: "pending",
        });

        // Deliberately not awaited. This process is a long-lived local server,
        // so the task outlives the response; progress is durable in the reel
        // row, so a crash mid-way leaves a resumable record rather than
        // vanishing the way the in-browser pipeline did.
        void generateReel(reel.id!, {
            niche: body.niche,
            subject: body.subject,
            customScript: body.customScript,
            artStyle: body.artStyle,
            visualStyleOverride: body.visualStyleOverride,
        });

        return NextResponse.json(reel, { status: 202 });
    } catch (error) {
        console.error("[api/series/:id/reels/generate] failed:", error);
        return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
    }
}
