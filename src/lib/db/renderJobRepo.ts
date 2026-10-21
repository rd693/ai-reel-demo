import { prisma } from "./client";
import { toRenderJob, type RenderJobView } from "./mappers";

// Render jobs used to live in a module-level object in the render route, so a
// server restart orphaned every in-flight render and the finished MP4 was never
// recorded anywhere. They are rows now.
export const renderJobRepo = {
    async create(reelId: string): Promise<RenderJobView> {
        const row = await prisma.renderJob.create({ data: { reelId } });
        return toRenderJob(row);
    },

    async getById(id: string): Promise<RenderJobView | null> {
        const row = await prisma.renderJob.findUnique({ where: { id } });
        return row ? toRenderJob(row) : null;
    },

    /** What the reel page polls: the job the user just started. */
    async latestForReel(reelId: string): Promise<RenderJobView | null> {
        const row = await prisma.renderJob.findFirst({
            where: { reelId },
            orderBy: { createdAt: "desc" },
        });
        return row ? toRenderJob(row) : null;
    },

    /** Completed renders for a reel, newest first — the download list. */
    async completedForReel(reelId: string): Promise<RenderJobView[]> {
        const rows = await prisma.renderJob.findMany({
            where: { reelId, status: "completed" },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(toRenderJob);
    },

    async markProcessing(id: string) {
        const now = new Date();
        await prisma.renderJob.update({
            where: { id },
            data: { status: "processing", startedAt: now, heartbeatAt: now, progress: 0 },
        });
    },

    /** Doubles as the heartbeat — see RenderJob.heartbeatAt in the schema. */
    async setProgress(id: string, progress: number) {
        await prisma.renderJob.update({
            where: { id },
            data: {
                progress: Math.max(0, Math.min(100, Math.round(progress))),
                heartbeatAt: new Date(),
            },
        });
    },

    async markCompleted(id: string, outputPath: string) {
        await prisma.renderJob.update({
            where: { id },
            data: { status: "completed", progress: 100, outputPath, finishedAt: new Date() },
        });
    },

    async markFailed(id: string, error: string) {
        await prisma.renderJob.update({
            where: { id },
            data: { status: "failed", error, finishedAt: new Date() },
        });
    },

    /**
     * Fails jobs nothing is working on any more, and says which.
     *
     * This used to fail every queued or processing job on first use, on the
     * grounds that nothing resumes a render. That was true of one process, but
     * the app and `npm run worker` both render now, so a blanket sweep would
     * declare the other process's live render dead and the scheduler would
     * start a second render of the same reel. A row is only abandoned if it has
     * gone quiet past `before` and is not one the sweeping process owns.
     */
    async failAbandoned(before: Date, spareIds: string[] = []): Promise<RenderJobView[]> {
        const abandoned = await prisma.renderJob.findMany({
            where: {
                status: { in: ["queued", "processing"] },
                id: { notIn: spareIds },
                // A job that never got off the queue has no heartbeat yet, so
                // its age is all there is to go on.
                OR: [
                    { heartbeatAt: { lt: before } },
                    { heartbeatAt: null, createdAt: { lt: before } },
                ],
            },
        });
        if (!abandoned.length) return [];

        await prisma.renderJob.updateMany({
            where: { id: { in: abandoned.map((job) => job.id) } },
            data: {
                status: "failed",
                error: "Interrupted by a restart",
                finishedAt: new Date(),
            },
        });
        return abandoned.map(toRenderJob);
    },
};
