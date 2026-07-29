import type {
    SeriesModel as SeriesRow,
    ReelModel as ReelRow,
    SceneModel as SceneRow,
    RenderJobModel as RenderJobRow,
} from "../../generated/prisma/models";
import type { ArtStyle, FacelessReel, Series } from "../../types/series";
import type { ReelScene, UGCSceneType } from "../../types/reel";

// SQLite stores unions as TEXT and structured values as JSON TEXT. Everything
// that crosses this boundary gets decoded here so the rest of the app keeps
// working with real types instead of strings.

// Narration and timeline fields now live on ReelScene itself, since they are
// columns rather than pipeline-only extras. Kept as an alias so the repos read
// clearly about what they persist.
export type PersistedScene = ReelScene;

export type SeriesWithReels = SeriesRow & {
    reels?: (ReelRow & { scenes?: SceneRow[] })[];
};

export type ReelWithScenes = ReelRow & { scenes?: SceneRow[] };

/** JSON.parse that degrades to a fallback instead of throwing on bad rows. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        console.warn("[db] Malformed JSON column, using fallback:", raw.slice(0, 60));
        return fallback;
    }
}

export const DEFAULT_MUSIC_SETTINGS: Series["musicSettings"] = {
    enabled: true,
    trackId: "/music/cinematic_tension.mp3",
    volume: 0.5,
};

export const DEFAULT_CAPTION_STYLE: Series["captionStyle"] = {
    type: "word",
    animation: "pop",
    color: "#FFD700",
    fontSize: 120,
    fontFamily: "Inter",
    boxEnabled: true,
};

export function toScene(row: SceneRow): PersistedScene {
    return {
        id: row.id,
        type: row.type as UGCSceneType,
        durationInSeconds: row.durationInSeconds,
        headline: row.headline,
        narrationText: row.narrationText ?? undefined,
        visualPrompt: row.visualPrompt ?? undefined,
        backgroundUrl: row.backgroundPath ?? undefined,
        backgroundType: (row.backgroundType as "image" | "video" | null) ?? undefined,
        startMs: row.startMs ?? undefined,
        endMs: row.endMs ?? undefined,
    };
}

export function toReel(row: ReelWithScenes): FacelessReel {
    const scenes = (row.scenes ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .map(toScene);

    return {
        id: row.id,
        seriesId: row.seriesId,
        businessName: row.title,
        script: row.script,
        brandColor: row.brandColor,
        accentColor: row.accentColor,
        scenes,
        seed: row.seed ?? undefined,
        language: row.language ?? undefined,
        artStyle: (row.artStyle as ArtStyle | null) ?? undefined,
        visualStyleOverride: row.visualStyleOverride ?? undefined,
        usePremiumImageStack: row.usePremiumImageStack,
        // Domain keeps the name `voiceoverUrl`; the column is a path by design.
        voiceoverUrl: row.voiceoverPath ?? undefined,
        actualDuration: row.actualDurationMs ?? undefined,
        captionWords: parseJson<unknown[]>(row.captionWords, []),
        generationStatus: row.generationStatus as FacelessReel["generationStatus"],
        status: row.generationStatus,
        musicSettings: row.musicSettings
            ? parseJson(row.musicSettings, DEFAULT_MUSIC_SETTINGS)
            : undefined,
        captionStyle: row.captionStyle
            ? parseJson(row.captionStyle, DEFAULT_CAPTION_STYLE)
            : undefined,
        scheduledFor: row.scheduledFor ?? undefined,
        publishedAt: row.publishedAt ?? undefined,
        createdAt: row.createdAt,
    };
}

export function toSeries(row: SeriesWithReels): Series {
    return {
        id: row.id,
        name: row.name,
        niche: row.niche,
        artStyle: row.artStyle as ArtStyle,
        voiceId: row.voiceId,
        frequency: row.frequency as Series["frequency"],
        targetDuration: row.targetDuration,
        targetPlatforms: parseJson<Series["targetPlatforms"]>(row.targetPlatforms, []),
        language: row.language,
        musicSettings: parseJson(row.musicSettings, DEFAULT_MUSIC_SETTINGS),
        captionStyle: parseJson(row.captionStyle, DEFAULT_CAPTION_STYLE),
        seriesContext: row.seriesContext ?? undefined,
        visualStylePrompt: row.visualStylePrompt ?? undefined,
        usePremiumImageStack: row.usePremiumImageStack,
        status: row.status as Series["status"],
        createdAt: row.createdAt,
        reels: (row.reels ?? []).map(toReel),
    };
}

export type RenderJobView = {
    id: string;
    reelId: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress: number;
    outputPath?: string;
    error?: string;
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
};

export function toRenderJob(row: RenderJobRow): RenderJobView {
    return {
        id: row.id,
        reelId: row.reelId,
        status: row.status as RenderJobView["status"],
        progress: row.progress,
        outputPath: row.outputPath ?? undefined,
        error: row.error ?? undefined,
        createdAt: row.createdAt,
        startedAt: row.startedAt ?? undefined,
        finishedAt: row.finishedAt ?? undefined,
    };
}
