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
import { planShots, summarizeShotPlan, stripCameraAngle } from "../src/lib/pipeline/shotPlan";
import { assignShotMedia } from "../src/lib/pipeline/format";
import { speakable, speakableDiff } from "../src/lib/audio/speakable";
import { imageSubject } from "../src/lib/ai/llm";
import { normalizeHashtags, fitTags, toPublishCopy } from "../src/lib/pipeline/publishCopy";
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

console.log("\nimage subject");
{
    // Exactly what was typed for the Eklavya reel, after Hindi is stripped.
    check("a possessed noun reduces to its owner", imageSubject("— Eklavya's thumb.") === "Eklavya", imageSubject("— Eklavya's thumb."));
    check("a leading dash is dropped", !imageSubject("— Maharana Pratap").startsWith("—"));
    check("a title clause is cut at the dash", imageSubject("Samudra Manthan — the churning of the ocean") === "Samudra Manthan");
    check("a plain name is left alone", imageSubject("Chhatrapati Shivaji") === "Chhatrapati Shivaji");
    check("a curly apostrophe works too", imageSubject("Karna\u2019s armour") === "Karna");
    check("empty input is safe", imageSubject("") === "");
}

console.log("\nshot framing");
{
    // What llm.ts actually produces: the writer's angle already baked in.
    const written = "Eklavya's thumb., Extreme close-up on hands, cinematic 3D render, ultra detailed, no text";
    const stripped = stripCameraAngle(written);
    check("an angle the writer supplied is removed", !/extreme close-up/i.test(stripped), stripped.slice(0, 46));
    check("the rest of the prompt survives", /cinematic 3D render/.test(stripped) && /Eklavya/.test(stripped));

    const split = planShots(
        [{ id: "b", narrationText: "a ".repeat(30), visualPrompt: written, startMs: 0, endMs: 9000 }],
        undefined,
    );
    check("a split beat carries exactly one camera direction", split.every(sh => {
        const hits = (sh.visualPrompt!.toLowerCase().match(/close-up|wide shot|medium shot|establishing|aerial/g) ?? []).length;
        return hits === 1;
    }), split.map(sh => (sh.visualPrompt ?? "").split(",")[0]).join(" | ").slice(0, 78));
    check("a prompt that is only an angle is not emptied", stripCameraAngle("wide establishing shot").length > 0);
}

console.log("\nnarration for speech");
{
    // The shape a model drifts back to: ellipses as dramatic pauses, which a
    // synthesiser reads as long dead stops.
    const staccato = "क्षीरसागर उबल रहा था... और आकाश काँप उठा। एक ओर देवता — दूसरी ओर असुर... और बीच में लालच।";
    const spoken = speakable(staccato);
    const strip = (t: string) => t.replace(/[।.!?,;:\s—–…]/g, "");

    check("hard pauses are removed", speakableDiff(spoken).pauses === 0, `${speakableDiff(staccato).pauses} -> 0`);
    check("no ellipsis survives", !/\.{3,}|…/.test(spoken));
    check("words are never changed, only punctuation", strip(staccato) === strip(spoken));
    check("no doubled commas", !/,\s*,/.test(spoken));
    check("no comma after a full stop", !/[।.!?]\s*,/.test(spoken));
    check("an ellipsis after a danda becomes nothing, not a comma", !/।\s*,/.test(speakable("वह गया।... फिर लौटा।")));
    check("empty input is safe", speakable("") === "");
}

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

console.log("\nupload copy");
{
    const tags = normalizeHashtags(["#history", "History", "#Malik Ambar", "#shorts", "#a", "#b", "#c", "#d"]);
    check("#Shorts comes first, once", tags[0] === "#Shorts" && tags.filter((t) => t.toLowerCase() === "#shorts").length === 1);
    check("hashtags are one word and deduplicated", tags.every((t) => !/\s/.test(t)) && tags.length === new Set(tags.map((t) => t.toLowerCase())).size);
    check("at most five hashtags", tags.length <= 5);

    const many = Array.from({ length: 80 }, (_, i) => `search phrase number ${i}`);
    const fitted = fitTags(many);
    const cost = fitted.reduce((n, t, i) => n + t.length + (t.includes(" ") ? 2 : 0) + (i ? 1 : 0), 0);
    check("tags fit YouTube's 500-character budget", cost <= 500, `${cost} chars, ${fitted.length} tags`);

    const copy = toPublishCopy(
        {
            title: "x ".repeat(80) + "#Shorts",
            description: "Hook <b>line</b>\n\n\n\nBody #tag inside",
            hashtags: ["#Itihas"],
            tags: ["a", "a", "b,c"],
            category: "Not a category",
        },
        { title: "fallback", script: "s", niche: "history", language: "hindi", artStyle: "realism" },
        "test",
    );
    check("title is at most 100 characters, with no hashtags", copy.title.length <= 100 && !copy.title.includes("#"), `${copy.title.length}`);
    check("description has no < or >", !/[<>]/.test(copy.description));
    check("description ends with the hashtag line, once", copy.description.endsWith("#Shorts #Itihas") && !copy.description.includes("#tag"));
    check("an unknown category falls back to Education", copy.settings.category === "Education" && copy.settings.categoryId === "27");
    check("hindi maps to hi", copy.settings.language === "hi");
    check("photoreal styles are flagged for disclosure", copy.settings.alteredContent === true);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
