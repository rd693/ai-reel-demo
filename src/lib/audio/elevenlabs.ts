/**
 * ElevenLabs API Wrapper
 * 
 * To use this, add ELEVEN_LABS_API_KEY to your .env file
 */

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export type ElevenLabsVoice = "antoni" | "bella" | "rachel" | "domi" | "elli" | "josh" | "arnold" | "adam" | "sam";

// Friendly names are kept stable because they are stored on every Series row;
// only the ids behind them changed. The previous ids were retired ElevenLabs v1
// voices and every one returned 404 — including the UI default ("arnold") — so
// no reel could ever get a voiceover.
const VOICE_MAP: Record<string, string> = {
    antoni: "nPczCjzI2devNBz1zQrb", // Brian — deep, resonant
    bella: "hpp4J3VqNfWAUOO0d1Us", // Bella — bright, warm
    arnold: "pNInz6obpgDQGcFmaJgB", // Adam — dominant, firm
    josh: "TX3LPaxmHKxFdv7VOQHJ", // Liam — energetic
    storyteller: "JBFqnCBsd6RMkjVDRZzb", // George — warm storyteller
    rachel: "EXAVITQu4vr4xnSDxMaL", // Sarah — mature, reassuring
    adam: "pNInz6obpgDQGcFmaJgB",
    sam: "onwK4e9ZLuTAKqWW03F9", // Daniel — steady broadcaster
    v1: "JBFqnCBsd6RMkjVDRZzb",
    v2: "nPczCjzI2devNBz1zQrb",
};

const DEFAULT_VOICE = VOICE_MAP.storyteller;

// Voices available to this account, fetched once per process.
let accountVoices: { id: string; name: string }[] | null = null;

async function getAccountVoices(apiKey: string): Promise<{ id: string; name: string }[]> {
    if (accountVoices) return accountVoices;
    try {
        const res = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": apiKey },
        });
        if (!res.ok) throw new Error(`voices lookup failed: ${res.status}`);
        const data = await res.json();
        accountVoices = (data.voices ?? []).map((v: { voice_id: string; name: string }) => ({
            id: v.voice_id,
            name: v.name,
        }));
    } catch (e) {
        console.warn("[ElevenLabs] Could not list account voices:", e);
        accountVoices = [];
    }
    return accountVoices!;
}

/**
 * Turns a stored voice name into an id this account can actually use.
 *
 * Hardcoded ids rot: ElevenLabs retires voices, and a 404 at synthesis time is
 * indistinguishable from a bad API key. Checking the account's own list turns
 * that into a warning plus a working substitute instead of a dead pipeline.
 */
export async function resolveVoiceId(
    voiceId: string | undefined,
    apiKey: string,
): Promise<string> {
    const requested = VOICE_MAP[(voiceId ?? "").toLowerCase()] ?? voiceId ?? DEFAULT_VOICE;

    const voices = await getAccountVoices(apiKey);
    if (voices.length === 0) return requested; // Cannot verify — try it anyway.
    if (voices.some((v) => v.id === requested)) return requested;

    const substitute =
        voices.find((v) => /storyteller|narrat/i.test(v.name)) ??
        voices.find((v) => v.id === DEFAULT_VOICE) ??
        voices[0];

    console.warn(
        `[ElevenLabs] Voice "${voiceId}" (${requested}) is not on this account; using "${substitute.name}".`,
    );
    return substitute.id;
}

