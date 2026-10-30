import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { reelRepo } from "@/lib/db/reelRepo";
import { writePublishCopy } from "@/lib/pipeline/publishCopy";

type Params = { params: Promise<{ reelId: string }> };

/**
 * Writes the reel's upload copy, replacing any it already has.
 *
 * The pipeline writes copy once the script exists; this is for reels made
 * before that, and for a second draft. Awaited rather than backgrounded: it is
 * one model call, and the page is waiting to show the result.
 */
export async function POST(_req: Request, { params }: Params) {
    const { reelId } = await params;

    try {
        const row = await prisma.reel.findUnique({
            where: { id: reelId },
            include: { series: true },
        });
        if (!row) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
        if (!row.script.trim()) {
            return NextResponse.json({ error: "This reel has no script yet" }, { status: 409 });
        }

        // The planned angle is what the title was written to promise.
        const topic = await prisma.topicIdea.findFirst({
            where: { usedReelId: reelId },
            select: { angle: true },
        });

        const copy = await writePublishCopy({
            title: row.title,
            script: row.script,
            niche: row.series.niche,
            language: row.language ?? row.series.language,
            artStyle: row.artStyle ?? row.series.artStyle,
            seriesContext: row.series.seriesContext,
            angle: topic?.angle,
        });

        await reelRepo.update(reelId, { publishCopy: copy });
        return NextResponse.json(copy);
    } catch (error) {
        console.error("[api/reels/:id/publish-copy] failed:", error);
        const message = error instanceof Error ? error.message : "Failed to write upload copy";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
