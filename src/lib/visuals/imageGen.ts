// export const generateImage = async (prompt: string, style: string): Promise<string> => {
//     const enhancedPrompt = `${prompt}, ${style}, cinematic, photorealistic, no text, no watermark`;

//     // 1. ReelShorts API (Strict Priority — Fastest + High Quality)
//     for (let attempt = 1; attempt <= 2; attempt++) {
//         try {
//             console.log(`[ImageGen] ReelShorts attempt ${attempt}...`);
//             const res = await fetch("https://reelshorts.in/api/image/generate", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     prompt: enhancedPrompt,
//                     settings: { width: 576, height: 1024, steps: 25, guidance: 7 }
//                 }),
//                 signal: AbortSignal.timeout(30000) // Increased to 30s for stability
//             });

//             if (res.ok) {
//                 const data = await res.json();
//                 const results = Array.isArray(data) ? data : (data.data || [data]);
//                 const url = results[0]?.url || results[0]?.imageUrl || data.url;

//                 if (url) {
//                     console.log(`[ImageGen] ✅ ReelShorts success: ${url}`);
//                     return url;
//                 }
//             }
//         } catch (e) {
//             console.warn(`[ImageGen] ReelShorts attempt ${attempt} failed:`, e);
//             if (attempt === 2) break;
//             await new Promise(r => setTimeout(r, 1000)); // Short backoff
//         }
//     }

//     // 2. Together.ai FLUX schnell (secondary — ~3-5s, free credits)
//     const togetherKey = process.env.TOGETHER_API_KEY;
//     if (togetherKey) {
//         try {
//             const res = await fetch("https://api.together.xyz/v1/images/generations", {
//                 method: "POST",
//                 headers: {
//                     "Authorization": `Bearer ${togetherKey}`,
//                     "Content-Type": "application/json"
//                 },
//                 body: JSON.stringify({
//                     model: "black-forest-labs/FLUX.1-schnell-Free",
//                     prompt: enhancedPrompt,
//                     width: 576,
//                     height: 1024,
//                     steps: 4,
//                     n: 1
//                 }),
//                 signal: AbortSignal.timeout(20000)
//             });
//             if (res.ok) {
//                 const data = await res.json();
//                 const url = data.data?.[0]?.url;
//                 if (url) {
//                     console.log(`[ImageGen] ✅ Together.ai success`);
//                     return url;
//                 }
//             }
//         } catch (e) {
//             console.warn("[ImageGen] Together.ai failed:", e);
//         }
//     }

//     // 3. Pollinations turbo (tertiary — free, no key, ~10-15s with turbo)
//     try {
//         const seed = Math.floor(Math.random() * 1000000);
//         const safePrompt = enhancedPrompt
//             .substring(0, 400)
//             .replace(/[\[\]{}|\\^`<>"']/g, '');

//         const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=576&height=1024&model=turbo&nologo=true&enhance=false&seed=${seed}`;

//         // Fetch the actual image with a timeout
//         const res = await fetch(url, {
//             signal: AbortSignal.timeout(25000)
//         });

//         if (res.ok) {
//             console.log(`[ImageGen] ✅ Pollinations turbo success`);
//             return url;
//         }
//     } catch (e) {
//         console.warn("[ImageGen] Pollinations failed:", e);
//     }

//     // 4. Last resort placeholder
//     console.warn("[ImageGen] All providers failed, using placeholder");
//     const seed = Math.floor(Math.random() * 1000);
//     return `https://picsum.photos/seed/${seed}/576/1024`;
// };


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

const IMAGE_SIZES: Record<NonNullable<GenerateImageOptions["aspect"]>, ImageSize> = {
    reel: { width: 768, height: 1344 },
    square: { width: 1024, height: 1024 },
    landscape: { width: 1344, height: 768 },
};

