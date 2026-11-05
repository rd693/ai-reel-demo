import { callJsonLlm } from "../ai/jsonLlm";

/**
 * One picture per shot, written from what is being said during that shot.
 *
 * The script model writes a prompt per narration beat, and the shot planner
 * splits a beat into as many as four shots. Those shots used to share the beat's
 * prompt with only a framing phrase changed, so a 23-shot reel held about seven
 * pictures, each drawn up to four times. Worse, every prompt opened with the
 * reel's subject, so a shot of an empty courtyard still asked for the hero.
 *
 * Runs after the voiceover because that is when shots exist. One call covers the
 * whole reel, so the model can see what it has already shown and vary it.
 */

export type ShotBrief = {
    narrationText?: string;
    shotType?: string;
    visualPrompt?: string;
};

export type ShotPromptInput = {
    title: string;
    niche: string;
    script: string;
    shots: ShotBrief[];
    /** Series and per-reel look, added to every prompt. The art style itself is added by imageGen. */
    styleSuffix?: string;
};

const MAX_PROMPT_CHARS = 350;

const SYSTEM_PROMPT = `You are the storyboard artist for a short narrated video. You are given the script and the list of shots, each with the words spoken during it. Write one image prompt per shot, for an image model that reads English.

SHOW WHAT IS BEING SAID
Each picture illustrates that shot's words, not the video's topic in general. If the narrator mentions a letter, show the letter. If they mention a river crossing, show the river. Dates and numbers become something visible: a crowd, a map on a table, a season.

NO TWO SHOTS ALIKE
- Never repeat the same combination of subject, place and action. Treat the shots as a story moving forward.
- The main figure appears in at most four shots out of ten. The rest show other people, objects, places, weather, animals, documents, tools, aftermath.
- Vary setting, time of day and scale across the reel. Avoid the same stormy sky and dusty field in shot after shot.
- Use the suggested framing unless the moment clearly needs another.

KEEP PEOPLE RECOGNISABLE
Whenever a named person appears, describe them with the same words each time: age, build, clothing, headgear. Keep the period, region and costume historically grounded. Image models do not know most names, so the description carries the identity.

PHYSICAL LOGIC
Image models get direction and anatomy wrong unless told exactly. Write every spatial relationship out:
- A rider sits astride, facing the same way the animal is walking. Say both: "seen from the side, elephant walking to the left, rider seated on its back also facing left". Show animals with riders from the side or three-quarter view, never head-on or from behind.
- Say which way people are facing, and what they are looking at.
- Show one clear action per picture, and no more than two or three figures in the foreground. Keep crowds distant and simple.
- Avoid hands gripping small objects, interlocked figures, and anything requiring lettering or readable text.

FORMAT
30 to 55 words per prompt, in plain descriptive sentences. Lead with the subject and action. State no art style, it is added separately. State only what should be in the picture, never what should be absent.

Return ONLY valid JSON.`;

function buildUserPrompt(input: ShotPromptInput): string {
    const shots = input.shots
        .map((shot, i) => `${i}. [${shot.shotType ?? "medium"}] ${shot.narrationText ?? ""}`)
        .join("\n");

    return `VIDEO
Title: ${input.title}
Niche: ${input.niche}

FULL SCRIPT
${input.script}

SHOTS (index, suggested framing, words spoken)
${shots}

Return one prompt for each of the ${input.shots.length} shots:
{ "shots": [ { "index": 0, "prompt": "..." } ] }`;
}

/** Keeps only what an image model can use, or null if nothing usable is left. */
export function cleanShotPrompt(raw: unknown, styleSuffix?: string): string | null {
    if (typeof raw !== "string") return null;
    const text = raw
        // Devanagari reaches the generator as noise, not as an instruction.
        .replace(/[ऀ-ॿ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length < 20) return null;

    const capped = text.length > MAX_PROMPT_CHARS ? text.slice(0, text.lastIndexOf(" ", MAX_PROMPT_CHARS)) : text;
    return styleSuffix ? `${capped}, ${styleSuffix}` : capped;
}

/**
 * Applies a model's answer to the shot list. A shot the model skipped, garbled
 * or duplicated keeps the prompt it had, so one bad row costs one weaker picture
 * rather than the reel.
 */
export function applyShotPrompts<T extends ShotBrief>(shots: T[], raw: unknown, styleSuffix?: string): T[] {
    const rows = (raw as { shots?: unknown[] })?.shots;
    if (!Array.isArray(rows)) throw new Error("Storyboard answer had no shots array");

    const byIndex = new Map<number, unknown>();
    for (const row of rows) {
        const { index, prompt } = (row ?? {}) as { index?: unknown; prompt?: unknown };
        if (typeof index === "number") byIndex.set(index, prompt);
    }

    const seen = new Set<string>();
    return shots.map((shot, i) => {
        const prompt = cleanShotPrompt(byIndex.get(i), styleSuffix);
        if (!prompt || seen.has(prompt)) return shot;
        seen.add(prompt);
        return { ...shot, visualPrompt: prompt };
    });
}

export async function writeShotPrompts<T extends ShotBrief>(input: ShotPromptInput & { shots: T[] }): Promise<T[]> {
    const { data } = await callJsonLlm<unknown>({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(input),
        temperature: 0.8,
        label: "shot prompts",
    });
    return applyShotPrompts(input.shots, data, input.styleSuffix);
}
