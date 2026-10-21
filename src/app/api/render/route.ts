import { NextResponse } from "next/server";

import { renderJobRepo } from "@/lib/db/renderJobRepo";
import { startRenderJob } from "@/lib/remotion/runRenderJob";

/**
 * Starts a render and returns its job id. Progress lives in the database.
 *
 * The work itself moved to runRenderJob, because the scheduler needs to start
 * renders too and this route was the only way in. What is left here is the
 * translation from one outcome to one status code.
 */
export async function POST(req: Request) {
    try {
        const { reelId } = await req.json();
        if (!reelId) {
            return NextResponse.json({ error: "reelId is required" }, { status: 400 });
        }

        // The reel is read from the database rather than trusted from the
        // request body, so a render always reflects what was actually saved.
        const result = await startRenderJob(reelId);

        switch (result.outcome) {
            case "reel-not-found":
                return NextResponse.json({ error: "Reel not found" }, { status: 404 });
            case "nothing-to-render":
                return NextResponse.json(
                    { error: "Reel has no scenes to render" },
                    { status: 400 },
                );
            default:
                // Renders take minutes, so the job row is the answer and the
                // page polls GET below for the rest. `result.finished` is
                // deliberately not awaited here.
                return NextResponse.json(result.job, { status: 202 });
        }
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

        // A reel that has never been exported has no job, and that is a normal
        // answer rather than a missing resource — the reel page polls this on
        // every load to catch a render already in flight. Returning 404 made
        // the ordinary case look like a failure in the network tab.
        if (!job) return NextResponse.json(null);
        return NextResponse.json(job);
    } catch (error) {
        console.error("[api/render] status lookup failed:", error);
        return NextResponse.json({ error: "Failed to read job" }, { status: 500 });
    }
}
