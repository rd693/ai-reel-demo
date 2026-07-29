/**
 * Gets actual MP3 duration from base64 audio string
 * Uses file-size estimation — accurate within ~2% for Azure 24khz/48kbps
 */
export function getAudioDurationMs(audioBase64: string): number {
    try {
        const base64Data = audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');
        const bytes = Buffer.from(base64Data, 'base64').length;
        // Azure 24khz 48kbps mono = 6000 bytes/sec
        const durationSeconds = bytes / 6000;
        return Math.round(durationSeconds * 1000);
    } catch (e) {
        console.warn("[AudioDuration] Probe failed:", e);
        return 0;
    }
}

/**
 * Redistributes scene durations proportionally 
 * based on word count to match actual audio duration.
 * This prevents scenes from cutting early or late.
 */
export function syncScenesToAudio(
    scenes: any[],
    actualAudioDurationMs: number
): any[] {
    const wordCounts = scenes.map(s =>
        ((s.narrationText || s.headline || '') as string)
            .trim().split(/\s+/).filter(Boolean).length
    );
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    
    if (totalWords === 0) {
        const even = actualAudioDurationMs / scenes.length / 1000;
        return scenes.map(s => ({ ...s, durationInSeconds: even }));
    }

    return scenes.map((scene, i) => ({
        ...scene,
        durationInSeconds: Math.round(
            (wordCounts[i] / totalWords) * actualAudioDurationMs
        ) / 1000
    }));
}
