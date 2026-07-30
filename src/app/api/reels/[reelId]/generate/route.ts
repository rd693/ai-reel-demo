import { NextResponse } from "next/server";
import { reelRepo } from "@/lib/db/reelRepo";
import { generateReel, isGenerating } from "@/lib/pipeline/generateReel";

type Params = { params: Promise<{ reelId: string }> };

/**
 * Resumes a failed or half-finished reel.
 *
 * The pipeline skips whatever is already saved, so retrying after a failure at
 * image 7 of 10 does not re-run the LLM or re-bill text-to-speech.
 */
export async function POST(_req: Request, { params }: Params) {
    const { reelId } = await params;

    try {
        const reel = await reelRepo.getById(reelId);
        if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });

        // Asks the pipeline whether a run is actually in flight. generationStatus
        // records the last stage that finished, so a reel left at "scripted" by a
        // crash looks identical to one mid-flight — guarding on it made exactly
        // the reels that needed resuming impossible to resume.
        if (isGenerating(reelId)) {
            return NextResponse.json(
                { error: "Generation is already running for this reel" },
                { status: 409 },
            );
        }

        void generateReel(reelId);

        return NextResponse.json({ ...reel, generationStatus: "pending" }, { status: 202 });
    } catch (error) {
        console.error("[api/reels/:id/generate] failed:", error);
        return NextResponse.json({ error: "Failed to resume generation" }, { status: 500 });
    }
}
