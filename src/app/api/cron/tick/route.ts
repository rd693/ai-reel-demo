import { NextResponse } from "next/server";
import { runSchedulerTick } from "@/lib/scheduler/tick";

// Runs one scheduler pass. Two callers: `npm run worker`, and any external
// scheduler (cron, launchd) that can issue an HTTP request.
//
// Only one tick runs at a time in this process. A tick awaits the reels it
// starts, so overlapping calls would double-generate for the same series.
let inFlight: Promise<unknown> | null = null;

export async function POST() {
    if (inFlight) {
        return NextResponse.json(
            { error: "A scheduler tick is already running" },
            { status: 409 },
        );
    }

    try {
        const run = runSchedulerTick();
        inFlight = run;
        const result = await run;

        return NextResponse.json(result);
    } catch (error) {
        console.error("[api/cron/tick] failed:", error);
        return NextResponse.json({ error: "Scheduler tick failed" }, { status: 500 });
    } finally {
        inFlight = null;
    }
}

/** Dry run: what the scheduler would do right now, without doing it. */
export async function GET() {
    const { prisma } = await import("@/lib/db/client");
    const { isDue, IN_FLIGHT_STATUSES } = await import("@/lib/scheduler/schedule");

    const allSeries = await prisma.series.findMany({
        include: {
            reels: {
                orderBy: { createdAt: "desc" },
                select: { createdAt: true, generationStatus: true },
            },
        },
    });

    return NextResponse.json({
        running: !!inFlight,
        series: allSeries.map((s) => ({
            id: s.id,
            name: s.name,
            frequency: s.frequency,
            status: s.status,
            lastGeneratedAt: s.reels[0]?.createdAt ?? null,
            ...isDue({
                frequency: s.frequency,
                status: s.status,
                lastGeneratedAt: s.reels[0]?.createdAt,
                hasInFlightReel: s.reels.some((r) => IN_FLIGHT_STATUSES.includes(r.generationStatus)),
            }),
        })),
    });
}
