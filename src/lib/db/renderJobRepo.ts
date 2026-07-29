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
        await prisma.renderJob.update({
            where: { id },
            data: { status: "processing", startedAt: new Date(), progress: 0 },
        });
    },

    async setProgress(id: string, progress: number) {
        await prisma.renderJob.update({
            where: { id },
            data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
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
     * A job left "processing" cannot still be running after a restart — nothing
     * resumes it — so it is failed on boot rather than polled forever.
     */
    async failStaleJobs(): Promise<number> {
        const { count } = await prisma.renderJob.updateMany({
            where: { status: { in: ["queued", "processing"] } },
            data: {
                status: "failed",
                error: "Interrupted by a server restart",
                finishedAt: new Date(),
            },
        });
        return count;
    },
};
