import { FacelessReel, NicheType } from "../types/series";
import { v4 as uuidv4 } from "uuid";
import { getAudioDurationMs, syncScenesToAudio } from "@/lib/audio/audioDuration";

/**
 * Orchestrates the full AI Reel generation pipeline.
 * Forces frame-perfect sync by driving all timing from the actual audio duration.
 */
export const generateFacelessReelContent = async (
    niche: NicheType,
    artStyle: string = "cinematic_3d",
    durationInSeconds: number = 60,
    language: string = "english",
    voiceId: string = "storyteller",
    customScript?: string,
    subject?: string,
    seriesContext?: string,
    visualStylePrompt?: string,
    visualStyleOverride?: string,
    usePremiumImageStack?: boolean
): Promise<Partial<FacelessReel>> => {
    console.log(`[SeriesAgent] Starting Unified Sync Generation for ${niche} (${language}) | Premium: ${usePremiumImageStack}...`);

    try {
        // 1. Generate Script via LLM
        const scriptResponse = await fetch("/api/series/generate-script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                niche, language, durationInSeconds, customScript,
                artStyle,
                subject: subject || niche,
                seriesContext: seriesContext,
                visualStylePrompt: visualStylePrompt,
                visualStyleOverride: visualStyleOverride,
                usePremium: usePremiumImageStack
            })
        });

        if (!scriptResponse.ok) throw new Error("Script API failed");
        const scriptData = await scriptResponse.json();

        // 🚨 CRITICAL: Force original script if provided
        if (customScript) {
            scriptData.script = customScript;
        }

        if (!scriptData.script) throw new Error("Failed to generate script content");

        // 2. Generate Master Voiceover
        const voiceResponse = await fetch("/api/voice/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: scriptData.script,
                language: language,
                voiceId: voiceId,
                usePremium: usePremiumImageStack
            })
        });
        if (!voiceResponse.ok) throw new Error("Voice API failed");
        const voiceData = await voiceResponse.json();
        const masterVoiceoverUrl = voiceData.audioUrl || "";
        const premiumWords = voiceData.words || [];

        let actualDuration = durationInSeconds;
        if (masterVoiceoverUrl?.startsWith('data:')) {
            actualDuration = getAudioDurationMs(masterVoiceoverUrl) / 1000;
        }

        // 4. TRANSCRIPTION
        let captionWords: any[] = [];
        let whisperData: any = null;

        if (premiumWords && premiumWords.length > 0) {
            console.log(`[SeriesAgent] Using premium word-level timestamps directly from ElevenLabs. Bypassing Whisper.`);
            captionWords = premiumWords;
            actualDuration = premiumWords[premiumWords.length - 1].end;
        } else {
            if (usePremiumImageStack) {
                console.log(`[SeriesAgent] Bypassing Whisper in Pro Stack (ElevenLabs timestamps empty/fallback). Using high-fidelity Storyteller Caption Engine.`);
            } else {
                try {
                    const transcribeResponse = await fetch("/api/audio/transcribe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            audio: masterVoiceoverUrl,
                            language: (() => {
                                const map: Record<string, string> = { 'hindi': 'hi', 'french': 'fr', 'german': 'de', 'spanish': 'es' };
                                return map[language.toLowerCase()] || 'en';
                            })()
                        })
                    });

                    if (transcribeResponse.ok) {
                        whisperData = await transcribeResponse.json();

                        if (whisperData.duration) {
                            const whisperDuration = whisperData.duration;
                            if (!(actualDuration > 5 && whisperDuration < actualDuration / 2)) {
                                actualDuration = whisperDuration;
                            }
                        }

                        if (whisperData.words && whisperData.words.length > 0) {
                            captionWords = whisperData.words.map((w: any) => ({
                                word: w.word,
                                start: w.start,
                                end: w.end
                            }));
                        }
                    }
                } catch (err) {
                    console.warn("[SeriesAgent] Transcription failed, will use fallback scaling.");
                }
            }
        }

        // ✅ Add trailing cinematic pad of 1.5 seconds unconditionally so the voiceover tail is never cut off
        actualDuration = actualDuration + 1.5;

        // 5. UNIFIED TIMING & SYNC
        let timedScenes: any[] = [];
        let currentElapsedMs = 0;
        const totalDurationMs = Math.round(actualDuration * 1000);

        const hasWords = captionWords && captionWords.length > 0;

        if (hasWords) {
            console.log("[SeriesAgent] Timing scenes via word timestamps (Sequential Mode)...");
            let wordIdx = 0;
            const allWords = captionWords;

            timedScenes = scriptData.scenes.map((scene: any, i: number) => {
                const isLast = i === scriptData.scenes.length - 1;
                const text = (scene.narrationText || scene.headline || "").trim();
                const wordCount = text.split(/\s+/).filter(Boolean).length;

                const startMs = currentElapsedMs; // Always start where the last one ended
                let endMs = startMs + 3000; // default fallback duration (3 seconds)

                if (wordCount > 0 && wordIdx < allWords.length) {
                    const endIdx = Math.min(allWords.length - 1, wordIdx + wordCount - 1);
                    endMs = Math.round(allWords[endIdx].end * 1000);
                    wordIdx = endIdx + 1;
                }

                // If this is the last scene, force it to hit the absolute end
                if (isLast) {
                    endMs = totalDurationMs;
                }

                // Protect against overshoot of non-last scenes
                const remainingScenesCount = scriptData.scenes.length - 1 - i;
                const maxAllowedEndMs = totalDurationMs - (remainingScenesCount * 1000);
                if (!isLast && endMs > maxAllowedEndMs) {
                    endMs = maxAllowedEndMs;
                }

                // Guarantee a positive duration of at least 1000ms per scene
                if (endMs <= startMs) {
                    endMs = startMs + 1000;
                }

                currentElapsedMs = endMs;
                return { ...scene, startMs, endMs };
            });
        } else {
            console.log("[SeriesAgent] Timing scenes via proportional distribution...");
            const synced = syncScenesToAudio(scriptData.scenes, totalDurationMs);
            timedScenes = synced.map((scene: any, i: number) => {
                const isLast = i === synced.length - 1;
                const startMs = currentElapsedMs;
                const durationMs = (scene.durationInSeconds || 2) * 1000;
                const endMs = isLast ? totalDurationMs : startMs + durationMs;
                currentElapsedMs = endMs;
                return { ...scene, startMs, endMs };
            });
        }

        const finalTimedScenes = timedScenes;

        // 🚨 Fallback Captions (Smart Storyteller Distribution)
        if (!captionWords || captionWords.length === 0) {
            const totalAudioMs = actualDuration * 1000;

            // Extract words and identify punctuation for weighting
            const rawWords = scriptData.script.split(/\s+/).filter(Boolean);

            let estimatedTotalWeight = 0;
            const words = rawWords.map((w: string) => {
                const isSentenceEnd = /[।.!?]/.test(w);
                const isComma = /[,،]/.test(w);
                const weight = 1.0 + (isSentenceEnd ? 0.45 : (isComma ? 0.15 : 0));
                estimatedTotalWeight += weight;
                return { word: w, weight, isSentenceEnd, isComma };
            });

            let currentMs = 0;
            captionWords = words.map((w: any) => {
                const durationMs = (w.weight / estimatedTotalWeight) * totalAudioMs;
                const start = currentMs / 1000;
                const end = (currentMs + durationMs) / 1000;
                currentMs += durationMs;

                // For the UI, we want to strip the trailing punctuation from the active word display
                // but keep the timing. 
                return {
                    word: w.word,
                    start,
                    end
                };
            });
        }

        // 6. GENERATE VISUALS (Parallel with slight delay to avoid rate limits)
        const reelSeed = Math.floor(Math.random() * 2147483647);
        
        const finalScenes = await Promise.all(finalTimedScenes.map(async (scene: any, index: number) => {
            await new Promise(r => setTimeout(r, index * 1000));
            try {
                const finalPrompt = scene.visualPrompt || scene.narrationText || niche;

                console.log(`[SeriesAgent] Generating image ${index + 1}/${finalTimedScenes.length} (Seed: ${reelSeed}) for: ${finalPrompt.substring(0, 30)}...`);

                const imgResponse = await fetch("/api/images/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: finalPrompt,
                        artStyle,
                        seed: reelSeed,
                        usePremium: usePremiumImageStack
                    })
                });
                const imgData = await imgResponse.json();
                
                // 🚨 CRITICAL: Ensure we have a valid URL. If not, fallback to Picsum.
                const url = imgData.imageUrl || imgData.url;
                if (!url) throw new Error("No image URL returned");

                return {
                    ...scene,
                    id: uuidv4(),
                    backgroundUrl: url,
                };
            } catch (err) {
                console.warn(`[SeriesAgent] Image generation failed for scene ${index}, using fallback:`, err);
                return {
                    ...scene,
                    id: uuidv4(),
                    backgroundUrl: `https://picsum.photos/seed/${Math.floor(Math.random() * 1000)}/576/1024`,
                };
            }
        }));

        console.log(`[SeriesAgent] Reel generation complete. Scenes: ${finalScenes.length}, Duration: ${actualDuration.toFixed(2)}s`);

        // Default music if not provided (e.g. "cinematic_tension")
        const defaultMusic = {
            enabled: true,
            trackId: "/music/cinematic_tension.mp3", // Assuming this exists or is a valid default
            volume: 0.5
        };

        return {
            id: uuidv4(),
            businessName: scriptData.title || niche,
            script: scriptData.script,
            scenes: finalScenes,
            voiceoverUrl: masterVoiceoverUrl,
            actualDuration: actualDuration * 1000,
            captionWords: captionWords,
            status: "draft",
            createdAt: new Date(),
            // Ensure settings flow through
            artStyle: artStyle as any,
            language: language,
            seed: reelSeed,
            usePremiumImageStack: usePremiumImageStack,
            musicSettings: defaultMusic // ✅ ADDED: Background music now persists
        };

    } catch (e) {
        console.error("[SeriesAgent] Pipeline failed:", e);
        throw e;
    }
};
