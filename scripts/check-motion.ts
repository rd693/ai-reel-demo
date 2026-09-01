/**
 * Checks the shot planner and the shot motion rules.
 *
 * Both are pure functions over synthetic input, so this needs no database, no
 * network and no API keys: `npm run check:motion`.
 *
 * It exists because two bugs in this area were invisible by inspection. The
 * transition rule treated anything under 2s as a fast shot and dissolved the
 * rest — but the planner makes 2.7s shots, so 22 of 30 boundaries dissolved and
 * the edit still looked like a slideshow. And the shot list has to tile the
 * audio exactly: a gap of one frame is a black flash in the finished video.
 */
import { planShots, summarizeShotPlan } from "../src/lib/pipeline/shotPlan";
import { assignShotMedia } from "../src/lib/pipeline/format";
import {
    kenBurns,
    transitionFor,
    transitionFrames,
    transitionStyle,
    hookScale,
} from "../src/compositions/shotMotion";

const FPS = 30;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
    if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
    else { failures++; console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

/** A 60s narration in ten beats, the shape the writer actually returns. */
function syntheticBeats() {
    const beats = [];
    let t = 0;
    for (let i = 0; i < 10; i++) {
        const length = 5000 + (i % 4) * 1200; // 5.0s - 8.6s
        beats.push({
            id: `beat-${i}`,
            narrationText: `beat ${i} ${"word ".repeat(14)}`.trim(),
            headline: `Beat ${i}`,
            visualPrompt: `a subject in a place, scene ${i}`,
            startMs: t,
            endMs: t + length,
        });
        t += length;
    }
    return beats;
}

console.log("shot plan");
const beats = syntheticBeats();
const shots = planShots(beats, undefined);
console.log(`  ${summarizeShotPlan(shots)}`);

check("more shots than beats", shots.length > beats.length, `${beats.length} -> ${shots.length}`);
check(
    "no shot outstays the maximum",
    shots.every((s) => s.durationInSeconds <= 3.6),
    `longest ${Math.max(...shots.map((s) => s.durationInSeconds)).toFixed(2)}s`,
);
check("no shot under the minimum", shots.every((s) => s.durationInSeconds >= 1.39));
check(
    "shots tile the beats with no gap or overlap",
    shots.every((s, i) => i === 0 || s.startMs === shots[i - 1].endMs) &&
        shots[0].startMs === beats[0].startMs &&
        shots[shots.length - 1].endMs === beats[beats.length - 1].endMs,
);
check("every shot has a frame type", shots.every((s) => !!s.shotType));

console.log("\nformat");
const hybrid = assignShotMedia(shots, "hybrid");
check("hybrid animates the hook", hybrid[0].backgroundType === "video");
check(
    "every motion shot carries a motion prompt",
    hybrid.every((s) => s.backgroundType !== "video" || !!s.motionPrompt),
);
check(
    "no still carries a motion prompt",
    hybrid.every((s) => s.backgroundType !== "image" || !s.motionPrompt),
);
check("stills format animates nothing", assignShotMedia(shots, "slideshow").every((s) => s.backgroundType === "image"));

console.log("\ntransitions");
const frames = shots.map((s) => Math.round(s.durationInSeconds * FPS));
const kinds = shots.map((_, i) => transitionFor(i, frames[i]));
const tally = kinds.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
console.log(`  mix: ${JSON.stringify(tally)}`);

check("cuts are the majority", (tally.cut ?? 0) > shots.length / 2, `${tally.cut ?? 0}/${shots.length}`);
check("a cut is opaque on its first frame", transitionStyle("cut", 0).opacity === 1);
check("a dissolve ramps up", transitionStyle("dissolve", 0).opacity === 0 && transitionStyle("dissolve", 6).opacity === 1);
check("a push enters offscreen and settles", transitionStyle("push", 0).offsetPercent === 100 && transitionStyle("push", 8).offsetPercent === 0);

console.log("\ncamera");
check(
    "the move completes inside the shot",
    kenBurns("wide", 1, 0).scale > kenBurns("wide", 0, 0).scale,
);
check(
    "a close-up moves far less than a detail insert",
    kenBurns("close", 1, 0).scale - kenBurns("close", 0, 0).scale <
        (kenBurns("detail", 1, 0).scale - kenBurns("detail", 0, 0).scale) / 2,
);
check("consecutive shots drift opposite ways", kenBurns("wide", 1, 0).x * kenBurns("wide", 1, 1).x < 0);
check("the hook punch settles to neutral", hookScale(0) > 1.05 && hookScale(20) === 1);

console.log("\ncoverage");
const starts = shots.map((s) => Math.round((s.startMs / 1000) * FPS));
const ends = shots.map((s) => Math.round((s.endMs / 1000) * FPS));
const total = ends[ends.length - 1];
let uncovered = 0;
for (let f = 0; f < total; f++) {
    const covered = shots.some((_, i) => {
        const nextStart = starts[i + 1] ?? ends[i] + 200;
        const nextSpan = i + 1 < shots.length ? transitionFrames(transitionFor(i + 1, frames[i + 1])) : 0;
        return f >= starts[i] && f <= nextStart + nextSpan;
    });
    if (!covered) uncovered++;
}
check("no frame of the reel is uncovered", uncovered === 0, `${uncovered}/${total}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
