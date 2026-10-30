import { hasStyleClause, styleClause } from "./artStyles";

interface GenerateImageOptions {
    prompt: string;
    style?: string;
    aspect?: "reel" | "square" | "landscape";
    seed?: number;
    usePremium?: boolean;
}

interface ImageSize {
    width: number;
    height: number;
}

/**
 * What to ask for, before each provider's own ceiling is applied.
 *
 * The reel size is the render size. It used to be 768x1344, which the
 * composition then scaled up to 1080x1920 and pushed into further on top of
 * that (see kenBurns) — so every shot was a soft, upscaled image before the
 * camera move even started.
 */
const IMAGE_SIZES: Record<NonNullable<GenerateImageOptions["aspect"]>, ImageSize> = {
    reel: { width: 1080, height: 1920 },
    square: { width: 1024, height: 1024 },
    landscape: { width: 1920, height: 1080 },
};

/**
 * Longest side each generator will actually honour.
 *
 * FLUX.1 [pro] rejects a side over 1440, so a reel asks fal for 800x1440 —
 * still 1.4x the pixels of the old request. The free generators stay where
 * they were; raising them only produces slower, not better, images.
 */
const MAX_SIDE = {
    fal: 1440,
    free: 1344,
} as const;

/** Scales a request to fit a provider's ceiling, on a multiple of 32. */
function fit(size: ImageSize, maxSide: number): ImageSize {
    const longest = Math.max(size.width, size.height);
    if (longest <= maxSide) return size;

    const scale = maxSide / longest;
    // Diffusion models work in multiples of 32 and pad anything else, and a
    // padded request comes back letterboxed.
    const snap = (n: number) => Math.max(256, Math.round((n * scale) / 32) * 32);
    return { width: snap(size.width), height: snap(size.height) };
}

/**
 * Removes clauses that negate.
 *
 * This is the fix for the single worst thing the old prompt builder did. Every
 * generator in the ladder is a FLUX-family model conditioned by T5, and none
 * of them have a negative channel — fal's flux-pro v1.1 has no
 * `negative_prompt` field at all. The old code built a negative prompt anyway
 * and then *concatenated it onto the positive one*: ". Negative: collage,
 * split screen, multiple panels, grid of images, extra limbs, extra hands,
 * extra fingers, montage, diptych, triptych, blurry, bad anatomy, text, logo,
 * watermark".
 *
 * To the model that is not a prohibition, it is a request. Every image was
 * asking for collages, extra limbs and watermarks — the exact artefacts the
 * list was written to prevent. Together got the same list as "[Strictly
 * avoid: ...]" and Pollinations as "Strictly no collage".
 *
 * So: strip negations from whatever reaches here — the writer's prompts and
 * the stored prompts of older reels both contain "no text" — and send a real
 * negative prompt only to a provider that has a field for one.
 */
export function stripNegations(prompt: string): string {
    return prompt
        .split(",")
        .filter((clause) => {
            const c = clause.trim().toLowerCase();
            return c.length > 0 && !/^(no|not|without|avoid|never|minus)\b/.test(c);
        })
        .join(", ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The prompt a generator actually receives.
 *
 * Short on purpose. The old builder appended fifteen boosters — "8k
 * resolution", "masterpiece quality", "professional color grading",
 * "intricate details" — plus up to eight style keywords, so the scene being
 * depicted was a fifth of the prompt and the rest was SD-era keyword soup
 * that a T5-conditioned model does not reward. The subject leads, the style
 * clause follows once, and nothing else is added.
 */
function buildPrompt(
    prompt: string,
    style: string | undefined,
    aspect: NonNullable<GenerateImageOptions["aspect"]>,
): string {
    const subject = stripNegations(prompt || "");
    const clause = stripNegations(styleClause(style));

    const parts = [subject];
    // The writer already appends the style clause to each visual prompt, so
    // adding it again here was a second, conflicting style instruction.
    if (!hasStyleClause(subject, clause)) parts.push(clause);
    if (aspect === "reel") parts.push("vertical full-frame composition");

    return parts.filter(Boolean).join(", ");
}

/**
 * Sent only to generators that have a real negative channel.
 *
 * ReelShorts takes a `negative_prompt` field, so the list does what it says
 * there. For the FLUX endpoints it is deliberately unused.
 */
function buildNegativePrompt(): string {
    return [
        "collage",
        "split screen",
        "multiple panels",
        "grid of images",
        "extra limbs",
        "extra fingers",
        "deformed hands",
        "low quality",
        "blurry",
        "bad anatomy",
        "text",
        "watermark",
    ].join(", ");
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isValidImageUrl(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(8000),
        });

        const contentType = res.headers.get("content-type") || "";

        return res.ok && contentType.startsWith("image/");
    } catch {
        return false;
    }
}

