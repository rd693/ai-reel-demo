import { prisma } from "../db/client";
import { topicRepo, type TopicIdea } from "../db/topicRepo";
import { callJsonLlm } from "../ai/jsonLlm";
import { collectTrendSignals, renderTrendBriefing, type TrendSignals } from "../trends";
import { judgeTopics, sanitizeTopics } from "./planTopics";

/**
 * Finds more topics like a reel that performed.
 *
 * The general planner works from the niche, so a reel that broke out tells it
 * nothing. Here the reel itself is the brief: its script is read for what made
 * it work — the genre, the shape of the story, the feeling it leaves — and new
 * subjects are proposed that carry the same thing. "Same vibe, different
 * story", not the same story retold.
 *
 * Every idea is stored with the reel it came from, so the queue can say
 * "similar to …" and the planner can treat these reels as the channel's
 * proven winners from then on.
 */

export const DEFAULT_SIMILAR_COUNT = 8;

/** How much of the script the model reads. Enough for the shape, not the whole thing. */
const SCRIPT_CHARS = 2500;

export type StoryDna = {
    genre: string;
    storyShape: string;
    emotionalPull: string;
    hook: string;
    titlePattern: string;
    searchPhrases: string[];
};

export type SimilarResult = {
    reel: { id: string; title: string };
    dna: StoryDna;
    inserted: TopicIdea[];
    duplicates: string[];
    provider: string;
    signals: TrendSignals;
};

const DNA_PROMPT = `You study short videos that outperformed and explain, precisely, why. You are reading one reel from a faceless channel that did much better than the channel's usual numbers.

Name what a viewer actually responded to — not the topic, the TYPE of story:
- genre: the narrow genre, e.g. "medieval betrayal", "forgotten woman warrior", "lost-city mystery"
- storyShape: the arc, e.g. "an underdog's last stand against impossible odds", "a trusted ally's betrayal at the decisive moment"
- emotionalPull: what the viewer feels at the end — pride, outrage, awe, grief, disbelief
- hook: how the first line grabs, e.g. "opens on the moment of defeat, then rewinds"
- titlePattern: the shape of the title, abstracted, e.g. "[Name] who [did impossible thing] — and why history forgot"
- searchPhrases: 2 short YouTube search phrases (2-4 words each) that would find other videos of this TYPE, in the channel's language if it is not English

Return ONLY valid JSON.`;

const SIMILAR_PROMPT = `You plan topics for a faceless short-video channel. One of its reels outperformed, and you have been told why. Propose new topics that give the audience the SAME experience with a DIFFERENT story.

RULES
- Same genre, same story shape, same emotional pull. Different person, place or event every time.
- Never the same subject as the winning reel, and never a near-variant of anything already made.
- Every topic must be TRUE, tellable in the runtime, and showable by an image model without a photograph.
- Titles follow the winning reel's title pattern but are not a template fill — each must stand on its own. 6 to 12 words, in the channel's language and its own script. No listicles, no emoji, no ALL CAPS.
- subject: the single entity to depict, in English, 2-6 words — a named person, place, object or event.
- angle: the turn that makes this telling not the obvious version.
- rationale: say which part of the winner's DNA this carries.

If you are given videos already performing for this type of story, use them to judge which subjects the audience is hungry for. Never copy a title.

Return ONLY valid JSON.`;

function cleanDna(raw: unknown): StoryDna {
    const row = (raw ?? {}) as Record<string, unknown>;
    const text = (key: string) => String(row[key] ?? "").trim().slice(0, 200);
    const phrases = Array.isArray(row.searchPhrases)
        ? row.searchPhrases.map((p) => String(p).trim()).filter(Boolean).slice(0, 2)
        : [];
    return {
        genre: text("genre"),
        storyShape: text("storyShape"),
        emotionalPull: text("emotionalPull"),
        hook: text("hook"),
        titlePattern: text("titlePattern"),
        searchPhrases: phrases,
    };
}

export function renderDna(dna: StoryDna): string {
    return [
        `Genre: ${dna.genre}`,
        `Story shape: ${dna.storyShape}`,
        `Emotional pull: ${dna.emotionalPull}`,
        `Hook: ${dna.hook}`,
        `Title pattern: ${dna.titlePattern}`,
    ].join("\n");
}

