import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { seriesRepo } from "@/lib/db/seriesRepo";
import { reelRepo } from "@/lib/db/reelRepo";
import { persistDataUrl } from "@/lib/media/persistDataUrl";
import type { FacelessReel, Series } from "@/types/series";

// One-time import of the pre-SQLite localStorage data. It can only run from the
// browser that holds it, so the client posts what it finds here.
type MigratePayload = {
    series?: Series[];
    reelsBySeries?: Record<string, FacelessReel[]>;
};

export async function POST(req: Request) {
    try {
        const { series = [], reelsBySeries = {} } = (await req.json()) as MigratePayload;

        if (series.length === 0) {
            return NextResponse.json({ imported: { series: 0, reels: 0 }, skipped: [] });
        }

        let importedSeries = 0;
        let importedReels = 0;
        const skipped: string[] = [];

        for (const legacy of series) {
            // Re-running the import must not duplicate anything, so ids are
            // preserved and existing rows are left alone.
            if (legacy.id && (await prisma.series.findUnique({ where: { id: legacy.id } }))) {
                skipped.push(legacy.name ?? legacy.id);
                continue;
            }

            const created = await seriesRepo.create({
                id: legacy.id,
                name: legacy.name ?? "Untitled Series",
                niche: legacy.niche ?? "general",
                artStyle: legacy.artStyle ?? "cinematic_3d",
                voiceId: legacy.voiceId ?? "storyteller",
                language: legacy.language ?? "english",
                targetDuration: legacy.targetDuration ?? 60,
                frequency: legacy.frequency ?? "manual",
                targetPlatforms: legacy.targetPlatforms ?? [],
                musicSettings: legacy.musicSettings,
                captionStyle: legacy.captionStyle,
                seriesContext: legacy.seriesContext,
                visualStylePrompt: legacy.visualStylePrompt,
                usePremiumImageStack: legacy.usePremiumImageStack,
                status: legacy.status ?? "active",
            });
            importedSeries++;

            for (const reel of reelsBySeries[legacy.id] ?? []) {
                // Base64 voiceovers and scene images become files on the way in.
                const voiceoverUrl = await persistDataUrl(reel.voiceoverUrl, "voiceovers");
                const scenes = await Promise.all(
                    (reel.scenes ?? []).map(async (scene) => ({
                        ...scene,
                        backgroundUrl: await persistDataUrl(scene.backgroundUrl, "uploads"),
                    })),
                );

                await reelRepo.create({
                    ...reel,
                    id: reel.id,
                    seriesId: created.id,
                    businessName: reel.businessName ?? "Untitled Reel",
                    voiceoverUrl,
                    scenes,
                    generationStatus: reel.generationStatus ?? "completed",
                });
                importedReels++;
            }
        }

        return NextResponse.json({
            imported: { series: importedSeries, reels: importedReels },
            skipped,
        });
    } catch (error) {
        console.error("[api/migrate] import failed:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Import failed" },
            { status: 500 },
        );
    }
}
