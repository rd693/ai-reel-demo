import { prisma } from "./client";
import { toReel, type PersistedScene } from "./mappers";
import type { FacelessReel } from "../../types/series";

export type ReelInput = Partial<Omit<FacelessReel, "scenes">> & {
    seriesId: string;
    scenes?: PersistedScene[];
};

const WITH_SCENES = { scenes: { orderBy: { index: "asc" } } } as const;

/** Scenes are positional; index comes from array order, not from the payload. */
function sceneRows(scenes: PersistedScene[]) {
    return scenes.map((scene, index) => ({
        index,
        type: scene.type ?? "hook",
        headline: scene.headline ?? "",
        narrationText: scene.narrationText ?? null,
        visualPrompt: scene.visualPrompt ?? null,
        backgroundPath: scene.backgroundUrl ?? null,
        backgroundType: scene.backgroundType ?? "image",
        shotType: scene.shotType ?? null,
        motionPrompt: scene.motionPrompt ?? null,
        cardSpec: scene.cardSpec ? JSON.stringify(scene.cardSpec) : null,
        durationInSeconds: scene.durationInSeconds ?? 3,
        startMs: scene.startMs ?? null,
        endMs: scene.endMs ?? null,
    }));
}

function reelRows(input: Partial<ReelInput>) {
    const data: Record<string, unknown> = {};
    if (input.businessName !== undefined) data.title = input.businessName;
    if (input.script !== undefined) data.script = input.script;
    if (input.brandColor !== undefined) data.brandColor = input.brandColor;
    if (input.accentColor !== undefined) data.accentColor = input.accentColor;
    if (input.language !== undefined) data.language = input.language;
    if (input.artStyle !== undefined) data.artStyle = input.artStyle;
    if (input.visualStyleOverride !== undefined) data.visualStyleOverride = input.visualStyleOverride;
    if (input.format !== undefined) data.format = input.format;
    if (input.deckId !== undefined) data.deckId = input.deckId;
    if (input.usePremiumImageStack !== undefined) data.usePremiumImageStack = input.usePremiumImageStack;
    if (input.seed !== undefined) data.seed = input.seed;
    if (input.voiceoverUrl !== undefined) data.voiceoverPath = input.voiceoverUrl;
    if (input.actualDuration !== undefined) data.actualDurationMs = Math.round(input.actualDuration);
    if (input.captionWords !== undefined) data.captionWords = JSON.stringify(input.captionWords ?? []);
    if (input.generationStatus !== undefined) data.generationStatus = input.generationStatus;
    if (input.musicSettings !== undefined) data.musicSettings = JSON.stringify(input.musicSettings);
    if (input.captionStyle !== undefined) data.captionStyle = JSON.stringify(input.captionStyle);
    if (input.scheduledFor !== undefined) data.scheduledFor = input.scheduledFor;
    if (input.publishedAt !== undefined) data.publishedAt = input.publishedAt;
    return data;
}

export const reelRepo = {
    async listBySeries(seriesId: string): Promise<FacelessReel[]> {
        const rows = await prisma.reel.findMany({
            where: { seriesId },
            orderBy: { createdAt: "desc" },
            include: WITH_SCENES,
        });
        return rows.map(toReel);
    },

    async getById(id: string): Promise<FacelessReel | null> {
        const row = await prisma.reel.findUnique({ where: { id }, include: WITH_SCENES });
        return row ? toReel(row) : null;
    },

    async create(input: ReelInput): Promise<FacelessReel> {
        const row = await prisma.reel.create({
            data: {
                ...reelRows(input),
                ...(input.id ? { id: input.id } : {}),
                seriesId: input.seriesId,
                title: input.businessName ?? "Untitled Reel",
                generationStatus: input.generationStatus ?? "pending",
                scenes: { create: sceneRows(input.scenes ?? []) },
            },
            include: WITH_SCENES,
        });
        return toReel(row);
    },

    /**
     * Scenes are replaced wholesale when supplied. They are regenerated as a
     * set by the pipeline, and the [reelId, index] unique constraint makes
     * partial in-place updates more trouble than they are worth.
     */
    async update(id: string, patch: Partial<ReelInput>): Promise<FacelessReel | null> {
        const existing = await prisma.reel.findUnique({ where: { id } });
        if (!existing) return null;

        const row = await prisma.$transaction(async (tx) => {
            if (patch.scenes !== undefined) {
                await tx.scene.deleteMany({ where: { reelId: id } });
                await tx.scene.createMany({
                    data: sceneRows(patch.scenes).map((scene) => ({ ...scene, reelId: id })),
                });
            }
            return tx.reel.update({
                where: { id },
                data: reelRows(patch),
                include: WITH_SCENES,
            });
        });

        return toReel(row);
    },

    async setStatus(id: string, generationStatus: string, generationError?: string) {
        await prisma.reel.update({
            where: { id },
            data: { generationStatus, generationError: generationError ?? null },
        });
    },

    /**
     * Moves reels off "rendering" after the render that set it was abandoned.
     *
     * "rendering" counts as in-flight for the scheduler, so a reel stuck there
     * stops its whole series from generating again. Only reels still on that
     * status are touched — anything else has moved on since.
     */
    async clearInterruptedRendering(ids: string[]): Promise<number> {
        if (!ids.length) return 0;
        const { count } = await prisma.reel.updateMany({
            where: { id: { in: ids }, generationStatus: "rendering" },
            data: {
                generationStatus: "failed",
                generationError: "Rendering was interrupted by a restart. Export again.",
            },
        });
        return count;
    },

    async delete(id: string): Promise<boolean> {
        const existing = await prisma.reel.findUnique({ where: { id } });
        if (!existing) return false;
        await prisma.reel.delete({ where: { id } });
        return true;
    },
};
