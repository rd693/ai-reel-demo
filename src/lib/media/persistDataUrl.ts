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
    dir: "voiceovers" | "uploads" | "renders",
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

    // The old TTS fallback emitted a ~28-byte silent MP3; storing those just
    // recreates the "audio plays but is empty" bug in a new place.
    if (buffer.length < 100) {
        console.warn(`[media] Ignoring ${buffer.length}-byte placeholder payload`);
        return undefined;
    }

    const fileName = `${crypto.randomUUID()}${EXT_BY_MIME[mime] ?? ""}`;
    const targetDir = path.join(PUBLIC_DIR, dir);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, fileName), buffer);

    return `/${dir}/${fileName}`;
}
