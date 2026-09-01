import { prisma } from "./client";
import { toSeries, DEFAULT_CAPTION_STYLE, DEFAULT_MUSIC_SETTINGS } from "./mappers";
import type { Series } from "../../types/series";

// Series are returned newest-first everywhere in the UI, so ordering lives here
// rather than being re-sorted by each caller.
const NEWEST_FIRST = { createdAt: "desc" } as const;

export type SeriesInput = Omit<Series, "id" | "createdAt" | "reels" | "status"> &
    Partial<Pick<Series, "id" | "status">>;

function toRow(input: SeriesInput) {
    return {
        name: input.name,
        niche: input.niche,
        artStyle: input.artStyle,
        voiceId: input.voiceId,
        language: input.language,
        targetDuration: input.targetDuration,
        frequency: input.frequency,
        usePremiumImageStack: input.usePremiumImageStack ?? false,
        format: input.format ?? "slideshow",
        seriesContext: input.seriesContext ?? null,
        visualStylePrompt: input.visualStylePrompt ?? null,
        targetPlatforms: JSON.stringify(input.targetPlatforms ?? []),
        musicSettings: JSON.stringify(input.musicSettings ?? DEFAULT_MUSIC_SETTINGS),
        captionStyle: JSON.stringify(input.captionStyle ?? DEFAULT_CAPTION_STYLE),
    };
}

export const seriesRepo = {
    /** Series list for the dashboard. Reels are counted, not loaded. */
    async list(): Promise<Series[]> {
        const rows = await prisma.series.findMany({ orderBy: NEWEST_FIRST });
        return rows.map((row) => toSeries(row));
    },

    /** A single series with its reels (newest first) and their scenes. */
    async getById(id: string): Promise<Series | null> {
        const row = await prisma.series.findUnique({
            where: { id },
            include: {
                reels: {
                    orderBy: NEWEST_FIRST,
                    include: { scenes: { orderBy: { index: "asc" } } },
                },
            },
        });
        return row ? toSeries(row) : null;
    },

    async create(input: SeriesInput): Promise<Series> {
        const row = await prisma.series.create({
            data: {
                ...toRow(input),
                ...(input.id ? { id: input.id } : {}),
                status: input.status ?? "active",
            },
        });
        return toSeries(row);
    },

    async update(id: string, patch: Partial<SeriesInput>): Promise<Series | null> {
        const existing = await prisma.series.findUnique({ where: { id } });
        if (!existing) return null;

        // Only serialise the JSON columns that were actually supplied, so a
        // partial patch cannot silently reset the others to their defaults.
        const data: Record<string, unknown> = {};
        const scalar = [
            "name", "niche", "artStyle", "voiceId", "language",
            "targetDuration", "frequency", "usePremiumImageStack",
            "seriesContext", "visualStylePrompt", "format",
        ] as const;
        for (const key of scalar) {
            if (patch[key] !== undefined) data[key] = patch[key];
        }
        if (patch.targetPlatforms !== undefined) data.targetPlatforms = JSON.stringify(patch.targetPlatforms);
        if (patch.musicSettings !== undefined) data.musicSettings = JSON.stringify(patch.musicSettings);
        if (patch.captionStyle !== undefined) data.captionStyle = JSON.stringify(patch.captionStyle);
        if (patch.status !== undefined) data.status = patch.status;

        const row = await prisma.series.update({ where: { id }, data });
        return toSeries(row);
    },

    /** Flip active <-> paused without the caller having to read first. */
    async toggleStatus(id: string): Promise<Series | null> {
        const existing = await prisma.series.findUnique({ where: { id } });
        if (!existing) return null;
        const row = await prisma.series.update({
            where: { id },
            data: { status: existing.status === "active" ? "paused" : "active" },
        });
        return toSeries(row);
    },

    /** Reels and scenes go with it via onDelete: Cascade. */
    async delete(id: string): Promise<boolean> {
        const existing = await prisma.series.findUnique({ where: { id } });
        if (!existing) return false;
        await prisma.series.delete({ where: { id } });
        return true;
    },
};
