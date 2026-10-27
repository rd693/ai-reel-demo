import "./env";

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "fs";
import os from "os";
import path from "path";

import type { CardSpec } from "../src/compositions/cards/cardSpec";
import { generateImage } from "../src/lib/visuals/imageGen";
import { persistMedia } from "../src/lib/media/persistDataUrl";

/**
 * Renders one still per sample card, so a deck can be judged before a reel is
 * built on it: `npm run cards`.
 *
 * The app has to be running (`npm run dev`) for the same reason a reel render
 * does — the page pulls its fonts and its illustration over HTTP, and the
 * renderer is handed an empty public directory on purpose.
 *
 * Illustrations are generated once and cached under public/uploads. Re-running
 * this to tune a margin does not re-bill the image provider.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "public", "card-samples");

/**
 * The illustrations these pages need.
 *
 * Worth reading as a spec in itself: the prompt asks for a specimen on a plain
 * background, not a scene. The page supplies the paper, the light and the
 * composition — if the image brings its own, the two fight and the result is
 * the full-bleed look this system exists to get away from.
 */
const PLATES: Record<string, string> = {
    wasp: "a single emerald jewel wasp specimen, lateral view, wings spread, antique scientific engraving, halftone print, clean plain off-white background",
    roach: "a single cockroach specimen, lateral view, antique entomological engraving, halftone print, clean plain off-white background",
};

async function plate(name: string): Promise<string> {
    const cached = path.join(process.cwd(), "public", "uploads", `card-plate-${name}.png`);
    if (fs.existsSync(cached)) return `/uploads/card-plate-${name}.png`;

    console.log(`[cards] generating plate "${name}"`);
    const url = await generateImage({
        prompt: PLATES[name],
        style: "vintage scientific illustration, engraved linework, muted ink",
        usePremium: true,
    });
    const stored = await persistMedia(url, "uploads");
    if (!stored) throw new Error(`could not store plate ${name}`);
    fs.copyFileSync(path.join(process.cwd(), "public", stored), cached);
    return `/uploads/card-plate-${name}.png`;
}

type Sample = { name: string; deckId: string; spec: CardSpec };

async function samples(): Promise<Sample[]> {
    const wasp = await plate("wasp");
    const roach = await plate("roach");

    return [
        {
            name: "01-specimen",
            deckId: "field-notebook",
            spec: {
                kind: "specimen",
                figure: 1,
                lines: ["AN", "INSECT"],
                imageUrl: wasp,
                tag: { title: "SPECIMEN 01", subtitle: "AMPULEX COMPRESSA" },
            },
        },
        {
            name: "02-statement",
            deckId: "field-notebook",
            spec: {
                kind: "statement",
                figure: 2,
                lines: ["IT WON'T", "KILL"],
                accentLines: [1],
                imageUrl: roach,
            },
        },
        {
            name: "03-diagram",
            deckId: "field-notebook",
            spec: {
                kind: "diagram",
                figure: 4,
                lines: ["VENOM"],
                accentLines: [0],
                imageUrl: wasp,
                annotation: { label: "STINGER", at: { x: 72, y: 58 }, from: { x: 44, y: 66 } },
                sidenote: "AMPULEX COMPRESSA · LATERAL",
            },
        },
        {
            name: "04-list",
            deckId: "field-notebook",
            spec: {
                kind: "list",
                figure: 3,
                lines: ["OPTIONS"],
                imageUrl: roach,
                items: [
                    { text: "Kill it?", struck: true },
                    { text: "Carry it?", struck: true },
                ],
            },
        },
        {
            name: "05-xray",
            deckId: "field-notebook",
            spec: {
                kind: "xray",
                figure: 5,
                lines: ["ONE EXACT", "SPOT"],
                accentLines: [1],
                imageUrl: roach,
                annotation: { label: "", at: { x: 50, y: 52 } },
                sidenote: "PERIPLANETA AMERICANA · DORSAL",
            },
        },
        {
            name: "06-manuscript-specimen",
            deckId: "manuscript",
            spec: {
                kind: "specimen",
                figure: 1,
                lines: ["समुद्र", "मंथन"],
                accentLines: [1],
                imageUrl: "/uploads/64f57322-b60c-4c9c-afd0-ae9589da67ec.jpg",
                tag: { title: "दृश्य ०१", subtitle: "क्षीरसागर" },
            },
        },
        {
            name: "07-manuscript-statement",
            deckId: "manuscript",
            spec: {
                kind: "statement",
                figure: 7,
                lines: ["अमृत के", "लिए"],
                accentLines: [1],
            },
        },
    ];
}

async function main() {
    const reachable = await fetch(`${BASE_URL}/fonts/fonts.css`)
        .then((res) => res.ok)
        .catch(() => false);
    if (!reachable) {
        console.error(
            `Cannot fetch ${BASE_URL}/fonts/fonts.css — start "npm run dev" first.\n` +
                `The page loads its fonts and illustrations over HTTP, exactly as a reel render does.`,
        );
        process.exit(1);
    }

    const cards = await samples();
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Remotion copies the public directory into every bundle, and ours holds
    // the rendered MP4s — the same trap renderReel.ts documents.
    const emptyPublic = path.join(os.tmpdir(), "reel-factory-empty-public");
    fs.mkdirSync(emptyPublic, { recursive: true });

    console.log("[cards] bundling...");
    const serveUrl = await bundle({
        entryPoint: path.join(process.cwd(), "src/index.ts"),
        publicDir: emptyPublic,
    });

    for (const sample of cards) {
        const inputProps = { deckId: sample.deckId, spec: sample.spec, baseHost: BASE_URL };
        const composition = await selectComposition({ serveUrl, id: "CardSample", inputProps });
        const output = path.join(OUT_DIR, `${sample.name}.png`);
        await renderStill({
            composition,
            serveUrl,
            output,
            inputProps,
            imageFormat: "png",
            // Late enough that every entrance has settled: a still taken at
            // frame 0 shows an empty page, which says nothing about the design.
            frame: 48,
        });
        console.log(`[cards] ${sample.name} → ${output}`);
    }

    console.log(`\n${cards.length} cards in ${OUT_DIR}`);
}

main().catch((error) => {
    console.error("[cards] failed:", error);
    process.exit(1);
});