export async function generateImage({
    prompt,
    style = "cinematic_3d",
    aspect = "reel",
    seed,
    usePremium = false,
}: GenerateImageOptions): Promise<string> {
    console.log(`[ImageGen] Generating: "${prompt?.substring(0, 50)}..." | Style: ${style} | Aspect: ${aspect} | Seed: ${seed} | Premium: ${usePremium}`);

    const size = IMAGE_SIZES[aspect];
    const finalPrompt = buildPrompt(prompt, style, aspect);
    const negativePrompt = buildNegativePrompt();

    console.log(`[ImageGen] prompt: "${finalPrompt.slice(0, 160)}"`);

    // 1. Fal.ai (Primary Premium)
    if (usePremium) {
        const falUrl = await generateWithFal({
            prompt: finalPrompt,
            negativePrompt,
            size,
            seed: seed,
        });

        if (falUrl) return falUrl;
        console.warn("[ImageGen] Premium Fal.ai failed, falling back to free stack");
    }

    // 2. ReelShorts
    const reelShortsUrl = await generateWithReelShorts({
        prompt: finalPrompt,
        negativePrompt,
        size,
        seed: seed,
    });

    if (reelShortsUrl) return reelShortsUrl;

    // 3. Together.ai
    const togetherUrl = await generateWithTogether({
        prompt: finalPrompt,
        negativePrompt,
        size,
        seed: seed,
    });

    if (togetherUrl) return togetherUrl;

    // 4. Pollinations
    const pollinationsUrl = await generateWithPollinations({
        prompt: finalPrompt,
        negativePrompt,
        size,
        seed: seed,
    });


    if (pollinationsUrl) return pollinationsUrl;

    // This used to return a random Picsum stock photo. That is not a fallback,
    // it is a wrong answer wearing the costume of a right one: a reel about
    // Maharana Pratap silently shipped a photograph of autumn leaves, and once
    // the file was copied into /uploads nothing downstream could tell it from a
    // real generation.
    //
    // Failing leaves the scene without an image instead. The pipeline records
    // that ("N of M scenes have no image") and a retry regenerates only the
    // missing ones — visibly degraded beats invisibly wrong.
    throw new Error(`All image providers failed for: "${prompt?.slice(0, 60)}"`);
}

async function generateWithReelShorts(args: {
    prompt: string;
    negativePrompt: string;
    size: ImageSize;
    seed?: number;
}): Promise<string | null> {
    const size = fit(args.size, MAX_SIDE.free);

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await fetch("https://reelshorts.in/api/image/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: args.prompt,
                    negative_prompt: args.negativePrompt,
                    settings: {
                        width: size.width,
                        height: size.height,
                        steps: 20, // Lowered from 30 to reduce generation time and avoid 504
                        guidance: 7,
                        output_format: "jpg",
                        seed: args.seed,
                    },
                }),
                signal: AbortSignal.timeout(60000), // Increased from 45s
            });

            if (!res.ok) {
                console.warn(`[ImageGen] ReelShorts failed: ${res.status}`);
                continue;
            }

            const data = await res.json();
            const results = Array.isArray(data) ? data : data.data || [data];
            const url = results[0]?.url || results[0]?.imageUrl || results[0]?.imageURL || data.url;

            if (typeof url === "string" && (await isValidImageUrl(url))) {
                console.log("[ImageGen] ReelShorts success:", url);
                return url;
            }
            console.warn(
                `[ImageGen] ReelShorts attempt ${attempt} returned no usable image:`,
                typeof url === "string" ? url : JSON.stringify(data).slice(0, 200),
            );
        } catch (error) {
            console.warn(`[ImageGen] ReelShorts attempt ${attempt} failed:`, error);
            await sleep(1000 * attempt);
        }
    }
    return null;
}

