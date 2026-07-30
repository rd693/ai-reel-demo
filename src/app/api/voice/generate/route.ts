import { NextResponse } from "next/server";
import { synthesizeVoiceover } from "@/lib/audio/synthesizeVoiceover";

// Provider selection and fallback now live in lib/audio/synthesizeVoiceover so
// the pipeline and this route cannot drift apart.
//
// Note the response shape changed: `audioUrl` is a path under /voiceovers, not
// a base64 data URL. Storing the base64 was what filled the old localStorage
// quota and bloated every reel row.
export async function POST(req: Request) {
    try {
        const { text, voiceId, language } = await req.json();

        if (!text?.trim()) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        const voice = await synthesizeVoiceover(text, { voiceId, language });

        if (!voice) {
            return NextResponse.json(
                { error: "Synthesis failed. Check ELEVEN_LABS_API_KEY." },
                { status: 502 },
            );
        }

        return NextResponse.json({ audioUrl: voice.path, words: voice.words });
    } catch (error) {
        console.error("[api/voice/generate] failed:", error);
        return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
    }
}
