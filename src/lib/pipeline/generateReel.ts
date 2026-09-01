import fs from "fs/promises";
import path from "path";

import { prisma } from "../db/client";
import { reelRepo } from "../db/reelRepo";
import { generateScriptWithAI } from "../ai/llm";
import { generateImage } from "../visuals/imageGen";
import { generateClip, clipProvidersAvailable, stockFootageSuits } from "../visuals/clipGen";
import { synthesizeVoiceover } from "../audio/synthesizeVoiceover";
import { speakable, speakableDiff } from "../audio/speakable";
import { transcribeAudio } from "../audio/transcribe";
import { persistMedia } from "../media/persistDataUrl";
import { assignSceneTimings, estimateCaptionWords, resolveDurationMs } from "./timing";
import { planShots, summarizeShotPlan } from "./shotPlan";
import { assignShotMedia, resolveFormat } from "./format";

// Reported stages, in order. These drive the UI only.
export const STAGES = ["pending", "scripted", "voicing", "visualizing", "completed"] as const;
export type Stage = (typeof STAGES)[number];

// What still needs doing is derived from what is actually saved on the row, not
// from generationStatus. A failed run sets status to "failed", which would
// otherwise erase the fact that the script and voiceover already exist and make
// every retry re-bill the LLM and TTS. Artifacts are the source of truth; the
// status is a label.
type Progress = { hasScript: boolean; hasVoiceover: boolean; missingImages: number };

function inspect(reel: {
    script: string;
    voiceoverPath: string | null;
    actualDurationMs: number | null;
    scenes: { backgroundPath: string | null }[];
}): Progress {
    return {
        hasScript: !!reel.script?.trim() && reel.scenes.length > 0,
        hasVoiceover: !!reel.voiceoverPath && !!reel.actualDurationMs,
        missingImages: reel.scenes.filter((s) => !s.backgroundPath).length,
    };
}

export type GenerateOptions = {
    niche?: string;
    subject?: string;
    customScript?: string;
    artStyle?: string;
    visualStyleOverride?: string;
};

/**
 * Runs a reel from an empty row to a finished set of scenes, saving after every
 * stage. Safe to call again on a failed or half-finished reel.
 *
 * Throws only if the reel cannot be loaded; stage failures are recorded on the
 * row as `failed` with a message, because the caller is a fire-and-forget
 * background task with nobody to catch them.
 */
/**
 * Reels being generated right now, in this process.
 *
 * generationStatus cannot answer "is something running": it records the last
 * stage that finished, so a reel left at "scripted" by a crash is
 * indistinguishable from one mid-flight. Timestamps are no better — any edit
 * bumps updatedAt. This is the only signal that is actually about the run.
 */
const runningReels = new Set<string>();

export function isGenerating(reelId: string): boolean {
    return runningReels.has(reelId);
}

export async function generateReel(reelId: string, options: GenerateOptions = {}): Promise<void> {
    if (runningReels.has(reelId)) {
        console.warn(`[pipeline ${reelId}] already running; ignoring duplicate start`);
        return;
    }
    runningReels.add(reelId);
    try {
        await runPipeline(reelId, options);
    } finally {
        runningReels.delete(reelId);
    }
}

