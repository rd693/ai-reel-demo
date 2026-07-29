/**
 * AI Voice Engine (ElevenLabs Integration)
 * This engine handles Text-to-Speech generation.
 * In a production environment, this would call the ElevenLabs /v1/text-to-speech endpoint.
 */

export interface VoiceGenerationParams {
    text: string;
    voiceId: string;
    language: string;
}

export const SILENT_AUDIO = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIzLjEwMgAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIwADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//OEAAAAAAAAAAAAAAAAAAAAAAAADExU0UAAAAGAAAAbGF2Zf//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const generateVoiceover = async (options: VoiceGenerationParams): Promise<string> => {
    console.log(`[VoiceEngine] Generating voice for: "${options.text.substring(0, 50)}..."`);
    console.log(`[VoiceEngine] Using Voice: ${options.voiceId}, Language: ${options.language}`);

    try {
        const response = await fetch("/api/voice/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                text: options.text, 
                voiceId: options.voiceId,
                language: options.language
            })
        });

        if (!response.ok) throw new Error("Voice API failed");
        
        const data = await response.json();
        return data.audioUrl || SILENT_AUDIO;
    } catch (e) {
        console.error("Voice generation fallback triggered:", e);
        return SILENT_AUDIO; 
    }
};
