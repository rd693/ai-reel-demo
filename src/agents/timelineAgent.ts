import { Timeline } from "../types/timeline";
import { createCaptionsFromScenes } from "./captionAgent";
import { getAudioDurationMs } from "../lib/audio/audioDuration";

type TimelineOptions = {
    audioUrl?: string;
};

/**
 * Creates the master timeline for the reel.
 * Forces all components (audio, text, visuals) to align with actual audio duration.
 */
export const createTimeline = (
    reel: any,
    options: TimelineOptions = {}
): Timeline & { actualDurationMs: number } => {

    const globalVoiceover = options.audioUrl || reel.voiceoverUrl;

    // ── STEP 1: Get REAL audio duration ────────────────────────
    let actualAudioDurationMs = 0;

    if (reel.actualDuration) {
        const raw = reel.actualDuration;
        actualAudioDurationMs = raw < 500 ? Math.round(raw * 1000) : raw;
    } else if (globalVoiceover?.startsWith('data:')) {
        actualAudioDurationMs = getAudioDurationMs(globalVoiceover);
    } else {
        actualAudioDurationMs = reel.scenes.reduce(
            (acc: number, s: any) => acc + (s.durationInSeconds || 0) * 1000, 0
        );
    }

    // ✅ SANITY CHECK: If we have word-level timestamps, the duration MUST match the last word.
    if (reel.captionWords && reel.captionWords.length > 0) {
        const lastWordEndMs = Math.round(reel.captionWords[reel.captionWords.length - 1].end * 1000);
        if (lastWordEndMs > 0 && Math.abs(actualAudioDurationMs - lastWordEndMs) > 2000) {
            console.log(`[TimelineAgent] Correcting duration drift: ${actualAudioDurationMs}ms -> ${lastWordEndMs}ms`);
            actualAudioDurationMs = lastWordEndMs + 1500; // ✅ Add 1.5s trailing pad during correction as well
        }
    }

    // ── STEP 2: Build captions using real duration ──────────────
    const captions = createCaptionsFromScenes(
        reel.scenes,
        reel.captionWords,         // Whisper timestamps if available
        actualAudioDurationMs      // real audio duration for scaling
    );

    // ── STEP 3: Single audio segment with REAL duration ─────────
    let audioSegments: any[] = [];

    if (globalVoiceover) {
        audioSegments = [{
            id: 'global-voiceover',
            startMs: 0,
            endMs: actualAudioDurationMs, // ✅ real duration, not scene sum
            audioUrl: globalVoiceover
        }];
    } else {
        // Per-scene audio fallback
        let currentMs = 0;
        audioSegments = reel.scenes
            .map((scene: any, i: number) => {
                const durationMs = scene.durationInSeconds * 1000;
                const seg = {
                    id: `audio-${i}`,
                    startMs: currentMs,
                    endMs: currentMs + durationMs,
                    audioUrl: scene.audioUrl || scene.voiceoverUrl
                };
                currentMs += durationMs;
                return seg;
            })
            .filter((s: any) => s.audioUrl?.trim().length > 0);
    }

    return {
        text: captions,
        audio: audioSegments,
        actualDurationMs: actualAudioDurationMs,
    };
};
