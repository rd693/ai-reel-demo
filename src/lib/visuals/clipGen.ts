/**
 * Motion for a shot: a generated clip, or stock footage, or nothing.
 *
 * The ladder is deliberate. Image-to-video is tried first when the paid stack
 * is on, because it animates *the still we already generated* — the clip
 * therefore matches the reel's art style, its subject and its composition
 * exactly. Stock footage cannot do that; it is real photography of some other
 * subject, and it only belongs in a reel that was photoreal to begin with.
 *
 * When nothing works this returns null and the caller keeps the still. A shot
 * that holds a good still is always better than one that holds nothing.
 */

export type ClipSource = "fal" | "pexels" | "pixabay";
export type GeneratedClip = { url: string; source: ClipSource };

/**
 * Image-to-video models, in preference order.
 *
 * Both take `{ prompt, image_url }` — confirmed against the live API, which
 * reports its required fields in the 422 body when you submit an empty request.
 * Override with FAL_VIDEO_MODELS (comma-separated) to change model or order
 * without touching code.
 */
const DEFAULT_FAL_MODELS = [
    // wan-i2v is first because it is the one verified end to end here: it
    // returned a 720x1280 h264 clip in 56s from a plain { prompt, image_url }.
    "fal-ai/wan-i2v",
    "fal-ai/kling-video/v1/standard/image-to-video",
];

/** Video generation is slow; this is a ceiling, not an expectation. */
const CLIP_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 3_000;

/**
 * Art styles that real footage can sit next to without breaking the reel.
 *
 * Splicing a stock video of an actual person into a watercolour or mythology
 * reel is far more jarring than a still that does not move — the style breaks
 * mid-sentence and the whole thing looks like a mistake.
 */
const PHOTOREAL_STYLES = new Set(["realism", "polaroid"]);

export function stockFootageSuits(artStyle?: string | null): boolean {
    return !!artStyle && PHOTOREAL_STYLES.has(artStyle);
}

function falModels(): string[] {
    const configured = process.env.FAL_VIDEO_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
    return configured?.length ? configured : DEFAULT_FAL_MODELS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pulls a video URL out of whichever shape the model returned. */
function extractVideoUrl(payload: unknown): string | null {
    const data = payload as Record<string, any> | null;
    const candidate =
        data?.video?.url ??
        data?.video_url ??
        data?.videos?.[0]?.url ??
        (typeof data?.video === "string" ? data.video : null);
    return typeof candidate === "string" && candidate.startsWith("http") ? candidate : null;
}

/**
 * Animates a still with fal's queue API.
 *
 * `imageUrl` must be reachable from fal's servers, which is why the pipeline
 * passes the *generator's own* URL rather than the local copy: a path under
 * public/ resolves to nothing from outside this machine.
 */
async function generateWithFal(imageUrl: string, prompt: string): Promise<GeneratedClip | null> {
    const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!key) return null;

    const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };

    for (const model of falModels()) {
        try {
            const submit = await fetch(`https://queue.fal.run/${model}`, {
                method: "POST",
                headers,
                // Only the two fields every model agrees on. Passing a duration
                // looked sensible and was actively harmful: kling accepts only
                // the strings "5" or "10" and 422s on anything else, so every
                // request to the primary model failed and silently fell through
                // to the next one. It buys nothing either — no model goes below
                // 5s, and shots here run 1.4-3.5s, so the clip is always longer
                // than the shot and the shot boundary cuts it.
                body: JSON.stringify({ prompt, image_url: imageUrl }),
                signal: AbortSignal.timeout(30_000),
            });

            if (!submit.ok) {
                console.warn(`[clip] ${model} submit failed: ${submit.status}`);
                continue;
            }

            const { status_url: statusUrl, response_url: responseUrl } = await submit.json();
            if (!statusUrl) continue;

            const deadline = Date.now() + CLIP_TIMEOUT_MS;
            let done = false;

            while (Date.now() < deadline) {
                await sleep(POLL_INTERVAL_MS);
                const status = await fetch(statusUrl, { headers }).then((r) => r.json()).catch(() => null);
                if (status?.status === "COMPLETED") { done = true; break; }
                if (status?.status === "FAILED" || status?.status === "ERROR") break;
            }

            if (!done) {
                console.warn(`[clip] ${model} did not finish within ${CLIP_TIMEOUT_MS / 1000}s`);
                continue;
            }

            const result = await fetch(responseUrl ?? statusUrl.replace(/\/status$/, ""), { headers });
            if (!result.ok) {
                // A completed job with a 422 body is a rejected request, not a
                // transient failure — the next model may accept it.
                console.warn(`[clip] ${model} result ${result.status}: ${(await result.text()).slice(0, 160)}`);
                continue;
            }

            const url = extractVideoUrl(await result.json());
            if (url) {
                console.log(`[clip] ${model} produced a clip`);
                return { url, source: "fal" };
            }
            console.warn(`[clip] ${model} completed with no video in the response`);
        } catch (e) {
            console.warn(`[clip] ${model} threw:`, e instanceof Error ? e.message : e);
        }
    }

    return null;
}

