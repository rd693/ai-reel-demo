import fs from "fs/promises";
import path from "path";

const MUSIC_DIR = path.join(process.cwd(), "public", "music");

/**
 * ElevenLabs' sound-generation cap. Long enough for a bed that the composition
 * loops seamlessly (`loop` is set on the background <Audio>), so a 22s track
 * covers a reel of any length.
 */
const MAX_SFX_SECONDS = 22;

export type GeneratedTrack = {
    id: string;
    name: string;
    url: string;
    prompt: string;
    source: "music" | "sound-generation";
};

function slugify(prompt: string): string {
    return (
        prompt
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "track"
    );
}

/**
 * Generates an original background track and saves it to public/music.
 *
 * Two endpoints, in preference order:
 *
 *  - /v1/music writes an actual composition at the requested length. It needs
 *    the `music_generation` permission on the API key, which is off by default,
 *    so it 401s until that is enabled in the ElevenLabs dashboard.
 *  - /v1/sound-generation is permitted on a default key and returns up to 22s.
 *    Asked for a seamless loop it makes a usable ambient bed, which the
 *    composition already loops for the length of the reel.
 *
 * The point of generating rather than downloading: the track is made for this
 * channel and is not somebody else's catalogue recording. The bundled
 * "royalty free" mp3s that shipped with this app turned out to be SoundHelix
 * demo songs and drew a Content ID claim that blocked a published Short.
 */
export async function generateMusic(
    prompt: string,
    durationSeconds = MAX_SFX_SECONDS,
): Promise<GeneratedTrack> {
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) throw new Error("ELEVEN_LABS_API_KEY is not set");

    let audio: Buffer | null = null;
    let source: GeneratedTrack["source"] = "music";

    // 1. Full music composition, when the key is allowed to use it.
    const musicRes = await fetch("https://api.elevenlabs.io/v1/music", {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
            prompt,
            music_length_ms: Math.round(durationSeconds * 1000),
        }),
    });

    if (musicRes.ok) {
        audio = Buffer.from(await musicRes.arrayBuffer());
    } else {
        const detail = await musicRes.text();
        if (musicRes.status === 401 && detail.includes("music_generation")) {
            console.warn(
                "[music] API key lacks the music_generation permission — enable it in the ElevenLabs dashboard for full-length composition. Using sound-generation for now.",
            );
        } else {
            console.warn(`[music] /v1/music failed (${musicRes.status}); using sound-generation.`);
        }

        // 2. Loopable ambient bed.
        const sfxRes = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
            method: "POST",
            headers: { "xi-api-key": apiKey, "content-type": "application/json" },
            body: JSON.stringify({
                text: `${prompt}, seamless loop, background bed, no vocals`,
                duration_seconds: Math.min(durationSeconds, MAX_SFX_SECONDS),
                loop: true,
            }),
        });

        if (!sfxRes.ok) {
            throw new Error(`Sound generation failed: ${sfxRes.status} ${await sfxRes.text()}`);
        }
        audio = Buffer.from(await sfxRes.arrayBuffer());
        source = "sound-generation";
    }

    if (!audio || audio.length < 4096) {
        throw new Error("Generator returned no usable audio");
    }

    const id = `${slugify(prompt)}-${Date.now().toString(36)}`;
    await fs.mkdir(MUSIC_DIR, { recursive: true });
    await fs.writeFile(path.join(MUSIC_DIR, `${id}.mp3`), audio);

    console.log(`[music] Generated "${prompt}" via ${source} (${audio.length} bytes)`);

    return { id, name: prompt, url: `/music/${id}.mp3`, prompt, source };
}

/**
 * Every mp3 in public/music — generated tracks and any licensed files dropped
 * in by hand. Reading the directory means the library is whatever is actually
 * on disk, rather than a hardcoded list that can name a file that is gone.
 */
export async function listMusicTracks(): Promise<{ id: string; name: string; url: string }[]> {
    try {
        const files = await fs.readdir(MUSIC_DIR);
        return files
            .filter((f) => f.toLowerCase().endsWith(".mp3"))
            .sort()
            .map((file) => {
                const id = file.replace(/\.mp3$/i, "");
                return {
                    id,
                    // Strip the generated timestamp suffix for display.
                    name: id.replace(/-[a-z0-9]{6,}$/i, "").replace(/-/g, " "),
                    url: `/music/${file}`,
                };
            });
    } catch {
        return [];
    }
}
