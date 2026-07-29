import fs from "fs/promises";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

const EXT_BY_MIME: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
};

export type MediaDir = "voiceovers" | "uploads" | "renders";

async function writeToPublic(buffer: Buffer, dir: MediaDir, mime: string): Promise<string> {
    const fileName = `${crypto.randomUUID()}${EXT_BY_MIME[mime] ?? ""}`;
    const targetDir = path.join(PUBLIC_DIR, dir);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, fileName), buffer);
    return `/${dir}/${fileName}`;
}

/**
 * Writes a `data:` URL to public/<dir> and returns its public path.
 *
 * Inlined base64 media is what filled the old localStorage quota, and it also
 * bloats every DB row and API response that carries it. Anything entering
 * persistence goes through here first.
 *
 * Values that are not data URLs are returned unchanged, so callers can pass a
 * mix of remote URLs, existing paths and data URLs without branching.
 */
export async function persistDataUrl(
    value: string | undefined | null,
    dir: MediaDir,
    { minBytes = 100 }: { minBytes?: number } = {},
): Promise<string | undefined> {
    if (!value) return undefined;
    if (!value.startsWith("data:")) return value;

    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
    if (!match) {
        console.warn("[media] Unparseable data URL, dropping");
        return undefined;
    }

    const [, mime, isBase64, payload] = match;
    const buffer = isBase64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf-8");

    // TTS providers here return a hardcoded silent MP3 on failure rather than
    // throwing, so size is the only signal that the "audio" is really an error.
    // Callers that know what a plausible payload looks like raise the floor.
    if (buffer.length < minBytes) {
        console.warn(`[media] Ignoring ${buffer.length}-byte payload (minimum ${minBytes})`);
        return undefined;
    }

    return writeToPublic(buffer, dir, mime);
}

/**
 * Brings any media reference onto local disk: data URLs are decoded, http(s)
 * URLs are downloaded, existing local paths are left alone.
 *
 * Generated images come back as URLs on someone else's host (fal, Pollinations,
 * Picsum). Keeping only the URL means a reel silently loses its visuals when
 * that host expires the file, and every render depends on the network. Copying
 * the bytes once at generation time avoids both.
 *
 * Falls back to the original value if the download fails, so a transient
 * network error degrades to the old behaviour instead of losing the scene.
 */
export async function persistMedia(
    value: string | undefined | null,
    dir: MediaDir,
): Promise<string | undefined> {
    if (!value) return undefined;
    if (value.startsWith("data:")) return persistDataUrl(value, dir);
    if (!/^https?:\/\//i.test(value)) return value;

    try {
        const res = await fetch(value);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 100) throw new Error(`${buffer.length}-byte response`);

        const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
        return await writeToPublic(buffer, dir, mime);
    } catch (e) {
        console.warn(`[media] Could not download ${value.slice(0, 60)}: ${e}`);
        return value;
    }
}
