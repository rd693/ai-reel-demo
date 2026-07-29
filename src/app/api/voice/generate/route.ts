import { NextResponse } from "next/server";
import { synthesizeSpeech, synthesizeSpeechWithTimestamps } from "@/lib/audio/elevenlabs";
import { synthesizeWithAzure } from "@/lib/audio/azureTTS";

export async function POST(req: Request) {
    try {
        const { text, voiceId, language, usePremium } = await req.json();
        
        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        // 1. If premium is requested, use ElevenLabs with Timestamps directly (Pro Stack)
        if (usePremium) {
            const premiumVoiceData = await synthesizeSpeechWithTimestamps(text, voiceId, language);
            if (premiumVoiceData) {
                console.log("[VoiceAPI] Successfully synthesized premium speech with timestamps");
                return NextResponse.json(premiumVoiceData);
            }
            console.warn("[VoiceAPI] Premium synthesis failed, falling back to Free stack");
        }

        // 2. Otherwise try Azure Cognitive Services first (Free Stack)
        const azureAudio = await synthesizeWithAzure(text, language, voiceId);
        if (azureAudio) {
            console.log("[VoiceAPI] Successfully used Azure TTS");
            return NextResponse.json({ audioUrl: azureAudio });
        }

        // 3. Fallback to ElevenLabs / Basic Stack
        const audioUrl = await synthesizeSpeech(text, voiceId, language);
        
        return NextResponse.json({ audioUrl });
    } catch (error) {
        console.error("API Voice synthesis failed:", error);
        return NextResponse.json({ error: "Synthesis failed" }, { status: 500 });
    }
}
