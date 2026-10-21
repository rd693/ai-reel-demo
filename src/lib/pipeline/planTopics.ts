import { callJsonLlm } from "../ai/jsonLlm";
import { collectTrendSignals, renderTrendBriefing, type TrendSignals } from "../trends";

/**
 * Writes a queue of topics for a series.
 *
 * The scheduler used to pass `series.niche` as the subject of every reel it
 * generated, so the writer re-picked a topic from one line of text on every
 * run, with no knowledge of the previous thirty reels. It converged on the
 * obvious subjects and repeated them.
 *
 * Planning is therefore a separate, batched step: one call that can see what
 * has already been made, what is rising in search, and what is pulling views
 * in the niche right now, and that answers with enough topics to last weeks.
 * Per-reel cost is unchanged; per-month cost gains one LLM call.
 */

export type PlannedTopic = {
    title: string;
    subject: string;
    angle: string;
    rationale: string;
    trendSource: "google-trends" | "youtube" | "evergreen";
    score: number;
};

export type PlanInput = {
    niche: string;
    language: string;
    seriesContext?: string | null;
    targetDuration: number;
    /** Titles already queued or already made — the planner must avoid these. */
    avoidTitles: string[];
    count: number;
    geo?: string;
    /** Pre-fetched signals. Omit and they are collected here. */
    signals?: TrendSignals;
};

export type PlanResult = {
    topics: PlannedTopic[];
    provider: string;
    signals: TrendSignals;
};

const TREND_SOURCES = new Set(["google-trends", "youtube", "evergreen"]);

/**
 * Comparison key for a title.
 *
 * Devanagari punctuation (the danda, ।) and Latin punctuation both have to go,
 * so this strips by Unicode category rather than by a character list. Two
 * titles that differ only in punctuation or spacing are the same topic, and
 * the unique index on (seriesId, dedupeKey) is what enforces that.
 */
export function topicKey(title: string): string {
    return title
        .normalize("NFKC")
        .replace(/[\p{P}\p{S}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

const SYSTEM_PROMPT = `You plan topics for a faceless short-video channel. You are not writing the script — you are deciding what gets made and what it will be called.

A topic you return is a commitment: it will be narrated, illustrated by an image model, and published. So every topic must be one that can be TOLD in the given runtime, SHOWN without a photograph existing, and PAID OFF by the title you gave it.

WHAT MAKES A GOOD TITLE
- It names the specific person, place or object. "The warrior who refused a throne" is weak; naming him is strong.
- It promises one concrete thing the viewer does not know, and the script can actually deliver it.
- It is a claim or a question with something at stake, not a label. "Panipat ka yudh" is a label. "Why Panipat was lost before it began" is a claim.
- 6 to 12 words. No "Top 10", no listicles, no emoji, no ALL CAPS, no clickbait the script cannot honour.
- It is written in the channel's language, in that language's own script.

WHAT MAKES A GOOD SUBJECT
The "subject" field is not the title. It is the single entity an image model should depict — a named person, place, object or event, in English, 2 to 6 words. "Rani Durgavati on horseback" is a subject. "The tragedy of a forgotten queen" is not.

USING TREND DATA
You may be given today's rising searches. They come from a general feed, so most of them will be irrelevant to this niche. Use one ONLY when a genuine bridge exists:
- a festival or observance whose origin story belongs to this niche
- an anniversary, or a date falling in the next few weeks
- a film, series or news story about a figure or event in this niche
- a place in the news that has history worth telling
If there is no real bridge, do not force one. A forced tie-in is worse than an evergreen topic: mark it "evergreen" and write the best topic you can. Set trendSource honestly — "google-trends" or "youtube" only when that signal genuinely drove the choice.

You may also be given videos already performing in this niche. Learn the shape of what works from them — the kind of subject, the kind of promise. Never copy a title, and never propose the same subject as a video listed there.

BALANCE
At most 40% of your topics may be trend-tied. A queue made entirely of this week's trends is worthless in three weeks, which is exactly how long the queue needs to last.

Return ONLY valid JSON.`;

function buildUserPrompt(input: PlanInput, signals: TrendSignals): string {
    const today = new Date();
    const avoid = input.avoidTitles.length
        ? input.avoidTitles.map((t) => `- ${t}`).join("\n")
        : "- (nothing yet — this is the first batch)";

    return `CHANNEL
Niche: ${input.niche}
Language: ${input.language} (titles must be written in this language, in its own script)
Runtime per video: about ${input.targetDuration} seconds — roughly ${Math.round((input.targetDuration * 2.6) / 10) * 10} words of narration
Region: ${signals.geo}
${input.seriesContext ? `Channel context: ${input.seriesContext}` : ""}

TODAY
${today.toISOString().slice(0, 10)} (${today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}) — consider what falls in the next three to six weeks.

${renderTrendBriefing(signals)}

ALREADY MADE OR ALREADY QUEUED — do not propose these, or a near-variant of them:
${avoid}

TASK
Return ${input.count} topics, ordered best-first, as JSON:

{
  "topics": [
    {
      "title": "the video title, in ${input.language}, 6-12 words",
      "subject": "the entity to depict, English, 2-6 words",
      "angle": "the turn this telling takes — what makes it not the obvious version, one sentence",
      "rationale": "why this topic now; for an evergreen pick, why it earns a slot at all",
      "trendSource": "google-trends | youtube | evergreen",
      "score": 0-100
    }
  ]
}

Spread the scores honestly — if only four of these are genuinely strong, the rest should score below 50. An inflated queue costs real money in narration and images.`;
}

/** Keeps a model's answer inside the shape the database expects. */
function sanitize(raw: unknown, fallbackCount: number): PlannedTopic[] {
    const topics = (raw as { topics?: unknown[] })?.topics;
    if (!Array.isArray(topics)) throw new Error("Planner returned no topics array");

    const cleaned: PlannedTopic[] = [];
    const seen = new Set<string>();

    for (const item of topics) {
        const row = item as Record<string, unknown>;
        const title = String(row.title ?? "").trim();
        const subject = String(row.subject ?? "").trim();
        if (!title || !subject) continue;

        // The model can repeat itself inside one answer; the unique index would
        // reject the second copy, so drop it here where it is not an error.
        const key = topicKey(title);
        if (seen.has(key)) continue;
        seen.add(key);

        const source = String(row.trendSource ?? "evergreen");
        const score = Number(row.score);

        cleaned.push({
            title: title.slice(0, 200),
            subject: subject.slice(0, 120),
            angle: String(row.angle ?? "").trim().slice(0, 400),
            rationale: String(row.rationale ?? "").trim().slice(0, 400),
            trendSource: (TREND_SOURCES.has(source) ? source : "evergreen") as PlannedTopic["trendSource"],
            score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 50,
        });
    }

    if (!cleaned.length) throw new Error("Planner returned no usable topics");
    console.log(`[planner] ${cleaned.length} usable topics of ${fallbackCount} requested`);
    return cleaned;
}

export async function planTopics(input: PlanInput): Promise<PlanResult> {
    const signals =
        input.signals ??
        (await collectTrendSignals({
            niche: input.niche,
            language: input.language,
            geo: input.geo,
        }));

    const { data, provider } = await callJsonLlm<unknown>({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(input, signals),
        label: `topic plan for "${input.niche}"`,
        temperature: 0.9,
    });

    return { topics: sanitize(data, input.count), provider, signals };
}
