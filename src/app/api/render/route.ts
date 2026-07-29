import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

import { reelRepo } from "@/lib/db/reelRepo";
import { renderJobRepo } from "@/lib/db/renderJobRepo";
import { renderReelToMp4 } from "@/lib/remotion/renderReel";

// Jobs left mid-flight by a restart cannot resume — nothing is watching them —
// so they are failed once on first use rather than polled forever by a client.
let staleJobsCleared = false;
async function clearStaleJobsOnce() {
    if (staleJobsCleared) return;
    staleJobsCleared = true;
    const count = await renderJobRepo.failStaleJobs();
    if (count > 0) console.log(`[render] Failed ${count} job(s) interrupted by a restart`);
}

/** Starts a render and returns its job id. Progress lives in the database. */
export async function POST(req: Request) {
    try {
        await clearStaleJobsOnce();

        const { reelId } = await req.json();
        if (!reelId) {
            return NextResponse.json({ error: "reelId is required" }, { status: 400 });
        }

        // The reel is read from the database rather than trusted from the
        // request body, so a render always reflects what was actually saved.
        const reel = await reelRepo.getById(reelId);
        if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });

        if (!reel.scenes.length) {
            return NextResponse.json({ error: "Reel has no scenes to render" }, { status: 400 });
        }

        const existing = await renderJobRepo.latestForReel(reelId);
        if (existing && ["queued", "processing"].includes(existing.status)) {
            return NextResponse.json(existing, { status: 202 });
        }

        const job = await renderJobRepo.create(reelId);

        const outputDir = path.join(process.cwd(), "public", "renders", reelId);
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, `${job.id}.mp4`);
        const publicPath = `/renders/${reelId}/${job.id}.mp4`;

        // Not awaited: renders take minutes. Unlike the previous in-memory job
        // map, every transition below is written to the database, so a finished
        // MP4 is still discoverable after a restart.
        void (async () => {
            try {
                await renderJobRepo.markProcessing(job.id);
                await reelRepo.setStatus(reelId, "rendering");

                let lastWritten = 0;
                await renderReelToMp4({
                    reelId,
                    reelData: reel,
                    outputPath,
                    onProgress: (progress) => {
                        // Throttle to whole percents: renderMedia fires this per
                        // frame, which would be thousands of writes per render.
                        const percent = Math.round(progress * 100);
                        if (percent > lastWritten) {
                            lastWritten = percent;
                            void renderJobRepo.setProgress(job.id, percent).catch(() => {});
                        }
                    },
                });

                await renderJobRepo.markCompleted(job.id, publicPath);
                await reelRepo.setStatus(reelId, "completed");
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[render] Job ${job.id} failed:`, message);
                await renderJobRepo.markFailed(job.id, message).catch(() => {});
                await reelRepo.setStatus(reelId, "failed", message).catch(() => {});
            }
        })();

        return NextResponse.json(job, { status: 202 });
    } catch (error) {
        console.error("[api/render] failed to start:", error);
        return NextResponse.json({ error: "Failed to start render" }, { status: 500 });
    }
}

/** Poll a job by id, or the latest job for a reel. */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const reelId = searchParams.get("reelId");

    try {
        const job = jobId
            ? await renderJobRepo.getById(jobId)
            : reelId
              ? await renderJobRepo.latestForReel(reelId)
              : null;

        if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
        return NextResponse.json(job);
    } catch (error) {
        console.error("[api/render] status lookup failed:", error);
        return NextResponse.json({ error: "Failed to read job" }, { status: 500 });
    }
}
