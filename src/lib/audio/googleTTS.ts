/**
 * Google Cloud Text-to-Speech Implementation
 */

export async function synthesizeWithGoogle(text: string, language: string = "english"): Promise<string | null> {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey || apiKey === "your_key_here") {
        console.warn("[GoogleTTS] No GOOGLE_CLOUD_API_KEY found.");
        return null;
    }

    // Map internal language names to Google Cloud TTS codes
    const langConfigMap: Record<string, { code: string; name: string }> = {
        'english': { code: 'en-US', name: 'en-US-Neural2-F' },
        'en': { code: 'en-US', name: 'en-US-Neural2-F' },
        'hindi': { code: 'hi-IN', name: 'hi-IN-Neural2-A' },
        'hi': { code: 'hi-IN', name: 'hi-IN-Neural2-A' },
        'spanish': { code: 'es-ES', name: 'es-ES-Neural2-A' },
        'es': { code: 'es-ES', name: 'es-ES-Neural2-A' },
        'japanese': { code: 'ja-JP', name: 'ja-JP-Neural2-C' },
        'ja': { code: 'ja-JP', name: 'ja-JP-Neural2-C' },
    };

    const langKey = language.toLowerCase();
    const config = langConfigMap[langKey] || langConfigMap.english;
    
    console.log(`[GoogleTTS] Requesting voice for: ${langKey} (Code: ${config.code}, Model: ${config.name})`);

    try {
        const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input: { text },
                voice: {
                    languageCode: config.code,
                    name: config.name,
                    ssmlGender: "NEUTRAL"
                },
                audioConfig: {
                    audioEncoding: "MP3",
                    pitch: 0,
                    speakingRate: 1.05 // Slightly faster for reels
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            if (response.status === 403 && err.includes("PERMISSION_DENIED")) {
                console.error("[GoogleTTS] CRITICAL: API key is blocked for Text-to-Speech. Please go to https://console.cloud.google.com/apis/library/texttospeech.googleapis.com and ENABLE the API for your project.");
            }
            throw new Error(`Google TTS API error: ${err}`);
        }

        const data = await response.json();
        if (data.audioContent) {
            return `data:audio/mpeg;base64,${data.audioContent}`;
        }
    } catch (error) {
        console.error("[GoogleTTS] Failed:", error);
    }

    return null;
}
