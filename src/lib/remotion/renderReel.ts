import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "fs";
import os from "os";
import path from "path";
import { FacelessReel } from "../../types/series";

/**
 * An empty directory handed to Remotion as its public folder.
 *
 * Remotion copies the public directory into every bundle. Ours holds the
 * rendered MP4s, so each render was duplicating the entire back catalogue —
 * 1.4GB per bundle, several left behind in temp, until the disk filled and
 * rendering failed with ENOSPC. Nothing in the composition uses staticFile();
 * every asset arrives as an absolute URL built from baseHost, so Remotion needs
 * no public directory at all.
 */
function emptyPublicDir(): string {
    const dir = path.join(os.tmpdir(), "reel-factory-empty-public");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

type RenderReelOptions = {
    reelId: string;
    reelData: FacelessReel;
    outputPath: string;
    onProgress?: (progress: number) => void;
};

// Bundling the Remotion project takes 20-60s and the output only depends on
// source files, not on the reel being rendered. It used to run on every single
// render. Cached as a promise so concurrent renders share one bundle instead of
// racing to build several.
let bundlePromise: Promise<string> | null = null;

function getBundle(): Promise<string> {
    if (!bundlePromise) {
        console.log("[Remotion] Bundling project (first render)...");
        bundlePromise = bundle({
            entryPoint: path.join(process.cwd(), "src/index.ts"),
            publicDir: emptyPublicDir(),
        }).catch((err) => {
            // Never cache a failed bundle, or every later render inherits it.
            bundlePromise = null;
            throw err;
        });
    }
    return bundlePromise;
}

/** Drops the cached bundle so the next render picks up source changes. */
export function invalidateBundle() {
    bundlePromise = null;
}

/**
 * Where root-relative media is fetched from during a render.
 *
 * Exported because a render is only as good as this host: nothing local is
 * read off disk, so a caller that can check it first should.
 */
export function assetBaseUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

/**
 * Rewrites root-relative paths to absolute URLs.
 *
 * The headless renderer loads the composition from the bundle's own origin, so
 * "/uploads/x.png" would resolve against the wrong host. Everything the reel
 * references is made absolute against the app's public URL.
 */
function makeAbsolute<T>(value: T, baseUrl: string): T {
    if (typeof value === "string") {
        return (value.startsWith("/") ? `${baseUrl}${value}` : value) as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => makeAbsolute(item, baseUrl)) as T;
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, val]) => [key, makeAbsolute(val, baseUrl)]),
        ) as T;
    }
    return value;
}

export async function renderReelToMp4({
    reelId,
    reelData,
    outputPath,
    onProgress,
}: RenderReelOptions): Promise<string> {
    const baseUrl = assetBaseUrl();
    const absoluteReelData = { ...makeAbsolute(reelData, baseUrl), baseHost: baseUrl };

    const durationMs =
        reelData.actualDuration ||
        reelData.scenes.reduce((acc, s) => acc + (s.durationInSeconds || 0), 0) * 1000;
    const fps = 30;
    const durationInFrames = Math.ceil((Math.max(1, durationMs / 1000)) * fps);

    console.log(
        `[Remotion] Rendering ${reelId}: ${(durationMs / 1000).toFixed(2)}s (${durationInFrames} frames)`,
    );

    const serveUrl = await getBundle();
    const inputProps = { reel: absoluteReelData };

    const composition = await selectComposition({
        serveUrl,
        id: "FacelessReel",
        inputProps,
    });

    await renderMedia({
        composition: { ...composition, durationInFrames },
        serveUrl,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        crf: 18,
        timeoutInMilliseconds: 240000,
        onProgress: ({ progress }) => onProgress?.(progress),
    });

    console.log(`[Remotion] Render complete: ${outputPath}`);
    return outputPath;
}
