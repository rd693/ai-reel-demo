import { TimelineText } from "../types/timeline";
import { v4 as uuidv4 } from "uuid";

/**
 * Creates captions for the reel with two levels of sync:
 * 1. Whisper-based (Frame Perfect)
 * 2. Proportional Scaling (Fallback based on real audio length)
 */
export const createCaptionsFromScenes = (
    scenes: any[],
    captionWords?: any[],
    actualAudioDurationMs?: number
): TimelineText[] => {

    // ── PATH 1: Whisper word timestamps (perfect sync) ──────────
    if (captionWords && captionWords.length > 0) {
        return captionWords.map((w: any) => ({
            id: `w-${uuidv4()}`,
            startMs: Math.round(w.start * 1000),  // Whisper gives seconds
            endMs: Math.round(w.end * 1000),
            text: w.word.trim().toUpperCase(),
        }));
    }

    // ── PATH 2: Proportional from actual audio duration ─────────
    // Uses real audio duration, not LLM-guessed scene durations
    const totalSceneDurationMs = scenes.reduce(
        (acc, s) => acc + s.durationInSeconds * 1000, 0
    );
    const audioDurationMs = actualAudioDurationMs || totalSceneDurationMs;
    const scaleFactor = audioDurationMs / totalSceneDurationMs;

    let currentMs = 0;
    const allCaptions: TimelineText[] = [];

    scenes.forEach((scene, sceneIdx) => {
        // Scale this scene's duration to match real audio proportionally
        const rawSceneDurationMs = scene.durationInSeconds * 1000;
        const scaledDurationMs = rawSceneDurationMs * scaleFactor;

        const text = (
            scene.narrationText ||
            scene.narration_text ||
            scene.headline ||
            scene.text || ""
        ).trim();

        if (!text) {
            currentMs += scaledDurationMs;
            return;
        }

        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) {
            currentMs += scaledDurationMs;
            return;
        }

        // Give each word time proportional to its length
        const totalChars = words.reduce((a: number, w: string) => a + w.length, 0);
        const msPerChar = scaledDurationMs / (totalChars + words.length * 0.5);

        let wordStartMs = currentMs;
        words.forEach((word: string) => {
            const wordDurationMs = Math.max(
                150, // minimum 150ms per word
                (word.length + 0.5) * msPerChar
            );
            allCaptions.push({
                id: `c-${sceneIdx}-${uuidv4()}`,
                startMs: Math.round(wordStartMs),
                endMs: Math.round(wordStartMs + wordDurationMs),
                text: word.toUpperCase(),
            });
            wordStartMs += wordDurationMs;
        });

        currentMs += scaledDurationMs;
    });

    return allCaptions;
};
