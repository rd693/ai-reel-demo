import type { TranscriptWord } from "../audio/transcribe";

// Timing rules lifted out of the client-side agent so they can be unit-reasoned
// about and reused server-side. Behaviour is deliberately unchanged: these
// constants were tuned against real voiceovers.

/** Cinematic tail so the last word is never clipped by the render boundary. */
export const TRAILING_PAD_MS = 1500;

/** Every scene gets at least this long, even if it has no narration. */
const MIN_SCENE_MS = 1000;

export type TimedScene = {
    narrationText?: string;
    headline?: string;
    startMs: number;
    endMs: number;
};

/**
 * Distributes scenes across the real audio duration.
 *
 * With word timings each scene ends at the timestamp of its last spoken word,
 * which is what makes cuts land on the narration. Without them, scene length is
 * proportional to word count.
 *
 * Scenes are laid out strictly sequentially — each starts where the previous
 * ended — so rounding can never leave a gap or an overlap.
 */
export function assignSceneTimings<T extends { narrationText?: string; headline?: string }>(
    scenes: T[],
    captionWords: TranscriptWord[] | undefined,
    totalDurationMs: number,
): (T & { startMs: number; endMs: number; durationInSeconds: number })[] {
    if (scenes.length === 0) return [];

    const hasWords = !!captionWords && captionWords.length > 0;
    const wordCounts = scenes.map(
        (s) => (s.narrationText || s.headline || "").trim().split(/\s+/).filter(Boolean).length,
    );
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);

    let elapsed = 0;
    let wordIdx = 0;

    return scenes.map((scene, i) => {
        const isLast = i === scenes.length - 1;
        const startMs = elapsed;
        let endMs: number;

        if (hasWords && wordCounts[i] > 0 && wordIdx < captionWords!.length) {
            const endIdx = Math.min(captionWords!.length - 1, wordIdx + wordCounts[i] - 1);
            endMs = Math.round(captionWords![endIdx].end * 1000);
            wordIdx = endIdx + 1;
        } else if (!hasWords && totalWords > 0) {
            endMs = startMs + Math.round((wordCounts[i] / totalWords) * totalDurationMs);
        } else {
            endMs = startMs + Math.round(totalDurationMs / scenes.length);
        }

        // The last scene owns whatever is left, so the reel always fills the audio.
        if (isLast) {
            endMs = totalDurationMs;
        } else {
            // Leave room for the scenes that still have to fit after this one.
            const maxEnd = totalDurationMs - (scenes.length - 1 - i) * MIN_SCENE_MS;
            if (endMs > maxEnd) endMs = maxEnd;
        }

        if (endMs <= startMs) endMs = startMs + MIN_SCENE_MS;

        elapsed = endMs;
        return {
            ...scene,
            startMs,
            endMs,
            durationInSeconds: (endMs - startMs) / 1000,
        };
    });
}

/**
 * Approximate word timings for when no ASR provider returned any.
 *
 * Words are weighted so sentence ends hold longer than commas, which hold
 * longer than plain words — captions drift far less than an even split.
 */
export function estimateCaptionWords(script: string, totalDurationMs: number): TranscriptWord[] {
    const raw = script.split(/\s+/).filter(Boolean);
    if (raw.length === 0) return [];

    const weighted = raw.map((word) => {
        const isSentenceEnd = /[।.!?]/.test(word);
        const isComma = /[,،]/.test(word);
        return { word, weight: 1 + (isSentenceEnd ? 0.45 : isComma ? 0.15 : 0) };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

    let currentMs = 0;
    return weighted.map(({ word, weight }) => {
        const durationMs = (weight / totalWeight) * totalDurationMs;
        const start = currentMs / 1000;
        currentMs += durationMs;
        return { word, start, end: currentMs / 1000 };
    });
}

/**
 * Chooses the authoritative duration for a reel.
 *
 * Word timings win when present. A transcript duration is rejected if it is
 * less than half the expected length: a truncated transcript would otherwise
 * cut the video off mid-sentence.
 */
export function resolveDurationMs(
    words: TranscriptWord[] | undefined,
    transcriptDurationSec: number | undefined,
    fallbackSec: number,
): number {
    if (words && words.length > 0) {
        return Math.round(words[words.length - 1].end * 1000) + TRAILING_PAD_MS;
    }

    if (transcriptDurationSec && transcriptDurationSec > 0) {
        const plausible = !(fallbackSec > 5 && transcriptDurationSec < fallbackSec / 2);
        if (plausible) return Math.round(transcriptDurationSec * 1000) + TRAILING_PAD_MS;
        console.warn(
            `[timing] Ignoring implausible transcript duration ${transcriptDurationSec}s vs expected ~${fallbackSec}s`,
        );
    }

    return Math.round(fallbackSec * 1000) + TRAILING_PAD_MS;
}
