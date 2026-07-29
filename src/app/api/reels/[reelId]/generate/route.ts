import { NextResponse } from "next/server";
import { reelRepo } from "@/lib/db/reelRepo";
import { generateReel } from "@/lib/pipeline/generateReel";

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

        if (["scripted", "voicing", "visualizing"].includes(reel.generationStatus)) {
            return NextResponse.json(
                { error: "Generation already in progress" },
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
