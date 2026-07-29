export type TranscriptWord = {
    word: string;
    start: number; // seconds
    end: number; // seconds
    confidence?: number;
};

export type Transcript = {
    words: TranscriptWord[];
    duration: number; // seconds
    text: string;
};

const LANGUAGE_CODES: Record<string, string> = {
    hindi: "hi",
    french: "fr",
    german: "de",
    spanish: "es",
    english: "en",
};

/** Maps a spoken-language name to the ISO code the ASR providers expect. */
export function toLanguageCode(language?: string): string {
    if (!language) return "en";
    return LANGUAGE_CODES[language.toLowerCase()] ?? language.toLowerCase().slice(0, 2);
}

async function transcribeWithDeepgram(
    audio: Buffer,
    apiKey: string,
): Promise<Transcript | null> {
    const params = new URLSearchParams({
        model: "nova-2",
        smart_format: "true",
        utterances: "true",
        punctuate: "true",
        filler_words: "false",
        diarize: "false",
    });

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": "audio/mpeg" },
        body: new Uint8Array(audio),
    });

    if (!res.ok) {
        console.warn(`[transcribe] Deepgram returned ${res.status}: ${await res.text()}`);
        return null;
    }

    const data = await res.json();
    const alternative = data.results?.channels?.[0]?.alternatives?.[0];
    const words: TranscriptWord[] = (alternative?.words ?? []).map((w: TranscriptWord) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
    }));

    return { words, duration: data.metadata?.duration ?? 0, text: alternative?.transcript ?? "" };
}

async function transcribeWithGroq(
    audio: Buffer,
    apiKey: string,
    languageCode: string,
): Promise<Transcript | null> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mp3" }), "audio.mp3");
    form.append("model", "whisper-large-v3");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    if (languageCode) form.append("language", languageCode);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });

    if (!res.ok) {
        console.warn(`[transcribe] Groq returned ${res.status}: ${await res.text()}`);
        return null;
    }

    const data = await res.json();
    return {
        words: (data.words ?? []).map((w: TranscriptWord) => ({
            word: w.word,
            start: w.start,
            end: w.end,
        })),
        duration: data.duration ?? 0,
        text: data.text ?? "",
    };
}

/**
 * Word-level transcription, Deepgram first then Groq Whisper.
 *
 * Extracted from the API route so the generation pipeline can call it in
 * process. The route version was only reachable over HTTP, which is why the
 * server-side orchestrator could never use it.
 *
 * Returns null rather than throwing when no provider is configured or both
 * fail — captions fall back to weighted estimation, which is degraded but
 * still usable.
 */
export async function transcribeAudio(
    audio: Buffer,
    language?: string,
): Promise<Transcript | null> {
    // The old TTS fallback emitted a ~28-byte silent MP3. Sending that to an
    // ASR provider wastes a call and returns nothing useful.
    if (audio.length < 100) {
        console.warn(`[transcribe] Refusing ${audio.length}-byte placeholder audio`);
        return null;
    }

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey) {
        try {
            const result = await transcribeWithDeepgram(audio, deepgramKey);
            if (result?.words.length) {
                console.log(`[transcribe] Deepgram: ${result.words.length} words / ${result.duration}s`);
                return result;
            }
        } catch (e) {
            console.warn("[transcribe] Deepgram threw, falling back:", e);
        }
    }

    const groqKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (groqKey) {
        try {
            const result = await transcribeWithGroq(audio, groqKey, toLanguageCode(language));
            if (result?.words.length) {
                console.log(`[transcribe] Groq Whisper: ${result.words.length} words`);
                return result;
            }
        } catch (e) {
            console.warn("[transcribe] Groq threw:", e);
        }
    }

    console.warn("[transcribe] No provider produced timings");
    return null;
}