async function generateWithTogether(args: {
    prompt: string;
    negativePrompt: string;
    size: ImageSize;
    seed?: number;
}): Promise<string | null> {
    const togetherKey = process.env.TOGETHER_API_KEY;
    if (!togetherKey) return null;

    const size = fit(args.size, MAX_SIDE.free);

    try {
        const res = await fetch("https://api.together.xyz/v1/images/generations", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${togetherKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "black-forest-labs/FLUX.1-schnell-Free",
                // Schnell is FLUX too: a bracketed "strictly avoid" list is
                // read as part of the description, not as a prohibition.
                prompt: args.prompt,
                width: size.width,
                height: size.height,
                steps: 4,
                n: 1,
                seed: args.seed,
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) return null;

        const data = await res.json();
        const url = data.data?.[0]?.url;

        if (typeof url === "string" && (await isValidImageUrl(url))) {
            console.log("[ImageGen] Together success:", url);
            return url;
        }
    } catch (error) {
        console.warn("[ImageGen] Together failed:", error);
    }
    return null;
}

async function generateWithPollinations(args: {
    prompt: string;
    negativePrompt: string;
    size: ImageSize;
    seed?: number;
}): Promise<string | null> {
    try {
        const seed = args.seed ?? Math.floor(Math.random() * 1000000);
        const size = fit(args.size, MAX_SIDE.free);
        const safePrompt = args.prompt
            .substring(0, 900)
            .replace(/[\[\]{}|\\^`<>"']/g, "");

        // model=flux, not turbo. Turbo is the fastest and weakest tier
        // Pollinations offers, and it is the last rung of the ladder — so the
        // images a free run actually shipped came from the worst generator
        // available.
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            safePrompt
        )}?width=${size.width}&height=${size.height}&model=flux&nologo=true&enhance=false&seed=${seed}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (res.ok) {
            console.log("[ImageGen] Pollinations success");
            return url;
        }
        console.warn(`[ImageGen] Pollinations failed: ${res.status}`);
    } catch (error) {
        console.warn("[ImageGen] Pollinations failed:", error);
    }
    return null;
}

async function generateWithFal(args: {
    prompt: string;
    negativePrompt: string;
    size: ImageSize;
    seed?: number;
}): Promise<string | null> {
    const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!falKey) return null;

    const size = fit(args.size, MAX_SIDE.fal);

    // The safety checker stays on, but at its default tolerance it rejects
    // ordinary historical subjects — a battlefield, a weapon, an execution —
    // and a rejection arrives as a solid black PNG the pipeline then has to
    // detect and throw away. Raising the tolerance cuts those false positives
    // on a history channel. 1 is strictest, 6 the most permissive.
    const safetyTolerance = process.env.FAL_SAFETY_TOLERANCE || "4";

    try {
        console.log(`[ImageGen] Calling fal.ai Flux.1 [pro] v1.1 at ${size.width}x${size.height}...`);

        const response = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
            method: "POST",
            headers: {
                "Authorization": `Key ${falKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                // No negative prompt: this endpoint has no field for one, and
                // appending it to the positive prompt is how the old code
                // asked every image for the artefacts it meant to forbid.
                prompt: args.prompt,
                image_size: {
                    width: size.width,
                    height: size.height
                },
                // num_inference_steps and guidance_scale were being sent here
                // and silently ignored: v1.1 is a fixed pipeline and takes
                // neither.
                num_images: 1,
                enable_safety_checker: true,
                safety_tolerance: safetyTolerance,
                output_format: "jpeg",
                seed: args.seed,
            }),
            signal: AbortSignal.timeout(90000)
        });

        if (!response.ok) {
            // Fallback to standard pro
            const backupResponse = await fetch("https://fal.run/fal-ai/flux/pro", {
                method: "POST",
                headers: {
                    "Authorization": `Key ${falKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: args.prompt,
                    image_size: {
                        width: size.width,
                        height: size.height
                    },
                    seed: args.seed,
                }),
                signal: AbortSignal.timeout(90000)
            });
            if (backupResponse.ok) {
                const backupData = await backupResponse.json();
                return backupData.images?.[0]?.url || null;
            }
            return null;
        }

        const data = await response.json();
        const url = data.images?.[0]?.url;

        // A flagged image is not an error response — fal returns 200 with a
        // solid black PNG, always the same ~13.5KB of bytes. Taken at face
        // value it is stored as a finished shot, and the reel plays a black
        // frame with narration over it. Returning null instead lets the
        // provider ladder fall through to a generator that will render
        // something.
        if (data.has_nsfw_concepts?.[0] === true) {
            console.warn("[ImageGen] fal.ai flagged this prompt; discarding the blank it returned");
            return null;
        }

        if (typeof url === "string") {
            console.log("[ImageGen] ✅ fal.ai success:", url);
            return url;
        }
    } catch (error) {
        console.warn("[ImageGen] fal.ai error:", error);
    }
    return null;
}