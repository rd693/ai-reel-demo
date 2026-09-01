/**
 * Prepares script text for text-to-speech.
 *
 * The prompt asks the writer for connected prose, but models drift back to a
 * trailer cadence — one observed 73-second script carried seven ellipses, a
 * hard pause roughly every 28 words. ElevenLabs reads "..." as a long dead
 * stop, so that cadence is audible as stuttering however good the voice is.
 *
 * This only touches what is SPOKEN. The stored script keeps the writer's
 * punctuation, and captions come from the synthesiser's own word timings, so
 * they follow the audio automatically.
 */

/** Trailing punctuation that already ends a clause. */
const CLAUSE_END = /[।.!?,;:]$/;

export function speakable(text: string): string {
    if (!text) return text;

    let out = text;

    // An ellipsis becomes a comma — a breath rather than a full stop. Where it
    // already follows a danda or full stop the sentence has ended, so the
    // pause is there and the ellipsis is simply dropped.
    out = out.replace(/\s*(\.{3,}|…)\s*/g, (_match, _dots, offset: number) => {
        const before = out.slice(0, offset).trimEnd();
        return CLAUSE_END.test(before) ? " " : ", ";
    });

    // Dashes used as a dramatic pause read as a stop too. A dash between
    // spaces is being used that way; a hyphen inside a word is not.
    out = out.replace(/\s+[—–]\s+/g, ", ");

    // Collapse anything the substitutions doubled up.
    out = out
        .replace(/\s*,\s*,+/g, ", ")
        .replace(/([।.!?])\s*,/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

    return out;
}

/** How much a script would change, for logging. */
export function speakableDiff(text: string): { pauses: number; changed: boolean } {
    const pauses = (text.match(/\.{3,}|…/g) ?? []).length + (text.match(/\s+[—–]\s+/g) ?? []).length;
    return { pauses, changed: speakable(text) !== text };
}
