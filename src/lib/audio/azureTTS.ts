import { buildSSML } from './ssmlBuilder';

/**
 * Azure Cognitive Services Text-to-Speech Implementation
 * 
 * Natural sounding voices for localized content.
 */

export async function synthesizeWithAzure(
    text: string, 
    language: string = "english", 
    voiceId: string = "antoni"
): Promise<string | null> {
    const apiKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || "centralindia";

    if (!apiKey || apiKey === "your_key_here") {
        console.warn("[AzureTTS] No AZURE_SPEECH_KEY found.");
        return null;
    }

    // ✅ USE THE HUMAN SSML BUILDER
    const ssml = buildSSML(text, language, voiceId);

    console.log(`[AzureTTS] Using Region: ${region}, Key (first 5): ${apiKey.substring(0, 5)}...`);
    console.log(`[AzureTTS] Engineered SSML (first 200 chars): ${ssml.substring(0, 200)}...`);

    try {
        const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": apiKey,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "ReelApp"
            },
            body: ssml
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[AzureTTS] API Error (${response.status}): ${errBody}`);
            throw new Error(`Azure TTS API error: ${response.status} — ${errBody || 'No error body'}`);
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength < 100) {
            throw new Error("Azure returned an empty or invalid audio buffer");
        }

        const fs = require('fs');
        const path = require('path');
        const fileName = `voice-${Date.now()}-${Math.floor(Math.random() * 1000)}.mp3`;
        const publicPath = path.join(process.cwd(), 'public', 'voiceovers');
        
        if (!fs.existsSync(publicPath)) {
            fs.mkdirSync(publicPath, { recursive: true });
        }

        const filePath = path.join(publicPath, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        console.log(`[AzureTTS] Saved audio to: ${filePath}`);
        return `/voiceovers/${fileName}`;
    } catch (error) {
        console.error("[AzureTTS] Failed:", error);
        return null;
    }
}
