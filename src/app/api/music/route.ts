import { NextResponse } from "next/server";
import { generateMusic, listMusicTracks } from "@/lib/audio/generateMusic";

/** Tracks currently in public/music — generated or licensed files you added. */
export async function GET() {
    return NextResponse.json({ tracks: await listMusicTracks() });
}

/** Generates an original track and adds it to the library. */
export async function POST(req: Request) {
    try {
        const { prompt, durationSeconds } = await req.json();
        if (!prompt?.trim()) {
            return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
        }

        const track = await generateMusic(prompt.trim(), durationSeconds ?? 22);
        return NextResponse.json(track, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Music generation failed";
        console.error("[api/music] failed:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
