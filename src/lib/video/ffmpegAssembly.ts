import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { FacelessReel } from "../../types/series";

const execPromise = promisify(exec);

// Path to a font that supports Hindi/Devanagari on macOS
const HINDI_FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";

interface FFmpegOptions {
    format: "reel" | "video"; // 9:16 vs 16:9
    musicUrl?: string;
    logoUrl?: string;
    introText?: string;
}

/**
 * FFmpeg Video Assembler (Pro Edition)
 * Advanced pipeline for professional Reels and Videos.
 */
export async function assembleWithFFmpeg(
    reel: FacelessReel, 
    options: FFmpegOptions = { format: "reel" }
): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `reel-pro-${reel.id || 'new'}-${Date.now()}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const width = options.format === "reel" ? 1080 : 1920;
    const height = options.format === "reel" ? 1920 : 1080;

    console.log(`[FFmpeg] Assembling Pro ${options.format} (${width}x${height}) in ${tmpDir}`);

    try {
        const sceneVideos: string[] = [];

        // 1. Download Background Music
        const musicPath = path.join(tmpDir, 'bg_music.mp3');
        if (options.musicUrl) {
            await downloadAsset(options.musicUrl, musicPath);
        }

        // 2. Download Logo
        const logoPath = path.join(tmpDir, 'logo.png');
        if (options.logoUrl) {
            await downloadAsset(options.logoUrl, logoPath);
        }

        // 3. Process each scene
        for (let i = 0; i < reel.scenes.length; i++) {
            const scene = reel.scenes[i];
            const sceneImgPath = path.join(tmpDir, `scene-${i}.jpg`);
            const sceneAudioPath = path.join(tmpDir, `audio-${i}.mp3`);
            const sceneVideoPath = path.join(tmpDir, `scene-${i}.mp4`);

            if (scene.backgroundUrl) {
                await downloadAsset(scene.backgroundUrl, sceneImgPath);
            }
            
            const voiceoverUrl = (scene as any).voiceoverUrl;
            if (voiceoverUrl) {
                if (voiceoverUrl.startsWith('data:')) {
                    const base64Data = voiceoverUrl.split(',')[1];
                    fs.writeFileSync(sceneAudioPath, Buffer.from(base64Data, 'base64'));
                } else {
                    await downloadAsset(voiceoverUrl, sceneAudioPath);
                }
            }

            const duration = scene.durationInSeconds || 5;
            const caption = (scene.headline || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
            
            // Smart Caption Splitting for better sync (approximate)
            const words = caption.split(' ');
            const midPoint = Math.ceil(words.length / 2);
            const part1 = words.slice(0, midPoint).join(' ');
            const part2 = words.slice(midPoint).join(' ');

            // Pro Filters: Ken Burns + Cinematic Color + Stylized Captions
            const filterChain = [
                // Resize & Zoom
                `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
                `zoompan=z='min(zoom+0.001,1.5)':d=${duration * 30}:s=${width}x${height}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
                // Cinematic Vignette
                `vignette='angle=PI/4':eval=init`,
                // Fade transitions
                `fade=t=in:st=0:d=0.5,fade=t=out:st=${duration - 0.5}:d=0.5`,
                // Multi-part Captions for better sync feel
                `drawtext=text='${part1}':fontfile='${HINDI_FONT_PATH}':fontcolor=yellow:fontsize=${width / 11}:x=(w-text_w)/2:y=h-(h/3):enable='between(t,0,${duration/2})':shadowcolor=black@0.8:shadowx=6:shadowy=6:box=1:boxcolor=black@0.4:boxborderw=15`,
                `drawtext=text='${part2}':fontfile='${HINDI_FONT_PATH}':fontcolor=white:fontsize=${width / 11}:x=(w-text_w)/2:y=h-(h/3):enable='between(t,${duration/2},${duration})':shadowcolor=black@0.8:shadowx=6:shadowy=6:box=1:boxcolor=black@0.4:boxborderw=15`
            ];

            // Add Watermark if exists
            let watermarkInput = "";
            if (fs.existsSync(logoPath)) {
                watermarkInput = `-i ${logoPath}`;
                filterChain.push(`[0:v][1:v]overlay=W-w-50:50[v]`);
            } else {
                filterChain.push(`[0:v]copy[v]`);
            }

            const audioInput = fs.existsSync(sceneAudioPath) ? `-i ${sceneAudioPath}` : "";
            
            let audioInputIndex = 1;
            if (fs.existsSync(logoPath)) {
                audioInputIndex++;
            }

            const finalAudioMapping = fs.existsSync(sceneAudioPath) 
                ? `-map ${audioInputIndex}:a` 
                : `-f lavfi -i anullsrc=r=44100:cl=mono -map ${audioInputIndex}:a`;

            // Pro Render: H.264 High Profile, 30fps
            const sceneCmd = `ffmpeg -y -loop 1 -t ${duration} -i ${sceneImgPath} ${watermarkInput} ${audioInput} ${finalAudioMapping} -filter_complex "${filterChain.join(',')}" -map "[v]" -c:v libx264 -profile:v high -preset faster -crf 20 -pix_fmt yuv420p -r 30 ${sceneVideoPath}`;
            
            console.log(`[FFmpeg] Rendering pro scene ${i}`);
            await execPromise(sceneCmd);
            sceneVideos.push(sceneVideoPath);
        }

        // 4. Concatenate scenes
        const listFile = path.join(tmpDir, 'list.txt');
        fs.writeFileSync(listFile, sceneVideos.map(v => `file '${v}'`).join('\n'));

        const tempFinal = path.join(tmpDir, 'temp_final.mp4');
        await execPromise(`ffmpeg -y -f concat -safe 0 -i ${listFile} -c copy ${tempFinal}`);

        // 5. Mix Background Music (Ducked)
        const finalOutputFile = path.join(tmpDir, 'output_pro.mp4');
        if (fs.existsSync(musicPath)) {
            const mixCmd = `ffmpeg -y -i ${tempFinal} -i ${musicPath} -filter_complex "[1:a]volume=0.15,aloop=loop=-1:size=2e+09[bg];[0:a][bg]amix=inputs=2:duration=first" -c:v copy -c:a aac -shortest ${finalOutputFile}`;
            console.log(`[FFmpeg] Mixing background music`);
            await execPromise(mixCmd);
        } else {
            fs.renameSync(tempFinal, finalOutputFile);
        }

        return finalOutputFile;
    } catch (error) {
        console.error("[FFmpeg] Pro Assembly failed:", error);
        throw error;
    }
}

async function downloadAsset(url: string, dest: string) {
    if (!url) return;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${url}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(dest, buffer);
    } catch (e) {
        console.warn(`[FFmpeg] Asset download failed for ${url}`);
    }
}
