import fs from "fs/promises";
import path from "path";

/**
 * Looks at a generated image the way a viewer would.
 *
 * Prompts lower the rate of physical errors but do not end them: a model told
 * the rider faces forward will still sometimes draw his back on an elephant
 * walking toward the camera. Nothing in the pipeline could see that, because
 * nothing in it ever looked at a picture.
 *
 * Fails open. A null answer means "not checked" and the image stands: losing the
 * check must never cost a shot.
 */

export type ImageReview = {
    ok: boolean;
    problems: string[];
    /** A positive instruction for the retry, describing the corrected picture. */
    fix: string;
};

const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
};

const INSTRUCTIONS = `You check illustrations for a narrated history video for physical mistakes a viewer would notice. It is meant to be stylised art, so judge only the following.

REJECT if clearly present on a figure that is large and easy to see:
- A rider whose body faces a different way from the animal: for example the animal's head points toward the viewer while we see the rider's back.
- Extra, missing or merged limbs, heads, tails, tusks or trunks.
- One body fused into another person, animal or object.
- The same distinctive person appearing twice in one picture.
- Visible letters, words or a watermark.
- A picture split into panels.

ACCEPT everything else, including painterly distortion, small background figures that are rough, historical inaccuracy, and anything you are unsure about. Only reject what you can point to.

Return ONLY JSON:
{ "ok": true or false, "problems": ["each mistake, briefly"], "fix": "if rejected: one short positive sentence describing the corrected arrangement, for example 'rider seated facing forward, the same direction the elephant walks, seen from the side'. Otherwise empty." }`;

export function parseReview(raw: string): ImageReview | null {
    try {
        const parsed = JSON.parse(raw.replace(/```(?:json)?/gi, "").trim()) as Partial<ImageReview>;
        if (typeof parsed.ok !== "boolean") return null;
        return {
            ok: parsed.ok,
            problems: Array.isArray(parsed.problems) ? parsed.problems.filter((p) => typeof p === "string") : [],
            fix: typeof parsed.fix === "string" ? parsed.fix : "",
        };
    } catch {
        return null;
    }
}

export async function reviewImage(publicPath: string): Promise<ImageReview | null> {
    const key = process.env.GEMINI_API_KEY;
    const mimeType = MIME_TYPES[path.extname(publicPath.split("?")[0]).toLowerCase()];
    if (!key || !mimeType || !publicPath.startsWith("/")) return null;

    try {
        const image = await fs.readFile(path.join(process.cwd(), "public", publicPath));
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: INSTRUCTIONS },
                                { inlineData: { mimeType, data: image.toString("base64") } },
                            ],
                        },
                    ],
                    generationConfig: { temperature: 0, maxOutputTokens: 2000, responseMimeType: "application/json" },
                }),
                signal: AbortSignal.timeout(45_000),
            },
        );
        if (!res.ok) {
            console.warn(`[review] Gemini failed (${res.status})`);
            return null;
        }

        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts ?? [])
            .filter((part: { thought?: boolean }) => !part.thought)
            .map((part: { text?: string }) => part.text ?? "")
            .join("");
        return parseReview(text);
    } catch (error) {
        console.warn("[review] could not check image:", error instanceof Error ? error.message : error);
        return null;
    }
}