export async function synthesizeSpeech(text: string, voiceId: string = "arnold", language: string = "english"): Promise<string> {
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    
    if (!apiKey || apiKey === "your_key_here") {
        console.log("[Voice] No ELEVEN_LABS_API_KEY found, using FREE STACK (Google TTS)...");
        try {
            const langCodeMap: Record<string, string> = {
                'english': 'en', 'hindi': 'hi', 'spanish': 'es', 'japanese': 'ja'
            };
            const tlCode = langCodeMap[language.toLowerCase()] || 'en';
            const safeText = text.substring(0, 200);
            const response = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(safeText)}&tl=${tlCode}&client=tw-ob`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
            }
        } catch (e) {}
        return "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIzLjEwMgAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIwADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//OEAAAAAAAAAAAAAAAAAAAAAAAADExU0UAAAAGAAAAbGF2Zf//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    }

    // eleven_multilingual_v2 speaks Hindi with any voice, so there is no
    // language-specific routing; the two "native Indian" ids this used to
    // switch to no longer exist and returned 404 for every Hindi reel.
    const voiceGuid = await resolveVoiceId(voiceId, apiKey);

    try {
        console.log(`[ElevenLabs] Synthesizing with model: eleven_multilingual_v2, Voice GUID: ${voiceGuid} (Voice: ${voiceId})`);
        const response = await fetch(`${ELEVEN_LABS_API_URL}/${voiceGuid}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": apiKey
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.65,
                    similarity_boost: 0.8,
                    style: 0.5,
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.statusText}`);
        }

        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());
        return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
    } catch (error) {
        console.error("Speech synthesis failed:", error);
        return "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIzLjEwMgAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIwADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//OEAAAAAAAAAAAAAAAAAAAAAAAADExU0UAAAAGAAAAbGF2Zf//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    }
}

export interface WordTimestamp {
    word: string;
    start: number;
    end: number;
}

export function parseAlignmentsToWords(
    characters: string[],
    starts: number[],
    ends: number[]
): WordTimestamp[] {
    const words: WordTimestamp[] = [];
    let currentWordChars: string[] = [];
    let wordStart = 0;

    for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        const start = starts[i];

        if (/\s/.test(char)) {
            if (currentWordChars.length > 0) {
                words.push({
                    word: currentWordChars.join(""),
                    start: wordStart,
                    end: ends[i - 1] !== undefined ? ends[i - 1] : start
                });
                currentWordChars = [];
            }
        } else {
            if (currentWordChars.length === 0) {
                wordStart = start;
            }
            currentWordChars.push(char);
        }
    }

    if (currentWordChars.length > 0) {
        words.push({
            word: currentWordChars.join(""),
            start: wordStart,
            end: ends[ends.length - 1]
        });
    }

    return words;
}

export async function synthesizeSpeechWithTimestamps(
    text: string,
    voiceId: string = "arnold",
    language: string = "english"
): Promise<{ audioUrl: string; words: WordTimestamp[] } | null> {
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
        console.warn("[ElevenLabs] No API Key for premium timestamps, fallback to Free");
        return null;
    }

    const voiceGuid = await resolveVoiceId(voiceId, apiKey);

    try {
        console.log(`[ElevenLabs] Synthesizing with timestamps. Voice GUID: ${voiceGuid} (Voice: ${voiceId})`);
        // The path is "stream/with-timestamps", not "stream-with-timestamps".
        // The hyphenated form 404s, which silently cost every reel its word
        // timings and pushed captions onto punctuation-based estimation.
        const response = await fetch(`${ELEVEN_LABS_API_URL}/${voiceGuid}/stream/with-timestamps`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": apiKey
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.65,
                    similarity_boost: 0.8,
                    style: 0.5,
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs with-timestamps failed: ${response.statusText}`);
        }

        const reader = response.body;
        if (!reader) throw new Error("No response body stream available");

        let buffer = "";
        let audioBase64Concat = "";
        const allCharacters: string[] = [];
        const allStarts: number[] = [];
        const allEnds: number[] = [];

        for await (const chunk of reader as any) {
            const chunkStr = new TextDecoder().decode(chunk);
            buffer += chunkStr;

            let lineEndIndex;
            while ((lineEndIndex = buffer.indexOf("\n")) !== -1) {
                const line = buffer.substring(0, lineEndIndex).trim();
                buffer = buffer.substring(lineEndIndex + 1);

                if (line) {
                    try {
                        const chunkData = JSON.parse(line);
                        if (chunkData.audio_base64) {
                            audioBase64Concat += chunkData.audio_base64;
                        }
                        if (chunkData.alignment) {
                            const align = chunkData.alignment;
                            if (align.characters) {
                                allCharacters.push(...align.characters);
                            }
                            if (align.character_start_times_seconds) {
                                allStarts.push(...align.character_start_times_seconds);
                            }
                            if (align.character_end_times_seconds) {
                                allEnds.push(...align.character_end_times_seconds);
                            }
                        }
                    } catch (e) {
                        // ignore syntax errors from partial chunks
                    }
                }
            }
        }

        const audioUrl = `data:audio/mpeg;base64,${audioBase64Concat}`;
        const words = parseAlignmentsToWords(allCharacters, allStarts, allEnds);

        console.log(`[ElevenLabs] ✅ Timestamps success. Generated ${words.length} words.`);
        return { audioUrl, words };
    } catch (error) {
        console.error("[ElevenLabs] Timestamps failed:", error);
        return null;
    }
}
