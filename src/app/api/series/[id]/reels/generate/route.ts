import { NextResponse } from "next/server";
import { reelRepo } from "@/lib/db/reelRepo";
import { seriesRepo } from "@/lib/db/seriesRepo";
import { generateReel } from "@/lib/pipeline/generateReel";
import { nextTopicFor } from "@/lib/pipeline/topicQueue";
import { topicRepo } from "@/lib/db/topicRepo";
import { prisma } from "@/lib/db/client";

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

        // "Generate now" takes the top of the topic queue, unless the caller
        // named its own subject or supplied a script. autoPlan is off here: a
        // click should not silently trigger a planning run and its model bill —
        // the dashboard has an explicit button for that.
        const topic =
            body.subject || body.customScript ? null : await nextTopicFor(id, { autoPlan: false });

        const reel = await reelRepo.create({
            seriesId: id,
            businessName: body.title ?? topic?.title ?? series.name,
            artStyle: body.artStyle ?? series.artStyle,
            visualStyleOverride: body.visualStyleOverride,
            language: series.language,
            usePremiumImageStack: series.usePremiumImageStack ?? false,
            musicSettings: series.musicSettings,
            captionStyle: series.captionStyle,
            generationStatus: "pending",
        });

        if (topic) await topicRepo.claim(topic.id, reel.id!);

        // Deliberately not awaited. This process is a long-lived local server,
        // so the task outlives the response; progress is durable in the reel
        // row, so a crash mid-way leaves a resumable record rather than
        // vanishing the way the in-browser pipeline did.
        void generateReel(reel.id!, {
            niche: body.niche,
            subject: body.subject ?? topic?.subject,
            customScript: body.customScript,
            artStyle: body.artStyle,
            visualStyleOverride: body.visualStyleOverride,
            topicTitle: topic?.title,
            topicAngle: topic?.angle,
        }).then(async () => {
            // A topic is claimed before generating so two clicks cannot make
            // the same video. If the run never produced a script, it was not
            // really spent — put it back at the front of the queue.
            if (!topic) return;
            const after = await prisma.reel.findUnique({
                where: { id: reel.id! },
                select: { script: true },
            });
            if (!after?.script?.trim()) await topicRepo.release(topic.id);
        }).catch((error) => {
            // generateReel records stage failures on the row and only throws
            // if the reel itself cannot be loaded. Nothing is waiting on this
            // promise, so it has to swallow that rather than become an
            // unhandled rejection.
            console.error("[api/series/:id/reels/generate] background run failed:", error);
        });

        return NextResponse.json({ ...reel, topic: topic?.title }, { status: 202 });
    } catch (error) {
        console.error("[api/series/:id/reels/generate] failed:", error);
        return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
    }
}
