import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { transcribeAudio } from "@/lib/audio/transcribe";

// Thin wrapper over lib/audio/transcribe. The provider logic used to live here,
// which meant the generation pipeline could only reach it over HTTP.
export async function POST(req: Request) {
    try {
        const { audio, language } = await req.json();
        if (!audio) {
            return NextResponse.json({ error: "Audio data is required" }, { status: 400 });
        }

        let buffer: Buffer;
        if (audio.startsWith("/voiceovers/") || audio.startsWith("/uploads/")) {
            // Only public media paths are readable, and basename() keeps a
            // crafted value from walking out of the directory.
            const dir = audio.startsWith("/voiceovers/") ? "voiceovers" : "uploads";
            const file = path.join(process.cwd(), "public", dir, path.basename(audio));
            buffer = await fs.readFile(file);
        } else {
            buffer = Buffer.from(audio.replace(/^data:audio\/[^;]+;base64,/, ""), "base64");
        }

        if (buffer.length < 100) {
            return NextResponse.json(
                {
                    error: "Audio synthesis failed. Verify ELEVEN_LABS_API_KEY.",
                    details: `Received ${buffer.length}-byte placeholder audio.`,
                },
                { status: 400 },
            );
        }

        const transcript = await transcribeAudio(buffer, language);
        if (!transcript) {
            return NextResponse.json(
                { error: "No transcription provider available, or all providers failed" },
                { status: 502 },
            );
        }

        return NextResponse.json(transcript);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[api/audio/transcribe] failed:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