/**
 * Search terms for a stock library.
 *
 * Visual prompts are long and full of rendering instructions ("volumetric
 * lighting, 8K, no text") that match nothing in a footage catalogue. The
 * subject is almost always in the opening clause.
 */
export function stockQuery(prompt: string): string {
    return prompt
        .split(",")[0]
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(" ");
}

/** Pexels — free with an API key, and licensed for commercial reuse. */
async function findOnPexels(query: string): Promise<GeneratedClip | null> {
    const key = process.env.PEXELS_API_KEY;
    if (!key) return null;

    try {
        const res = await fetch(
            `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`,
            { headers: { Authorization: key }, signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok) return null;

        const data = await res.json();
        for (const video of data.videos ?? []) {
            // Prefer a portrait file near 1080 wide; the reel is 1080x1920.
            const file = (video.video_files ?? [])
                .filter((f: any) => f.width && f.height && f.height > f.width)
                .sort((a: any, b: any) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080))[0];
            if (file?.link) return { url: file.link, source: "pexels" };
        }
    } catch (e) {
        console.warn("[clip] Pexels lookup failed:", e instanceof Error ? e.message : e);
    }
    return null;
}

/** Pixabay — free with an API key, Content-ID safe. */
async function findOnPixabay(query: string): Promise<GeneratedClip | null> {
    const key = process.env.PIXABAY_API_KEY;
    if (!key) return null;

    try {
        const res = await fetch(
            `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=5`,
            { signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok) return null;

        const data = await res.json();
        const hit = data.hits?.[0];
        const url = hit?.videos?.large?.url || hit?.videos?.medium?.url;
        if (url) return { url, source: "pixabay" };
    } catch (e) {
        console.warn("[clip] Pixabay lookup failed:", e instanceof Error ? e.message : e);
    }
    return null;
}

export type ClipRequest = {
    /** The motion prompt written by the shot planner. */
    prompt: string;
    /** Publicly reachable URL of the generated still, for image-to-video. */
    imageUrl?: string;
    /** The still's own prompt, used to search stock libraries. */
    visualPrompt?: string;
    durationSeconds: number;
    artStyle?: string | null;
    usePremium: boolean;
};

/**
 * Motion for one shot, or null to keep the still.
 *
 * Nothing here throws: a shot that cannot be animated is a shot that stays
 * still, which is a worse reel but still a finished one.
 */
export async function generateClip(req: ClipRequest): Promise<GeneratedClip | null> {
    if (req.usePremium && req.imageUrl) {
        const generated = await generateWithFal(req.imageUrl, req.prompt);
        if (generated) return generated;
    }

    if (!stockFootageSuits(req.artStyle)) return null;

    const query = stockQuery(req.visualPrompt || req.prompt);
    if (!query) return null;

    return (await findOnPexels(query)) ?? (await findOnPixabay(query));
}

/** Whether any clip provider is configured at all. */
export function clipProvidersAvailable(usePremium: boolean): boolean {
    const hasFal = !!(process.env.FAL_KEY || process.env.FAL_API_KEY);
    const hasStock = !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
    return (usePremium && hasFal) || hasStock;
}
