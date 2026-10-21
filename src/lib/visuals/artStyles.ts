/**
 * The look of a reel, as a clause an image model can act on.
 *
 * This map used to live in llm.ts, where it was appended to every visual
 * prompt the writer produced — and imageGen.ts kept a *second*, unrelated map
 * keyed by names like "pixar" and "oil_painting" that are not in the ArtStyle
 * union at all. For 14 of the 16 real styles that lookup missed, fell back to
 * `[style]`, and sent the bare word "mythology" as the entire style
 * instruction, on top of the clause the writer had already added.
 *
 * One map, one source of truth, applied once.
 *
 * The clauses deliberately carry no "no text" tail. Every generator in the
 * ladder is a FLUX-family model conditioned by T5, which has no negative
 * channel: "no text" is simply the tokens "no" and "text", and asking for them
 * is a reliable way to get lettering in the picture. The "single scene" and
 * "single figure" phrases stay, because those are positive instructions and
 * they are what actually fights a collage.
 */
export const ART_STYLE_PROMPTS: Record<string, string> = {
    watercolor_illustration: "watercolor illustration, soft painterly washes, muted palette, loose brushstrokes, single image",
    comic: "bold comic book art, thick black outlines, flat vivid colors, single frame",
    creepy_comic: "dark horror comic art, heavy ink shadows, distorted expressions, unsettling, single image",
    modern_cartoon: "modern cartoon style, clean vector lines, vibrant saturated colors, expressive, single character",
    disney: "Disney animation style, warm lighting, expressive eyes, cinematic composition, single character",
    mythology: "Indian mythology painting, ornate temple art style, gold divine light, rich jewel tones, single scene",
    pixel_art: "pixel art, 16-bit retro game style, limited palette, crisp pixels, individual character",
    ghibli: "Studio Ghibli style, soft watercolor backgrounds, lush nature detail, warm gentle light, single frame",
    anime: "anime illustration, detailed character art, dynamic pose, cinematic lighting, individual",
    painting: "classical oil painting, rich textures, dramatic chiaroscuro, old master style, single scene",
    dark_fantasy: "dark fantasy digital art, moody shadows, epic scale, dramatic atmosphere, single image",
    lego: "LEGO minifigure style, plastic toy aesthetic, bright primary colors, blocky, single figure",
    polaroid: "polaroid photo style, slightly faded, warm vintage grain, candid documentary feel, single shot",
    realism: "photorealistic, 8K detail, cinematic photography, sharp focus, dramatic lighting, single scene",
    fantastic: "fantastical illustration, magical realism, surreal dreamlike colors, epic, single frame",
    cinematic_3d: "cinematic 3D render, volumetric lighting, ultra detailed, film quality, single individual",
};

export const DEFAULT_ART_STYLE = "watercolor_illustration";

/** The clause for a style, falling back to the default rather than to nothing. */
export function styleClause(style?: string | null): string {
    if (!style) return ART_STYLE_PROMPTS[DEFAULT_ART_STYLE];
    return ART_STYLE_PROMPTS[style] ?? ART_STYLE_PROMPTS[DEFAULT_ART_STYLE];
}

/**
 * Whether a prompt already carries this style's clause.
 *
 * The writer adds it, so by the time a prompt reaches the image stage it is
 * usually already there. Matching on the first few words is enough and
 * survives the trimming the writer does to stay inside its character cap.
 */
export function hasStyleClause(prompt: string, clause: string): boolean {
    const head = clause.split(",").slice(0, 2).join(",").trim().toLowerCase();
    return head.length > 0 && prompt.toLowerCase().includes(head);
}
