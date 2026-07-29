import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { audio, language } = await req.json();
        
        if (!audio) {
            return NextResponse.json({ error: "Audio data is required" }, { status: 400 });
        }

        let audioBuffer: Buffer;

        if (audio.startsWith("/voiceovers/")) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(process.cwd(), 'public', audio);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Audio file not found: ${filePath}`);
            }
            audioBuffer = fs.readFileSync(filePath);
        } else {
            // Remove data URL prefix if present
            const base64Data = audio.replace(/^data:audio\/[^;]+;base64,/, "");
            audioBuffer = Buffer.from(base64Data, "base64");
        }
        
        console.log(`[TranscriptionAPI] Processing audio: ${audioBuffer.length} bytes`);

        // 🚨 CRITICAL: Detect the "28-byte ghost" fallback
        if (audioBuffer.length < 100) {
            return NextResponse.json({ 
                error: "Audio synthesis failed. Please verify your AZURE_SPEECH_KEY or ELEVEN_LABS_API_KEY in the .env file.",
                details: `Received invalid ${audioBuffer.length}-byte placeholder audio.`
            }, { status: 400 });
        }

        // 1. Try Deepgram Nova-2 (Pro Stack Priority)
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        if (deepgramKey) {
            try {
                console.log("[TranscriptionAPI] Calling Deepgram Nova-2 for frame-perfect sync...");
                
                // Optimized for word-level timing and captions
                const queryParams = new URLSearchParams({
                    model: "nova-2",
                    smart_format: "true",
                    utterances: "true",
                    punctuate: "true",
                    filler_words: "false",
                    diarize: "false",
                });

                const dgResponse = await fetch(`https://api.deepgram.com/v1/listen?${queryParams.toString()}`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Token ${deepgramKey}`,
                        "Content-Type": "audio/mpeg"
                    },
                    body: audioBuffer
                });

                if (dgResponse.ok) {
                    const dgData = await dgResponse.json();
                    const alternative = dgData.results?.channels[0]?.alternatives[0];
                    const words = alternative?.words || [];
                    const duration = dgData.metadata?.duration || 0;
                    
                    console.log(`[TranscriptionAPI] ✅ Deepgram success: ${words.length} words detected over ${duration}s`);
                    
                    return NextResponse.json({
                        words: words.map((w: any) => ({
                            word: w.word,
                            start: w.start,
                            end: w.end,
                            confidence: w.confidence
                        })),
                        duration,
                        text: alternative?.transcript || ""
                    });
                } else {
                    const errorText = await dgResponse.text();
                    console.warn(`[TranscriptionAPI] Deepgram API returned error (${dgResponse.status}): ${errorText}`);
                }
            } catch (e) {
                console.warn("[TranscriptionAPI] Deepgram exception, falling back to secondary provider:", e);
            }
        }

        // 2. Fallback to Groq Whisper
        const formData = new FormData();
        formData.append("file", new Blob([audioBuffer], { type: "audio/mp3" }), "audio.mp3");
        formData.append("model", "whisper-large-v3");
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");
        
        if (language) {
            formData.append("language", language);
        }

        const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
        
        if (!apiKey) {
            throw new Error("Groq API key not found. Please set GROQ_API_KEY in your .env file.");
        }

        const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!groqResponse.ok) {
            const error = await groqResponse.json();
            throw new Error(error.error?.message || "Transcription failed");
        }

        const data = await groqResponse.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[TranscriptionAPI] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
