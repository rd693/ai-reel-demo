import type { TranscriptWord } from "../audio/transcribe";

/**
 * Turns narration beats into shots.
 *
 * The story decides how many shots a reel has. Previously the count came from
 * `getTargets`, which divided the *target duration* by six — so a 60s reel got
 * ten images no matter what it was about, and once the real voiceover came back
 * at 82s each image sat on screen for eight seconds. That is a slideshow.
 *
 * Here the beat is the unit the writer produced, and a beat that runs long is
 * split into as many shots as it can carry. A beat that is genuinely short
 * stays one shot. Nothing is padded and nothing is trimmed: the narration is
 * fixed, and the cutting adapts to it.
 */

/** Longest a single shot may hold the screen once the reel is underway. */
export const MAX_SHOT_MS = 3500;

/** The opening, where viewers decide whether to stay — cut faster here. */
export const HOOK_WINDOW_MS = 5000;
export const HOOK_MAX_SHOT_MS = 2200;

/** Below this a cut reads as a glitch rather than an edit. */
export const MIN_SHOT_MS = 1400;

/** Most shots one narration beat may be split into. */
const MAX_SHOTS_PER_BEAT = 4;

export type ShotType = "wide" | "medium" | "close" | "detail";

/**
 * Shot grammar, cycled so consecutive shots never frame the subject the same
 * way. Two identical compositions in a row read as a duplicate image even when
 * the two generations differ.
 */
const SHOT_CYCLE: ShotType[] = ["wide", "medium", "close", "detail"];

const SHOT_TYPE_PROMPTS: Record<ShotType, string> = {
    wide: "wide establishing shot, subject small against the environment",
    medium: "medium shot, subject waist-up, surroundings visible",
    close: "close-up, face fills the frame, emotion readable",
    detail: "extreme close-up on one telling detail — hands, eyes, or a single object",
};

export type Beat = {
    id?: string;
    narrationText?: string;
    headline?: string;
    visualPrompt?: string;
    startMs: number;
    endMs: number;
};

export type PlannedShot<T extends Beat> = T & {
    startMs: number;
    endMs: number;
    durationInSeconds: number;
    shotType: ShotType;
};

/** How many shots a beat of this length, starting here, should be cut into. */
export function shotsForBeat(startMs: number, durationMs: number): number {
    const limit = startMs < HOOK_WINDOW_MS ? HOOK_MAX_SHOT_MS : MAX_SHOT_MS;
    const wanted = Math.ceil(durationMs / limit);
    // A beat can only carry as many shots as fit at the minimum length —
    // otherwise a 2s beat asked for two shots would produce two 1s flickers.
    const affordable = Math.floor(durationMs / MIN_SHOT_MS);
    return Math.max(1, Math.min(wanted, affordable, MAX_SHOTS_PER_BEAT));
}

/**
 * Cut points inside a beat, snapped to word boundaries.
 *
 * Cutting mid-word is the single most obvious tell of an automated edit, so an
 * even split is only the starting point: each cut moves to the nearest gap
 * between spoken words. Without word timings the even split stands.
 */
function cutPoints(
    startMs: number,
    endMs: number,
    count: number,
    words: TranscriptWord[] | undefined,
): number[] {
    const span = endMs - startMs;
    const ideal = Array.from({ length: count - 1 }, (_, k) => startMs + (span * (k + 1)) / count);
    if (!words?.length) return ideal.map(Math.round);

    const boundaries = words
        .map((w) => Math.round(w.end * 1000))
        .filter((ms) => ms > startMs && ms < endMs);
    if (!boundaries.length) return ideal.map(Math.round);

    const cuts: number[] = [];
    let floor = startMs;

    for (const target of ideal) {
        // Every cut must leave room for a minimum-length shot on both sides.
        const lowest = floor + MIN_SHOT_MS;
        const highest = endMs - MIN_SHOT_MS * (count - cuts.length - 1);
        const usable = boundaries.filter((ms) => ms >= lowest && ms <= highest);

        const chosen = usable.length
            ? usable.reduce((best, ms) => (Math.abs(ms - target) < Math.abs(best - target) ? ms : best))
            : Math.round(Math.min(Math.max(target, lowest), Math.max(lowest, highest)));

        cuts.push(chosen);
        floor = chosen;
    }

    return cuts;
}

/** The words spoken inside a window, as text. */
function narrationBetween(words: TranscriptWord[] | undefined, startMs: number, endMs: number): string {
    if (!words?.length) return "";
    return words
        .filter((w) => w.start * 1000 >= startMs && w.start * 1000 < endMs)
        .map((w) => w.word)
        .join(" ")
        .trim();
}

/** Proportional fallback when there are no word timings to slice on. */
function splitTextEvenly(text: string, parts: number): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (parts <= 1 || words.length === 0) return [text];

    const per = Math.ceil(words.length / parts);
    return Array.from({ length: parts }, (_, k) => words.slice(k * per, (k + 1) * per).join(" "));
}

/**
 * Expands timed narration beats into a shot list.
 *
 * Beats arrive already positioned against the real audio (see
 * `assignSceneTimings`), so this only subdivides — it never moves a beat's
 * start or end, and the shots of a beat tile it exactly. That keeps the reel
 * locked to the voiceover no matter how the cutting changes.
 */
export function planShots<T extends Beat>(
    beats: T[],
    captionWords: TranscriptWord[] | undefined,
): PlannedShot<T>[] {
    const shots: PlannedShot<T>[] = [];
    let cycle = 0;

    for (const beat of beats) {
        const duration = beat.endMs - beat.startMs;
        const count = shotsForBeat(beat.startMs, duration);
        const cuts = count > 1 ? cutPoints(beat.startMs, beat.endMs, count, captionWords) : [];
        const edges = [beat.startMs, ...cuts, beat.endMs];

        const basePrompt = beat.visualPrompt || beat.narrationText || beat.headline || "";
        const fallbackText = captionWords?.length
            ? null
            : splitTextEvenly(beat.narrationText || "", count);

        for (let k = 0; k < count; k++) {
            const startMs = edges[k];
            const endMs = edges[k + 1];
            const shotType = SHOT_CYCLE[cycle++ % SHOT_CYCLE.length];

            const narrationText =
                count === 1
                    ? beat.narrationText
                    : (fallbackText?.[k] ?? narrationBetween(captionWords, startMs, endMs)) ||
                      beat.narrationText;

            shots.push({
                ...beat,
                // Ids must stay unique — the UI keys scene thumbnails on them.
                ...(beat.id ? { id: `${beat.id}-${k}` } : {}),
                narrationText,
                // Every shot of a beat depicts the same moment, so the prompt is
                // re-framed rather than replaced. Left unchanged, the generator
                // returns the same picture two or three times in a row.
                visualPrompt: count === 1 ? basePrompt : `${basePrompt}, ${SHOT_TYPE_PROMPTS[shotType]}`,
                shotType,
                startMs,
                endMs,
                durationInSeconds: (endMs - startMs) / 1000,
            } as PlannedShot<T>);
        }
    }

    return shots;
}

/** One-line description of a plan, for the pipeline log. */
export function summarizeShotPlan(shots: { durationInSeconds: number }[]): string {
    if (!shots.length) return "no shots";
    const total = shots.reduce((sum, s) => sum + s.durationInSeconds, 0);
    const longest = Math.max(...shots.map((s) => s.durationInSeconds));
    return `${shots.length} shots over ${total.toFixed(1)}s (avg ${(total / shots.length).toFixed(1)}s, longest ${longest.toFixed(1)}s)`;
}