async function runPipeline(reelId: string, options: GenerateOptions): Promise<void> {
    const row = await prisma.reel.findUnique({
        where: { id: reelId },
        include: { series: true, scenes: { orderBy: { index: "asc" } } },
    });
    if (!row) throw new Error(`Reel ${reelId} not found`);

    const series = row.series;
    const language = row.language ?? series.language;
    const artStyle = options.artStyle ?? row.artStyle ?? series.artStyle;
    const usePremium = row.usePremiumImageStack || series.usePremiumImageStack;
    const format = resolveFormat(row.format, series.format);
    const targetDuration = series.targetDuration || 60;

    const progress = inspect(row);
    console.log(
        `[pipeline ${reelId}] resuming — script:${progress.hasScript} voice:${progress.hasVoiceover} images missing:${progress.missingImages}`,
    );

    try {
        // ── Stage 1: script ───────────────────────────────────────────────
        if (!progress.hasScript) {
            console.log(`[pipeline ${reelId}] script`);

            const script = await generateScriptWithAI(
                options.niche ?? series.niche,
                language,
                targetDuration,
                options.customScript,
                artStyle,
                options.subject ?? series.niche,
                series.seriesContext ?? undefined,
                series.visualStylePrompt ?? undefined,
                options.visualStyleOverride ?? row.visualStyleOverride ?? undefined,
                usePremium,
            );

            // A caller-supplied script is authoritative; the model may only
            // shape it into scenes, never rewrite the words.
            const finalScript = options.customScript || script.script;
            if (!finalScript) throw new Error("Script generation returned no text");

            await reelRepo.update(reelId, {
                businessName: script.title || series.niche,
                script: finalScript,
                artStyle: artStyle as never,
                seed: row.seed ?? Math.floor(Math.random() * 2147483647),
                scenes: script.scenes.map((s, i) => ({
                    id: `${reelId}-${i}`,
                    type: "hook",
                    headline: s.headline,
                    narrationText: s.narrationText,
                    visualPrompt: s.visualPrompt,
                    durationInSeconds: s.durationInSeconds || 3,
                })),
            });
            await reelRepo.setStatus(reelId, "scripted");
        }

        // ── Stage 2: voiceover ────────────────────────────────────────────
        let current = await reelRepo.getById(reelId);
        if (!current) throw new Error("Reel disappeared mid-generation");

        if (!progress.hasVoiceover) {
            console.log(`[pipeline ${reelId}] voiceover`);

            // Spoken text only — the stored script keeps its punctuation, and
            // captions follow the synthesiser's word timings either way.
            const spoken = speakable(current.script);
            const diff = speakableDiff(current.script);
            if (diff.changed) {
                console.log(`[pipeline ${reelId}] softened ${diff.pauses} hard pause(s) for speech`);
            }

            const voice = await synthesizeVoiceover(spoken, {
                voiceId: series.voiceId,
                language,
                // Niche and series blurb are what decide whether this wants a
                // narrator, an educator or a social-media read.
                context: [series.niche, series.seriesContext, current.businessName]
                    .filter(Boolean)
                    .join(" "),
            });
            if (!voice) {
                throw new Error("Voice synthesis failed. Check ELEVEN_LABS_API_KEY.");
            }

            await reelRepo.update(reelId, { voiceoverUrl: voice.path });

            // ── Timings, derived from the audio that was just produced ────
            let words = voice.words?.length ? voice.words : undefined;
            let transcriptDuration: number | undefined;

            if (!words) {
                const audio = await fs
                    .readFile(path.join(process.cwd(), "public", voice.path))
                    .catch(() => null);
                if (audio) {
                    const transcript = await transcribeAudio(audio, language);
                    if (transcript?.words.length) {
                        words = transcript.words;
                        transcriptDuration = transcript.duration;
                    }
                }
            }

            const durationMs = resolveDurationMs(words, transcriptDuration, targetDuration);
            const captionWords = words ?? estimateCaptionWords(current.script, durationMs);
            const timed = assignSceneTimings(current.scenes, captionWords, durationMs);

            // Beats become shots here, once the real audio length is known.
            // Doing it earlier would cut against an estimate, and the estimate
            // is routinely 30% out.
            const shots = assignShotMedia(planShots(timed, captionWords), format);
            const motionCount = shots.filter((s) => s.backgroundType === "video").length;
            console.log(
                `[pipeline ${reelId}] shot plan — ${timed.length} beats → ${summarizeShotPlan(shots)}; ` +
                    `format ${format}, ${motionCount} motion shot(s)`,
            );

            await reelRepo.update(reelId, {
                actualDuration: durationMs,
                captionWords,
                scenes: shots,
            });
            await reelRepo.setStatus(reelId, "voicing");
        }

        // ── Stage 3: visuals ──────────────────────────────────────────────
        current = await reelRepo.getById(reelId);
        if (!current) throw new Error("Reel disappeared mid-generation");

        if (current.scenes.some((s) => !s.backgroundUrl)) {
            await reelRepo.setStatus(reelId, "visualizing");

            const seed = current.seed ?? Math.floor(Math.random() * 2147483647);
            const scenes = [...current.scenes];

            // Checked once rather than per shot: with no provider configured a
            // motion reel would otherwise make the same futile call 30 times.
            const canAnimate = clipProvidersAvailable(usePremium);
            const motionWanted = scenes.filter((s) => s.backgroundType === "video").length;
            if (motionWanted > 0 && !canAnimate) {
                console.warn(
                    `[pipeline ${reelId}] ${motionWanted} shots want motion but no clip provider is configured ` +
                        `(needs FAL_KEY with the premium stack, or PEXELS_API_KEY/PIXABAY_API_KEY). Rendering stills.`,
                );
            } else if (motionWanted > 0 && !usePremium && !stockFootageSuits(artStyle)) {
                console.warn(
                    `[pipeline ${reelId}] stock footage does not suit the "${artStyle}" style, and the premium ` +
                        `stack is off. Rendering stills.`,
                );
            }

            for (let i = 0; i < scenes.length; i++) {
                // Already-generated scenes are skipped, so a retry only pays for
                // the images that are actually missing.
                if (scenes[i].backgroundUrl) continue;

                const prompt = scenes[i].visualPrompt || scenes[i].narrationText || series.niche;
                console.log(
                    `[pipeline ${reelId}] image ${i + 1}/${scenes.length}` +
                        (scenes[i].backgroundType === "video" ? " (motion shot — still is the source frame)" : ""),
                );

                try {
                    const url = await generateImage({
                        prompt,
                        style: artStyle,
                        // Per shot, not per reel. One seed for the whole reel
                        // was meant to hold the look together, but a fixed seed
                        // with a near-identical prompt reproduces the same
                        // composition — which is exactly what splitting a beat
                        // into shots produces. Style consistency comes from the
                        // art-style prompt; the seed only pinned the framing.
                        seed: seed + i,
                        usePremium,
                    });
                    // Copy onto local disk so the reel does not depend on a
                    // third-party host still serving the file at render time.
                    let background = await persistMedia(url, "uploads");
                    let backgroundType = scenes[i].backgroundType;

                    // Motion is generated here, while the *generator's* URL is
                    // still in hand. Image-to-video has to fetch the source
                    // frame itself, and by the next line the only copy is a path
                    // under public/ that resolves to nothing from outside this
                    // machine.
                    if (backgroundType === "video" && canAnimate) {
                        const remoteStill = typeof url === "string" && url.startsWith("http") ? url : undefined;
                        const clip = await generateClip({
                            prompt: scenes[i].motionPrompt || prompt,
                            imageUrl: remoteStill,
                            visualPrompt: scenes[i].visualPrompt,
                            durationSeconds: scenes[i].durationInSeconds ?? 3,
                            artStyle,
                            usePremium,
                        });

                        if (clip) {
                            const stored = await persistMedia(clip.url, "uploads");
                            if (stored) {
                                background = stored;
                                console.log(`[pipeline ${reelId}] shot ${i + 1} animated via ${clip.source}`);
                            }
                        } else {
                            // Say so in the data rather than leaving a shot
                            // labelled as footage that is really a still.
                            backgroundType = "image";
                            console.log(`[pipeline ${reelId}] shot ${i + 1} stays a still — no clip produced`);
                        }
                    }

                    scenes[i] = { ...scenes[i], backgroundUrl: background, backgroundType };
                } catch (e) {
                    console.warn(`[pipeline ${reelId}] image ${i + 1} failed:`, e);
                    continue;
                }

                // Persist per image: an interruption keeps everything so far.
                await reelRepo.update(reelId, { scenes });
            }
        }

        // Final status reflects the artifacts, not how far the loop got. A reel
        // whose image provider failed on every scene is not "completed", and
        // saying so is what lets a retry pick up the missing ones.
        const final = await reelRepo.getById(reelId);
        const stillMissing = final?.scenes.filter((s) => !s.backgroundUrl).length ?? 0;

        if (stillMissing > 0) {
            const message = `${stillMissing} of ${final?.scenes.length} scenes have no image. Retry to generate just those.`;
            console.warn(`[pipeline ${reelId}] ${message}`);
            await reelRepo.setStatus(reelId, "failed", message);
            return;
        }

        await reelRepo.setStatus(reelId, "completed");
        console.log(`[pipeline ${reelId}] done`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[pipeline ${reelId}] failed:`, message);
        await reelRepo.setStatus(reelId, "failed", message).catch(() => {});
    }
}
