/**
 * Checks that an MP4 appears without anyone clicking Export.
 *
 * Rendering was the one stage that only ever started from the reel page, so an
 * unattended overnight run left finished scenes and no video. This drives the
 * real thing — runSchedulerTick and runRenderJob against real Remotion — using
 * generated shot images, so it needs no API keys at all: `npm run check:render`.
 *
 * It does need the app running (`npm run dev`), because the headless renderer
 * fetches every shot over HTTP from NEXT_PUBLIC_SITE_URL.
 *
 * Everything it writes goes to a throwaway database and is deleted afterwards.
 * The finished MP4s are left behind on purpose — they are the point.
 */
import { CHECK_DB } from "./check-render-env";

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import zlib from "zlib";

import { prisma } from "../src/lib/db/client";
import { reelRepo } from "../src/lib/db/reelRepo";
import {
    failAbandonedRenders,
    startRenderJob,
    type StartRenderResult,
} from "../src/lib/remotion/runRenderJob";
import { reelsAwaitingRender, runSchedulerTick } from "../src/lib/scheduler/tick";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_PREFIX = "/uploads/check-render";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
    if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
    else { failures++; console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── A shot image, without pulling in an image library ────────────────────────

function chunk(type: string, data: Buffer): Buffer {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([head, body, crc]);
}

/** A solid-colour PNG at reel resolution. Deflates to a couple of KB. */
function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (stride + 1);
        raw[row] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            raw[row + 1 + x * 3] = rgb[0];
            raw[row + 2 + x * 3] = rgb[1];
            raw[row + 3 + x * 3] = rgb[2];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

const written: string[] = [];
function writeShot(name: string, rgb: [number, number, number]): string {
    const publicPath = `${UPLOAD_PREFIX}-${name}.png`;
    const file = path.join(PUBLIC_DIR, publicPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, solidPng(1080, 1920, rgb));
    written.push(file);
    return publicPath;
}

// ── Seeding ──────────────────────────────────────────────────────────────────

const SHOT_SECONDS = 0.8; // Short on purpose: this checks plumbing, not pacing.

async function seedSeries(): Promise<string> {
    const series = await prisma.series.create({
        data: {
            name: "Render queue check",
            niche: "render queue check",
            // Manual, so the tick never tries to generate anything and the
            // render pass is the only thing under test.
            frequency: "manual",
            artStyle: "cinematic",
            voiceId: "check",
            musicSettings: JSON.stringify({ enabled: false, trackId: "", volume: 0 }),
            captionStyle: JSON.stringify({
                type: "word",
                animation: "pop",
                color: "#FFD700",
                fontSize: 120,
                fontFamily: "Inter",
                boxEnabled: true,
            }),
        },
    });
    return series.id;
}

/** A reel as the pipeline leaves it: every shot has an image, nothing rendered. */
async function seedReel(seriesId: string, label: string, rgb: [number, number, number]) {
    const shots = [rgb, [rgb[2], rgb[0], rgb[1]] as [number, number, number]];
    const reel = await reelRepo.create({
        seriesId,
        businessName: label,
        script: "Shot one. Shot two.",
        generationStatus: "completed",
        actualDuration: shots.length * SHOT_SECONDS * 1000,
        musicSettings: { enabled: false, trackId: "", volume: 0 },
        scenes: shots.map((colour, i) => ({
            id: `${label}-${i}`,
            type: "hook",
            headline: `Shot ${i + 1}`,
            narrationText: `Shot ${i + 1}`,
            durationInSeconds: SHOT_SECONDS,
            backgroundUrl: writeShot(`${label}-${i}`, colour),
            backgroundType: "image",
            startMs: i * SHOT_SECONDS * 1000,
            endMs: (i + 1) * SHOT_SECONDS * 1000,
        })),
    });
    return reel.id!;
}

// ── Watching the rows change ─────────────────────────────────────────────────

const transitions = new Map<string, string[]>();
let maxConcurrentRenders = 0;

/**
 * The job row is the whole point of the design — a finished MP4 has to be
 * discoverable after a crash — so the check watches the rows rather than
 * trusting the return value.
 */
async function sample() {
    const jobs = await prisma.renderJob.findMany({ select: { id: true, status: true } });
    maxConcurrentRenders = Math.max(
        maxConcurrentRenders,
        jobs.filter((job) => job.status === "processing").length,
    );
    for (const job of jobs) {
        const seen = transitions.get(job.id) ?? [];
        if (seen[seen.length - 1] !== job.status) seen.push(job.status);
        transitions.set(job.id, seen);
    }
}

/** The job a start claimed, or null when it never got that far. */
function claimedJob(result: StartRenderResult) {
    return result.outcome === "started" || result.outcome === "in-flight" ? result.job : null;
}

/** How a job's status actually moved, as the watcher saw it. */
function walk(jobId: string | null | undefined): string {
    return (transitions.get(jobId ?? "") ?? []).join(" → ");
}

function renderedFile(outputPath: string | null | undefined): number {
    if (!outputPath) return -1;
    try {
        return fs.statSync(path.join(PUBLIC_DIR, outputPath)).size;
    } catch {
        return -1;
    }
}

// ── The run ──────────────────────────────────────────────────────────────────

async function main() {
    console.log(`database ${CHECK_DB}`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: CHECK_DB },
        stdio: "pipe",
    });

    const probe = writeShot("probe", [20, 20, 20]);
    const reachable = await fetch(`${BASE_URL}${probe}`)
        .then((res) => res.ok)
        .catch(() => false);
    if (!reachable) {
        console.error(
            `\nCannot fetch ${BASE_URL}${probe}. The headless renderer loads every shot over\n` +
                `HTTP, so the app has to be running: start "npm run dev" and try again.`,
        );
        process.exit(1);
    }
    console.log(`shots served from ${BASE_URL}\n`);

    const seriesId = await seedSeries();
    const watcher = setInterval(() => void sample().catch(() => {}), 200);

    try {
        // ── A scheduler tick renders a finished reel, unattended ──────────
        console.log("scheduler tick");
        const first = await seedReel(seriesId, "tick", [180, 60, 40]);
        const tick = await runSchedulerTick();
        const tickOutcome = tick.renders.find((r) => r.reelId === first);

        check("the tick rendered the reel", tickOutcome?.action === "rendered", tickOutcome?.reason);

        const job = await prisma.renderJob.findFirst({ where: { reelId: first } });
        check("the job row completed", job?.status === "completed", `status ${job?.status}`);
        check("progress reached 100", job?.progress === 100, `${job?.progress}%`);

        await sample();
        check(
            "the row was watchable all the way through",
            walk(job?.id).endsWith("processing → completed"),
            walk(job?.id),
        );

        const size = renderedFile(job?.outputPath);
        check("the MP4 exists on disk", size > 0, `${job?.outputPath} (${(size / 1024).toFixed(0)}KB)`);

        const reel = await prisma.reel.findUnique({ where: { id: first } });
        check("the reel reads as completed", reel?.generationStatus === "completed", reel?.generationStatus ?? "");

        // ── And does not render it a second time ──────────────────────────
        console.log("\nsecond tick");
        const again = await runSchedulerTick();
        check(
            "a reel with a completed render is left alone",
            !again.renders.some((r) => r.reelId === first),
            `${again.renders.length} render(s) this tick`,
        );
        check(
            "nothing is waiting to render",
            !(await reelsAwaitingRender()).some((r) => r.id === first),
        );

        // ── Two reels at once still render one at a time ──────────────────
        console.log("\nconcurrent starts");
        const [a, b] = [
            await seedReel(seriesId, "parallel-a", [40, 120, 180]),
            await seedReel(seriesId, "parallel-b", [120, 160, 40]),
        ];
        const [startA, startADuplicate, startB] = await Promise.all([
            startRenderJob(a),
            startRenderJob(a),
            startRenderJob(b),
        ]);

        check(
            "a duplicate start joins the first",
            !!claimedJob(startA) && claimedJob(startADuplicate)?.id === claimedJob(startA)?.id,
            `${claimedJob(startA)?.id} / ${claimedJob(startADuplicate)?.id}`,
        );
        check(
            "one job row per reel",
            (await prisma.renderJob.count({ where: { reelId: a } })) === 1,
        );

        const finished = await Promise.all(
            [startA, startB].map((start) =>
                start.outcome === "started" ? start.finished : Promise.resolve(null),
            ),
        );
        check(
            "both renders completed",
            finished.every((j) => j?.status === "completed"),
            finished.map((j) => j?.status ?? "not started").join(", "),
        );
        check(
            "both MP4s exist",
            finished.every((j) => renderedFile(j?.outputPath) > 0),
            finished.map((j) => j?.outputPath).join(", "),
        );
        await sample();
        check(
            "never two renders at once",
            maxConcurrentRenders === 1,
            `peak ${maxConcurrentRenders} processing`,
        );
        // The second reel is the one that proves "queued" is a real state and
        // not just a default: it sat there while the first render had the CPU.
        const walks = [startA, startB].map((start) => walk(claimedJob(start)?.id));
        check(
            "the second render waited its turn",
            walks.some((seen) => seen === "queued → processing → completed"),
            walks.join(" | "),
        );

        // ── A render killed by a restart does not block its reel ─────────
        console.log("\nabandoned jobs");
        const orphan = await seedReel(seriesId, "orphan", [150, 90, 170]);
        const live = await seedReel(seriesId, "live", [90, 150, 170]);
        const stale = await prisma.renderJob.create({
            data: {
                reelId: orphan,
                status: "processing",
                progress: 42,
                heartbeatAt: new Date(Date.now() - 60 * 60 * 1000),
            },
        });
        const beating = await prisma.renderJob.create({
            data: { reelId: live, status: "processing", progress: 42, heartbeatAt: new Date() },
        });
        // What a crash during a render leaves behind, and what used to stop the
        // series generating ever again.
        await prisma.reel.update({
            where: { id: orphan },
            data: { generationStatus: "rendering" },
        });

        const swept = await failAbandonedRenders();
        check(
            "the silent job was failed",
            swept.some((j) => j.id === stale.id),
            `${swept.length} swept`,
        );
        check(
            "the job still beating was spared",
            (await prisma.renderJob.findUnique({ where: { id: beating.id } }))?.status === "processing",
        );
        const unstuck = await prisma.reel.findUnique({ where: { id: orphan } });
        check(
            "the reel is off \"rendering\", so its series is not blocked",
            unstuck?.generationStatus !== "rendering",
            `${unstuck?.generationStatus}: ${unstuck?.generationError}`,
        );
        check(
            "and it is queued to render again",
            (await reelsAwaitingRender()).some((r) => r.id === orphan),
        );
    } finally {
        clearInterval(watcher);
        await prisma.series.delete({ where: { id: seriesId } }).catch(() => {});
        await prisma.$disconnect().catch(() => {});
        for (const file of written) fs.rmSync(file, { force: true });
    }

    console.log(
        failures === 0
            ? "\nAll good. The MP4s are under public/renders — nobody clicked anything."
            : `\n${failures} check(s) failed.`,
    );
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error("\ncheck-render failed:", error);
    process.exit(1);
});
