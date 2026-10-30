import { ReelData, ReelScene } from "./reel";
import type { ReelFormat } from "@/lib/pipeline/format";

export type NicheType = string;

export type ArtStyle =
    | "watercolor_illustration"
    | "comic"
    | "creepy_comic"
    | "modern_cartoon"
    | "disney"
    | "mythology"
    | "pixel_art"
    | "ghibli"
    | "anime"
    | "painting"
    | "dark_fantasy"
    | "lego"
    | "polaroid"
    | "realism"
    | "fantastic"
    | "cinematic_3d";

export interface Series {
    id: string;
    name: string;
    niche: NicheType;
    artStyle: ArtStyle;
    voiceId: string;
    frequency: "daily" | "weekly" | "manual";
    targetDuration: number; // in seconds (60, 180, etc.)
    targetPlatforms: ("tiktok" | "instagram" | "youtube")[];
    language: string;
    musicSettings: {
        enabled: boolean;
        trackId: string;
        volume: number;
    };
    seriesContext?: string;
    visualStylePrompt?: string;
    /** Card deck id. Unset means the original full-bleed slideshow. */
    deckId?: string;
    usePremiumImageStack?: boolean; // ✅ Paid/Free stack toggle
    format?: ReelFormat; // stills, mixed, or motion — see src/lib/pipeline/format.ts
    captionStyle: {
        // Canonical values. Older rows may hold "double"/"split"/"line";
        // normalizeCaptionType in the composition maps those on read.
        type: 'word' | 'phrase' | 'sentence';
        animation: 'pop' | 'fade' | 'slide' | 'none';
        color: string;
        fontSize: number;
        fontFamily: string;
        boxEnabled: boolean;
        yOffset?: number; // Distance from bottom in pixels
    };
    reels: FacelessReel[];
    status: "active" | "paused";
    createdAt: Date;
}

export interface FacelessReel extends ReelData {
    id?: string;
    seriesId: string;
    script: string; // The full narrative script
    voiceoverUrl?: string;
    actualDuration?: number; // ✅ Timing property
    captionWords?: any[]; // ✅ Word timings
    status?: string; // ✅ Reel status
    createdAt?: Date; // ✅ Creation date
    language?: string; // ✅ Language
    artStyle?: ArtStyle; // ✅ Per-reel visual style override
    visualStyleOverride?: string; // ✅ Per-reel visual prompt override
    format?: ReelFormat; // overrides the series format when set
    /** The deck this reel was printed with, copied from the series at layout time. */
    deckId?: string;
    generationStatus: "pending" | "scripted" | "voicing" | "visualizing" | "rendering" | "completed" | "failed";
    generationError?: string; // Why the pipeline stopped, when generationStatus is "failed"
    scheduledFor?: Date;
    publishedAt?: Date;
    /** Upload copy for YouTube, written once the script exists. */
    publishCopy?: PublishCopy;
    musicSettings?: Series['musicSettings'];
    captionStyle?: Series['captionStyle'];
    socialLinks?: {
        tiktok?: string;
        instagram?: string;
        youtube?: string;
    };
}

export type SceneSegment = ReelScene & {
    narrationText: string; // Specific text being spoken during this scene
    visualPrompt: string; // Prompt used to generate the background for this scene
};

/**
 * Everything the YouTube upload form asks for, ready to paste.
 *
 * Text fields are already inside YouTube's limits (see publishCopy.ts), so the
 * dashboard can copy them verbatim.
 */
export interface PublishCopy {
    /** At most 100 characters — YouTube's hard limit. */
    title: string;
    /** Hook line, summary, comment prompt, then the hashtags. At most 5000 characters. */
    description: string;
    /** Each starts with "#"; the first three show above the title on YouTube. */
    hashtags: string[];
    /** Search keywords for the Tags field, 500 characters in total at most. */
    tags: string[];
    /** A question to pin as the first comment, to start the thread. */
    pinnedComment?: string;
    settings: {
        /** YouTube category name and its API id. */
        category: string;
        categoryId: string;
        /** BCP-47 code for "Video language". */
        language: string;
        madeForKids: false;
        /**
         * Answer for "Altered or synthetic content". Only realistic-looking
         * generated media needs disclosing; stylised art does not.
         */
        alteredContent: boolean;
    };
    generatedAt: string;
    provider: string;
}
