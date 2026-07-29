import { NextResponse } from "next/server";
import { generateFacelessReelContent } from "@/agents/seriesAgent";
import { NicheType, ArtStyle } from "@/types/series";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            niche,
            artStyle,
            name,
            durationInSeconds = 60,
            language = "english",
            voiceId = "storyteller",
            customScript,
            subject,        // ✅ add
            seriesContext,   // ✅ add 
            usePremium,
            usePremiumImageStack
        } = body;

        if (!niche || !artStyle) {
            return NextResponse.json({ error: "Missing niche or artStyle" }, { status: 400 });
        }

        // 1. Generate full reel content with all parameters
        const reelData = await generateFacelessReelContent(
            niche as NicheType,
            artStyle as string,
            Number(durationInSeconds),
            language,
            voiceId,
            customScript,
            subject,        // ✅ add
            seriesContext,   // ✅ add
            undefined,
            undefined,
            usePremium || usePremiumImageStack
        );

        // 2. Here we would call ElevenLabs for Voiceover
        // 3. Here we would call Flux/Stable Diffusion for Images

        // Return the structured data
        return NextResponse.json({
            ...reelData,
            name: name || reelData.businessName
        });
    } catch (error) {
        console.error("Generation error:", error);
        return NextResponse.json({ error: "Failed to generate content" }, { status: 500 });
    }
}
