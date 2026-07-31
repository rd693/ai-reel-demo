import { NextResponse } from "next/server";
import { listAccountVoices } from "@/lib/audio/elevenlabs";

// The voices actually on this ElevenLabs account. The UI previously offered
// four hardcoded aliases, so none of the account's real voices — including the
// native Hindi ones — could be seen or chosen.
export async function GET() {
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
        return NextResponse.json({ voices: [], error: "ELEVEN_LABS_API_KEY is not set" });
    }

    try {
        const voices = await listAccountVoices(apiKey);
        return NextResponse.json({
            voices: voices.map((v) => ({
                id: v.id,
                name: v.name,
                language: v.language ?? "en",
                gender: v.gender,
                useCase: v.useCase,
                descriptive: v.descriptive,
                description: v.description,
                previewUrl: v.previewUrl,
                // "professional" voices come from the Voice Library and need a
                // paid plan; surfacing it lets the picker warn before use.
                category: v.category,
            })),
        });
    } catch (error) {
        console.error("[api/voices] failed:", error);
        return NextResponse.json({ voices: [], error: "Failed to load voices" }, { status: 500 });
    }
}
