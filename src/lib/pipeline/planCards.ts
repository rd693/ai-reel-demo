import type { CardSpec } from "../../compositions/cards/cardSpec";
import type { Deck } from "../../compositions/cards/deck";

/**
 * Turns the shot list into pages.
 *
 * The script writer decides what is said; this decides what is printed. They
 * are separate calls on purpose — the writer's prompt is already enormous, and
 * layout is a different job from narration. It also means a card deck can be
 * put on top of a script the model never wrote, which is exactly what a
 * pasted transcript is.
 *
 * What comes back per shot is a layout, two or three display words, and the
 * subject to illustrate. Not a scene: a subject. The page supplies the paper,
 * the light and the composition, and an illustration that brings its own
 * fights with all three.
 */

export type CardPlanInput = {
    index: number;
    narrationText: string;
    durationInSeconds: number;
};

type PlannedCard = Omit<CardSpec, "figure"> & { subject?: string };

export type PlannedCards = {
    /** One per input shot, in order. */
    cards: CardSpec[];
    /** What to illustrate for each card, or undefined where the page needs no image. */
    subjects: (string | undefined)[];
};

const SYSTEM = `You lay out pages for a short vertical documentary. Every page is
printed from the same notebook: heavy condensed display type, a figure number,
an illustration of one isolated subject.

You are given the narration, shot by shot. For each shot, return the page it is
printed as.

LAYOUTS
- "statement": display type alone, filling the page. For a beat that is a claim
  or a turn, not a thing. Needs no illustration — prefer it often, it is the
  page that costs nothing and reads loudest.
- "specimen": the subject, named on a pinned label. For introducing a thing.
- "diagram": the subject with one part called out by a label and a leader line.
  For a beat that is about a specific part or action.
- "xray": an inverted plate with a crosshair on one spot. For a beat about
  precision, targeting, or something hidden inside.
- "list": options being ruled out, struck through. For a beat that says what
  does NOT happen or what will NOT work.

RULES
- "lines": the display type, 1-2 lines, 1-3 words per line. These are the words
  a viewer reads in half a second, pulled from the meaning of the narration —
  not a transcription of it. Same language as the narration.
- "accentLines": which line indices are set in the loud colour. Usually [1]
  when there are two lines, [0] when there is one. Never both.
- "subject": ENGLISH, 3-10 words, ONE isolated thing: "jewel wasp, lateral
  view", "cockroach antenna", "wasp larva". Never a scene, never a background,
  never an action between two things. Omit entirely for "statement" and "list"
  pages that do not need one.
- "annotation.label": 1-2 words naming the part, in the narration's language.
  Only for "diagram" and "xray".
- "tag": only for "specimen". title is a short label, subtitle a latin name or
  a place.
- "items": only for "list". 2-3 short options, each with struck true or false.
- Vary the layout. NEVER two "statement" pages in a row, and never the same
  layout three times in a row. At most one page in three is a "statement" —
  a run of pages carrying nothing but two words is an empty reel.
- A "statement" page MAY carry a "subject" as well, and should whenever the
  beat names a thing. Type alone is for beats that name no thing at all.

Return ONLY a JSON array, one object per shot, in order:
[{"kind":"statement","lines":["IT WON'T","KILL"],"accentLines":[1]}, ...]`;

/** The model calls, smallest version that works. */
async function complete(system: string, user: string): Promise<string> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-opus-5",
                max_tokens: 16000,
                system,
                messages: [{ role: "user", content: user }],
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const text = data.content?.find((b: { type: string }) => b.type === "text")?.text;
            if (text) return text;
        }
        console.warn(`[cards] Claude unavailable (${res.status}); falling back to Groq`);
    }

    const groqKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (groqKey?.startsWith("gsk_")) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                temperature: 0.6,
                max_tokens: 8000,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (text) return text;
        }
    }

    throw new Error("No LLM available to plan cards (needs ANTHROPIC_API_KEY or GROQ_API_KEY)");
}

/** Models wrap JSON in prose and fences however often you ask them not to. */
function parseCards(raw: string): PlannedCard[] {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("card plan contained no JSON array");
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error("card plan was not an array");
    return parsed as PlannedCard[];
}

const KINDS = ["specimen", "statement", "xray", "list", "diagram"] as const;

/**
 * A page the model returned, made safe to render.
 *
 * Everything here is a defence against one specific failure: a page that does
 * not render is a hole in the video, and a reel with a hole in it is worth
 * less than a reel with a dull page in it.
 */
function sanitize(card: PlannedCard, index: number, figure: number): CardSpec {
    const kind = KINDS.includes(card.kind) ? card.kind : "statement";
    const lines = (Array.isArray(card.lines) ? card.lines : [])
        .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        .slice(0, 2)
        .map((line) => line.trim());

    return {
        kind,
        figure,
        // A page with nothing set on it is the one thing that cannot happen.
        lines: lines.length ? lines : [`${index + 1}`],
        accentLines: Array.isArray(card.accentLines)
            ? card.accentLines.filter((i) => typeof i === "number" && i < lines.length)
            : lines.length > 1
              ? [1]
              : [0],
        annotation:
            card.annotation && typeof card.annotation.label === "string"
                ? {
                      label: card.annotation.label,
                      // The model cannot know where a part sits in an image that
                      // does not exist yet, so the anchor is ours, not its.
                      at: { x: 58, y: 46 },
                      from: { x: 30, y: 62 },
                  }
                : undefined,
        items: Array.isArray(card.items)
            ? card.items
                  .filter((item) => item && typeof item.text === "string")
                  .slice(0, 3)
                  .map((item) => ({ text: item.text, struck: item.struck !== false }))
            : undefined,
        tag: card.tag && typeof card.tag.title === "string" ? card.tag : undefined,
        sidenote: typeof card.sidenote === "string" ? card.sidenote : undefined,
    };
}

export async function planCards(
    shots: CardPlanInput[],
    deck: Deck,
    subject: string,
): Promise<PlannedCards> {
    const user =
        `The reel is about: ${subject}\n` +
        `Deck: ${deck.id}\n\n` +
        `Shots:\n` +
        shots
            .map((s) => `${s.index + 1}. (${s.durationInSeconds.toFixed(1)}s) ${s.narrationText}`)
            .join("\n");

    const planned = parseCards(await complete(SYSTEM, user));

    const cards: CardSpec[] = [];
    const subjects: (string | undefined)[] = [];

    for (let i = 0; i < shots.length; i++) {
        // A short plan is padded rather than failed: the pages that came back
        // are still better than nothing, and a missing one becomes a plain
        // statement rather than a gap in the video.
        const card = planned[i] ?? { kind: "statement" as const, lines: [] };
        cards.push(sanitize(card, i, i + 1));
        const needsImage = card.kind !== "statement" || !!card.subject;
        subjects.push(needsImage ? card.subject : undefined);
    }

    const kinds = cards.reduce<Record<string, number>>((acc, card) => {
        acc[card.kind] = (acc[card.kind] ?? 0) + 1;
        return acc;
    }, {});
    console.log(
        `[cards] planned ${cards.length} pages — ` +
            Object.entries(kinds)
                .map(([k, n]) => `${n} ${k}`)
                .join(", ") +
            `; ${subjects.filter(Boolean).length} need an illustration`,
    );

    return { cards, subjects };
}
