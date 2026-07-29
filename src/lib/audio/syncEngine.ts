import { getAudioDurationMs } from './audioDuration';

/**
 * DEPRECATED: Use getAudioDurationMs and syncScenesToAudio from audioDuration.ts
 */

export const parseMp3Duration = getAudioDurationMs;

export const redistributeSceneDurations = (scenes: any[], actualDuration: number) => {
    // Legacy wrapper
    const totalWords = scenes.reduce((acc, s) => acc + (s.narrationText || "").split(" ").length, 0);
    return scenes.map(s => ({
        ...s,
        durationInSeconds: ((s.narrationText || "").split(" ").length / totalWords) * actualDuration
    }));
};

export const generateCaptionTimestamps = (scenes: any[]) => {
    // Legacy wrapper
    return [];
};