const STYLE_MODIFIERS: Record<string, string[]> = {
    cinematic_3d: ["unreal engine 5.4 render", "octane render 2024", "cinematic global illumination", "high dynamic range", "ray tracing", "3d masterpiece", "hyper-detailed textures", "volumetric atmosphere"],
    anime: ["modern high-end anime style", "makoto shinkai and coix style", "vibrant color grading", "intricate line art", "soft cinematic cel shading", "4k japanese animation", "scenic background detail"],
    pixar: ["disney pixar 2024 style", "subsurface scattering", "soft rounded 3d forms", "vivid cinematic colors", "playful character design", "rendered in renderman", "masterpiece animation"],
    oil_painting: ["masterpiece oil painting", "heavy impasto technique", "thick textured brushstrokes", "classical museum quality", "rich oil color palette", "dramatic chiaroscuro", "fine art canvas"],
    watercolor: ["ethereal fluid watercolor", "professional wet-on-wet technique", "delicate paper texture", "artistic ink bleeds", "vibrant washes", "hand-painted masterpiece"],
    vintage_photography: ["authentic 1970s film stock", "kodachrome 64 aesthetic", "heavy film grain", "vintage lens flare", "nostalgic color science", "slight chromatic aberration", "analog photography"],
    digital_art: ["high-end digital illustration", "artstation trending", "concept art masterpiece", "smooth color transitions", "sharp clean edges", "detailed digital painting", "wacom cintiq style"],
    cyberpunk: ["neo-tokyo cyberpunk aesthetic", "vibrant neon signage", "dystopian futuristic city", "rain-slicked streets", "bioluminescent accents", "cinematic teal and orange lighting"],
    realistic: ["hyper-realistic 8k photography", "shot on Sony A7R V", "100mm macro lens", "extremely detailed skin pores", "natural sunlight", "photorealistic masterpiece", "highly detailed textures"],
    noir: ["classic film noir aesthetic", "high contrast monochrome", "dramatic venetian blind shadows", "smoke and mirrors", "moody detective aesthetic", "4k black and white film grain"]
};

function buildEnhancedPrompt(prompt: string, style: string = "cinematic_3d"): string {
    const modifiers = STYLE_MODIFIERS[style] || [style];

    return [
        prompt,
        ...modifiers,
        "one single cinematic scene", // Strengthened
        "single focus point",         // New
        "no split screen",            // New
        "no collage",                 // New
        "high dynamic range",
        "8k resolution",
        "professional color grading",
        "masterpiece quality",
        "intricate details",
        "no text",
        "no watermark",
    ]
        .filter(Boolean)
        .join(", ");
}

function buildNegativePrompt(): string {
    return [
        "collage",
        "split screen",
        "multiple panels",
        "multiple images",
        "grid of images",
        "extra limbs",
        "extra hands",
        "extra fingers",
        "human body parts merging with animal body parts",
        "montage",
        "diptych",
        "triptych",
        "low quality",
        "blurry",
        "distorted",
        "bad anatomy",
        "text",
        "logo",
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

    const enhancedPrompt = buildEnhancedPrompt(prompt, style);
    const negativePrompt = buildNegativePrompt();

    // 1. Fal.ai (Primary Premium)
    if (usePremium) {
        const falUrl = await generateWithFal({
            prompt: enhancedPrompt,
            negativePrompt, 
            size,
            seed: seed,
        });

        if (falUrl) return falUrl;
        console.warn("[ImageGen] Premium Fal.ai failed, falling back to free stack");
    }

    // 2. ReelShorts
    const reelShortsUrl = await generateWithReelShorts({
        prompt: enhancedPrompt,
        negativePrompt,
        size,
        seed: seed,
    });

    if (reelShortsUrl) return reelShortsUrl;

    // 3. Together.ai
    const togetherUrl = await generateWithTogether({
        prompt: enhancedPrompt,
        negativePrompt,
        size,
        seed: seed,
    });

    if (togetherUrl) return togetherUrl;

    // 4. Pollinations
    const pollinationsUrl = await generateWithPollinations({
        prompt: enhancedPrompt,
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
                        width: args.size.width,
                        height: args.size.height,
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

    try {
        const res = await fetch("https://api.together.xyz/v1/images/generations", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${togetherKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "black-forest-labs/FLUX.1-schnell-Free",
                // For Together Flux, we append the negative constraints directly
                prompt: `${args.prompt} [Strictly avoid: ${args.negativePrompt}]`,
                width: args.size.width,
                height: args.size.height,
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
        const safePrompt = `${args.prompt}. Strictly no ${args.negativePrompt.split(',')[0]}`
            .substring(0, 900)
            .replace(/[\[\]{}|\\^`<>"']/g, "");

        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            safePrompt
        )}?width=${args.size.width}&height=${args.size.height}&model=turbo&nologo=true&enhance=false&seed=${seed}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (res.ok) {
            console.log("[ImageGen] Pollinations success");
            return url;
        }
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

    try {
        console.log(`[ImageGen] Calling fal.ai Flux.1 [pro] v1.1...`);
        // We append negative prompt to the main prompt for Flux models that don't have a separate field
        const finalPrompt = `${args.prompt}. Negative: ${args.negativePrompt}`;

        const response = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
            method: "POST",
            headers: {
                "Authorization": `Key ${falKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt: finalPrompt,
                image_size: {
                    width: args.size.width,
                    height: args.size.height
                },
                num_inference_steps: 25,
                guidance_scale: 3.5,
                num_images: 1,
                enable_safety_checker: true,
                output_format: "jpeg",
                seed: args.seed,
            }),
            signal: AbortSignal.timeout(60000)
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
                    prompt: finalPrompt,
                    image_size: {
                        width: args.size.width,
                        height: args.size.height
                    }
                }),
                signal: AbortSignal.timeout(60000)
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