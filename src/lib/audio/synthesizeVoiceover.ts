import { synthesizeSpeech, synthesizeSpeechWithTimestamps, type WordTimestamp } from "./elevenlabs";
import { synthesizeWithAzure } from "./azureTTS";
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
 * Produces a voiceover file and, when the provider supports it, word timings.
 *
 * Provider order is unchanged (ElevenLabs-with-timestamps for premium, then
 * Azure, then plain ElevenLabs). Two things differ from the original: the
 * output is a file path rather than a base64 data URL, and a provider that
 * returns placeholder audio is treated as a failure so the next one is tried.
 *
 * Returns null when every provider fails, so the caller can fail the reel with
 * an actionable message instead of persisting silence that cannot be rendered.
 */
export async function synthesizeVoiceover(
    text: string,
    { voiceId = "storyteller", language = "english", usePremium = false } = {},
): Promise<Voiceover | null> {
    const persist = (audio: string) =>
        persistDataUrl(audio, "voiceovers", { minBytes: MIN_VOICEOVER_BYTES });

    if (usePremium) {
        const premium = await synthesizeSpeechWithTimestamps(text, voiceId, language);
        if (premium?.audioUrl) {
            const path = await persist(premium.audioUrl);
            if (path) {
                console.log(`[voice] ElevenLabs + timestamps (${premium.words.length} words)`);
                return { path, words: premium.words ?? [] };
            }
        }
        console.warn("[voice] Premium synthesis failed, falling back to the free stack");
    }

    const azure = await synthesizeWithAzure(text, language, voiceId);
    if (azure) {
        const path = await persist(azure);
        if (path) {
            console.log("[voice] Azure TTS");
            return { path, words: [] };
        }
        console.warn("[voice] Azure returned placeholder audio, trying ElevenLabs");
    }

    const basic = await synthesizeSpeech(text, voiceId, language);
    const path = await persist(basic);
    if (path) {
        console.log("[voice] ElevenLabs (no timestamps)");
        return { path, words: [] };
    }

    console.error("[voice] Every provider returned unusable audio");
    return null;
}