export async function discoverSimilar(
    reelId: string,
    options: { count?: number } = {},
): Promise<SimilarResult> {
    const count = options.count ?? DEFAULT_SIMILAR_COUNT;

    const reel = await prisma.reel.findUnique({
        where: { id: reelId },
        include: {
            series: {
                include: { reels: { orderBy: { createdAt: "desc" }, take: 60, select: { title: true } } },
            },
        },
    });
    if (!reel) throw new Error("Reel not found");
    if (!reel.script.trim()) throw new Error("This reel has no script yet, so there is nothing to learn from.");

    const series = reel.series;
    const language = reel.language ?? series.language;
    const topic = await prisma.topicIdea.findFirst({
        where: { usedReelId: reelId },
        select: { subject: true, angle: true },
    });

    // ── 1. What made it work ─────────────────────────────────────────────
    const { data: dnaRaw, provider } = await callJsonLlm<unknown>({
        system: DNA_PROMPT,
        user: `CHANNEL: ${series.niche}, in ${language}${series.seriesContext ? ` — ${series.seriesContext}` : ""}

WINNING REEL
Title: ${reel.title}
${topic ? `Depicts: ${topic.subject}${topic.angle ? `\nAngle: ${topic.angle}` : ""}\n` : ""}Script:
${reel.script.slice(0, SCRIPT_CHARS)}

Return:
{ "genre": "", "storyShape": "", "emotionalPull": "", "hook": "", "titlePattern": "", "searchPhrases": ["", ""] }`,
        label: `story DNA of "${reel.title}"`,
        temperature: 0.3,
    });
    const dna = cleanDna(dnaRaw);

    // ── 2. What else of this type is pulling views now ───────────────────
    // A longer window than the planner's month: this is about a type of
    // story, which does not go stale in thirty days.
    const signals = await collectTrendSignals({
        niche: series.niche,
        language,
        extraQueries: dna.searchPhrases,
        withinDays: 90,
        // Today's general rising searches have nothing to say about one
        // reel's story type; only the matching videos are useful here.
        includeRising: false,
    });
    const briefing = renderTrendBriefing(signals);

    // ── 3. Topics that carry the same thing ──────────────────────────────
    const avoidTitles = [
        ...new Set([...(await topicRepo.knownTitles(series.id)), ...series.reels.map((r) => r.title)]),
    ].filter(Boolean);
    const candidateCount = Math.min(24, count * 2);

    const { data } = await callJsonLlm<unknown>({
        system: SIMILAR_PROMPT,
        user: `CHANNEL
Niche: ${series.niche}
Language: ${language} (titles in this language, in its own script)
Runtime per video: about ${series.targetDuration || 60} seconds

THE WINNING REEL: "${reel.title}"${topic ? ` (depicts ${topic.subject})` : ""}
WHY IT WORKED
${renderDna(dna)}

${briefing}

ALREADY MADE OR QUEUED — do not propose these or a near-variant:
${avoidTitles.slice(0, 80).map((t) => `- ${t}`).join("\n") || "- (nothing yet)"}

Return ${candidateCount} topics, best first:
{ "topics": [ { "title": "", "subject": "", "angle": "", "rationale": "", "trendSource": "youtube | evergreen", "score": 0-100 } ] }`,
        label: `topics like "${reel.title}"`,
        temperature: 0.9,
    });

    const candidates = sanitizeTopics(data, candidateCount);
    const topics = await judgeTopics(candidates, {
        keep: count,
        niche: series.niche,
        language,
        targetDuration: series.targetDuration || 60,
        avoidTitles,
        winners: [reel.title],
    });

    const { inserted, duplicates } = await topicRepo.insertMany(series.id, topics, {
        reelId: reel.id,
        title: reel.title,
    });

    console.log(
        `[topics] similar to "${reel.title}": ${dna.genre} / ${dna.storyShape} — inserted ${inserted.length}` +
            (duplicates.length ? `, ${duplicates.length} duplicate(s) dropped` : ""),
    );

    return { reel: { id: reel.id, title: reel.title }, dna, inserted, duplicates, provider, signals };
}
