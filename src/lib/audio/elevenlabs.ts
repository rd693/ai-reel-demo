/**
 * ElevenLabs API Wrapper
 * 
 * To use this, add ELEVEN_LABS_API_KEY to your .env file
 */

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export type ElevenLabsVoice = "antoni" | "bella" | "rachel" | "domi" | "elli" | "josh" | "arnold" | "adam" | "sam";

const VOICE_MAP: Record<string, string> = {
    antoni: "ErXwryYJaP8VwTYLOAD4",
    bella: "EXAVITQu4vr4xnSDxMaL",
    rachel: "21m00Tcm4TlvDq8ikWAM",
    adam: "pNInz6obpgDQGcFmaJgB",
    arnold: "VR6AewrYgfuFJJebXmC0",
    sam: "yoZ06aL4AIZws1559Qvo", // Professional Narrator
    josh: "TxGEqnSAs9auCw9LieRL",  // Deep Storyteller
    storyteller: "TxGEqnSAs9auCw9LieRL", // Josh - deep storyteller
    v1: "yoZ06aL4AIZws1559Qvo", // Sam - professional narrator
    v2: "pNInz6obpgDQGcFmaJgB",  // Adam - deep voice
    prem: "g5CIjZtFv3gu8tDkXv68",  // Prem - Premium Multilingual Indian Male
    nisha: "ry24M5qnCXlsSpczMs4H" // Nisha - Premium Multilingual Indian Female
};

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

    let voiceGuid = VOICE_MAP[voiceId] || VOICE_MAP.arnold;

    // ✅ If language is Hindi, automatically route to premium native Indian voices (Prem for Male, Nisha for Female)
    if (language.toLowerCase() === "hindi") {
        const isFemale = ["bella", "rachel", "nisha"].includes(voiceId.toLowerCase());
        voiceGuid = isFemale 
            ? "ry24M5qnCXlsSpczMs4H" // Nisha (Native Indian Female)
            : "g5CIjZtFv3gu8tDkXv68"; // Prem (Native Indian Male)
        console.log(`[ElevenLabs] Auto-routing Hindi language to native Indian voice: ${isFemale ? 'Nisha' : 'Prem'}`);
    }

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

    let voiceGuid = VOICE_MAP[voiceId] || VOICE_MAP.arnold;

    // ✅ If language is Hindi, automatically route to premium native Indian voices (Prem for Male, Nisha for Female)
    if (language.toLowerCase() === "hindi") {
        const isFemale = ["bella", "rachel", "nisha"].includes(voiceId.toLowerCase());
        voiceGuid = isFemale 
            ? "ry24M5qnCXlsSpczMs4H" // Nisha (Native Indian Female)
            : "g5CIjZtFv3gu8tDkXv68"; // Prem (Native Indian Male)
        console.log(`[ElevenLabs] Auto-routing Hindi language to native Indian voice with timestamps: ${isFemale ? 'Nisha' : 'Prem'}`);
    }

    try {
        console.log(`[ElevenLabs] Synthesizing with timestamps. Voice GUID: ${voiceGuid} (Voice: ${voiceId})`);
        const response = await fetch(`${ELEVEN_LABS_API_URL}/${voiceGuid}/stream-with-timestamps`, {
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
            throw new Error(`ElevenLabs stream-with-timestamps failed: ${response.statusText}`);
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
