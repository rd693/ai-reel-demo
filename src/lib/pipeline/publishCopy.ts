import { callJsonLlm } from "../ai/jsonLlm";
import type { PublishCopy } from "../../types/series";

/**
 * The words that go around the video: title, description, hashtags, tags.
 *
 * The pipeline used to stop at an MP4, so every upload meant writing these by
 * hand — and the reel title alone is not a YouTube title. It is written to be
 * spoken into the first second, carries no search keywords, and the upload form
 * also wants a description, hashtags, tags and a category.
 *
 * One model call writes the copy; everything YouTube enforces is then enforced
 * here, in code, rather than requested in the prompt. A title over 100
 * characters is rejected by the upload form, and so is a description containing
 * "<" or ">", whatever the model was asked.
 */

export type PublishCopyInput = {
    /** The reel title, from the topic queue or the script model. */
    title: string;
    script: string;
    niche: string;
    language: string;
    artStyle?: string;
    seriesContext?: string | null;
    angle?: string | null;
};

/** YouTube's own limits. */
const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;
const MAX_TAGS_TOTAL = 500;
const MAX_HASHTAGS = 5;

/**
 * Categories a faceless channel plausibly belongs in, with their API ids.
 * The model picks a name; the id comes from here, never from the model.
 */
const CATEGORIES: Record<string, string> = {
    Education: "27",
    Entertainment: "24",
    "People & Blogs": "22",
    "Film & Animation": "1",
    "Science & Technology": "28",
    "Howto & Style": "26",
    "News & Politics": "25",
    "Travel & Events": "19",
};

const LANGUAGE_CODES: Record<string, string> = {
    english: "en",
    hindi: "hi",
    spanish: "es",
    french: "fr",
    german: "de",
};

/**
 * Styles that can pass for real footage. YouTube asks creators to disclose
 * generated media only when a viewer could mistake it for something real; a
 * watercolour or a LEGO figure does not need it, a photoreal battle does.
 */
const REALISTIC_STYLES = new Set(["realism", "polaroid", "cinematic_3d"]);

const SYSTEM_PROMPT = `You write the upload copy for a YouTube Short: the title, description, hashtags and tags. The video already exists; you are given its script. Everything you write must be true to that script — never promise something the video does not show.

TITLE
- What the viewer sees in the Shorts feed and in search. Lead with the specific name, place or object, then the hook.
- 40 to 70 characters is the target. Never more than 100.
- Written in the channel language, in that language's own script.
- No emoji, no ALL CAPS, no hashtags in the title, no clickbait the script does not pay off.

DESCRIPTION
In the channel language, in this order, separated by blank lines:
1. One hook line, under 100 characters — it shows before "more".
2. Two to four sentences saying what the video covers, naming the people, places and dates in it. This is what search reads.
3. Key names once more in English/Roman spelling, on one line — viewers search both ways.
4. One question inviting viewers to answer in the comments.
Do not put hashtags in the description; they are added separately. Do not use the characters < or >.

HASHTAGS
3 to 5, each one word with no spaces, starting with #. The first must be #Shorts. Mix the channel language and English. Specific beats generic: #MalikAmbar is worth more than #History.

TAGS
10 to 20 search phrases a viewer would actually type: the subject in English, in transliteration and in the channel script, plus the broader topic. No "#". No repeats.

PINNED COMMENT
One short question, in the channel language, that viewers can answer in a word or two.

CATEGORY
Exactly one of: ${Object.keys(CATEGORIES).join(", ")}.

Return ONLY valid JSON.`;

function buildUserPrompt(input: PublishCopyInput): string {
    return `CHANNEL
Niche: ${input.niche}
Language: ${input.language}
${input.seriesContext ? `Channel context: ${input.seriesContext}\n` : ""}
VIDEO
Working title: ${input.title}
${input.angle ? `Angle: ${input.angle}\n` : ""}Script:
${input.script}

Return:
{
  "title": "...",
  "description": "...",
  "hashtags": ["#Shorts", "..."],
  "tags": ["..."],
  "pinnedComment": "...",
  "category": "..."
}`;
}

type RawCopy = {
    title?: unknown;
    description?: unknown;
    hashtags?: unknown;
    tags?: unknown;
    pinnedComment?: unknown;
    category?: unknown;
};

/** Cuts at a word boundary, so a long title never ends mid-word. */
function clip(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function asStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** "#Shorts" first, one word each, no duplicates regardless of case. */
export function normalizeHashtags(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of ["#Shorts", ...raw]) {
        const word = tag.replace(/^#+/, "").replace(/[\s#<>,.!?'"]/g, "");
        if (!word) continue;
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(`#${word}`);
        if (out.length === MAX_HASHTAGS) break;
    }
    return out;
}

/**
 * Keeps tags under YouTube's 500-character budget. The budget counts the comma
 * between tags, and a tag containing a space is wrapped in quotes that count
 * too — which is why a list that looks short can still be rejected.
 */
export function fitTags(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    let used = 0;
    for (const tag of raw) {
        const clean = tag.replace(/[#<>,]/g, "").replace(/\s+/g, " ").trim();
        if (!clean || clean.length > 100) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        const cost = clean.length + (clean.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
        if (used + cost > MAX_TAGS_TOTAL) continue;
        seen.add(key);
        out.push(clean);
        used += cost;
    }
    return out;
}

export function toPublishCopy(raw: RawCopy, input: PublishCopyInput, provider: string): PublishCopy {
    const hashtags = normalizeHashtags(asStrings(raw.hashtags));

    const title = clip(asString(raw.title).replace(/#\S+/g, "").replace(/\s+/g, " ").trim() || input.title, MAX_TITLE);

    const hashtagLine = hashtags.join(" ");
    const body = asString(raw.description)
        .replace(/[<>]/g, "")
        // The model is told to leave hashtags out; if it did not, they are
        // removed here so the line added below is the only one.
        .replace(/(^|\s)#[^\s#]+/g, "$1")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    const description = clip(body, MAX_DESCRIPTION - hashtagLine.length - 2) + `\n\n${hashtagLine}`;

    const category = typeof raw.category === "string" && raw.category in CATEGORIES ? raw.category : "Education";

    return {
        title,
        description,
        hashtags,
        tags: fitTags(asStrings(raw.tags)),
        pinnedComment: asString(raw.pinnedComment).replace(/[<>]/g, "") || undefined,
        settings: {
            category,
            categoryId: CATEGORIES[category],
            language: LANGUAGE_CODES[input.language.toLowerCase()] ?? "en",
            madeForKids: false,
            alteredContent: REALISTIC_STYLES.has(input.artStyle ?? ""),
        },
        generatedAt: new Date().toISOString(),
        provider,
    };
}

export async function writePublishCopy(input: PublishCopyInput): Promise<PublishCopy> {
    if (!input.script.trim()) throw new Error("A reel needs a script before it can have upload copy");

    const { data, provider } = await callJsonLlm<RawCopy>({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(input),
        temperature: 0.7,
        label: "publish copy",
    });

    return toPublishCopy(data, input, provider);
}
