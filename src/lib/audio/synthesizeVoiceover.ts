import { synthesizeSpeech, synthesizeSpeechWithTimestamps, type WordTimestamp } from "./elevenlabs";
import { persistDataUrl } from "../media/persistDataUrl";

export type Voiceover = {
    /** Public path such as /voiceovers/<uuid>.mp3 — never a data URL. */
    path: string;
    /** Present only when the provider returned word timings (ElevenLabs). */
    words: WordTimestamp[];
};

/**
 * Smallest byte count that can plausibly be real speech.
 *
 * Every provider in this file returns a hardcoded ~250-byte silent MP3 when its
 * API rejects the request, instead of throwing. That placeholder is a valid
 * data URL and a valid file, so nothing downstream notices until the renderer
 * tries to decode it and dies on "Failed to find two consecutive MPEG audio
 * frames". At ~48kbps even a one-second clip clears 4KB, so anything smaller is
 * a failure wearing a success costume.
 */
const MIN_VOICEOVER_BYTES = 4096;

/**
 * Produces a voiceover file and, when available, word timings.
 *
 * ElevenLabs is the only provider. The timestamped endpoint is tried first
 * because word timings drive caption sync and scene cuts directly; without them
 * the pipeline falls back to estimating from punctuation, which drifts.
 *
 * Output is a file path rather than a base64 data URL, and a provider that
 * returns placeholder audio is treated as a failure rather than a success.
 * Returns null when nothing usable came back, so the caller can fail the reel
 * with an actionable message instead of persisting unrenderable silence.
 */
export async function synthesizeVoiceover(
    text: string,
    { voiceId = "storyteller", language = "english" } = {},
): Promise<Voiceover | null> {
    const persist = (audio: string) =>
        persistDataUrl(audio, "voiceovers", { minBytes: MIN_VOICEOVER_BYTES });

    const timestamped = await synthesizeSpeechWithTimestamps(text, voiceId, language);
    if (timestamped?.audioUrl) {
        const path = await persist(timestamped.audioUrl);
        if (path) {
            console.log(`[voice] ElevenLabs + timestamps (${timestamped.words.length} words)`);
            return { path, words: timestamped.words ?? [] };
        }
        console.warn("[voice] Timestamped synthesis returned unusable audio, retrying plain");
    }

    const basic = await synthesizeSpeech(text, voiceId, language);
    const path = await persist(basic);
    if (path) {
        console.log("[voice] ElevenLabs (no timestamps)");
        return { path, words: [] };
    }

    console.error("[voice] ElevenLabs returned unusable audio");
    return null;
}
