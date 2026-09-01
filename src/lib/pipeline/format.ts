import type { ShotType } from "./shotPlan";

/**
 * What fills each shot.
 *
 * This is separate from art style. Art style is how a shot *looks*; format is
 * whether the shot is a still that the camera moves across, or footage that
 * actually moves. Both are worth having: a still with a well-chosen push is
 * often stronger than a mediocre three-second clip, and generating motion for
 * every shot of a 30-shot reel is neither cheap nor fast.
 */
export const REEL_FORMATS = ["slideshow", "hybrid", "motion"] as const;
export type ReelFormat = (typeof REEL_FORMATS)[number];

export const FORMAT_LABELS: Record<ReelFormat, string> = {
    slideshow: "Stills",
    hybrid: "Mixed",
    motion: "Motion",
};

export const FORMAT_DESCRIPTIONS: Record<ReelFormat, string> = {
    slideshow: "Every shot is a still image with camera movement. Cheapest and fastest.",
    hybrid: "Moving footage on the hook and the shots that hold longest; stills elsewhere.",
    motion: "Every shot is moving footage. Best looking, slowest and most expensive.",
};

/** Share of shots that get motion in hybrid, before the hook is added. */
const HYBRID_MOTION_SHARE = 0.35;

/**
 * Ceiling on generated clips per reel, whatever the format asks for.
 *
 * Image-to-video runs about a minute a clip and is billed per clip. A 30-shot
 * reel set to Motion would otherwise sit in the pipeline for half an hour and
 * bill thirty generations — a surprise worth preventing rather than
 * discovering. Shots above the ceiling stay stills, longest first.
 * Raise it with MAX_MOTION_SHOTS.
 */
export function maxMotionShots(): number {
    const configured = Number(process.env.MAX_MOTION_SHOTS);
    return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 20;
}

export function isReelFormat(value: unknown): value is ReelFormat {
    return typeof value === "string" && (REEL_FORMATS as readonly string[]).includes(value);
}

/** Per-reel setting wins, then the series, then stills. */
export function resolveFormat(...candidates: (string | null | undefined)[]): ReelFormat {
    for (const candidate of candidates) {
        if (isReelFormat(candidate)) return candidate;
    }
    return "slideshow";
}

/**
 * Motion that suits how the shot frames its subject.
 *
 * Image-to-video models take the still plus a description of what should move.
 * Asking for the wrong kind of movement is what produces the warping, sliding
 * faces that make AI video obvious — a close-up wants a blink and a breath, not
 * a crane move.
 */
const MOTION_BY_SHOT_TYPE: Record<ShotType, string> = {
    wide: "slow push in, drifting clouds and dust, distant movement in the landscape",
    medium: "subject shifts weight slightly, fabric and hair move in the wind, camera drifts",
    close: "subtle facial movement, a blink, shallow breathing, almost still camera",
    detail: "slow rack focus, small movement of the object, shallow depth of field",
};

type Shot = {
    startMs: number;
    endMs: number;
    visualPrompt?: string;
    shotType?: ShotType;
};

/**
 * Decides which shots are footage and which are stills, and writes the motion
 * prompt for the ones that move.
 *
 * Hybrid spends its budget where motion is worth most: the opening shot, which
 * decides whether anyone watches the rest, and then the longest shots, because
 * a still is most exposed when it has to hold the screen. Both are chosen from
 * the finished shot plan, so the decision follows the actual edit rather than a
 * fixed rule about scene numbers.
 */
export function assignShotMedia<T extends Shot>(
    shots: T[],
    format: ReelFormat,
): (T & { backgroundType: "image" | "video"; motionPrompt?: string })[] {
    const motionIndices = new Set<number>();
    const ceiling = maxMotionShots();

    if (format === "motion") {
        // Longest first, so the ceiling keeps motion where it is most visible.
        shots
            .map((shot, i) => ({ i, length: shot.endMs - shot.startMs }))
            .sort((a, b) => b.length - a.length)
            .slice(0, ceiling)
            .forEach(({ i }) => motionIndices.add(i));

        if (shots.length > ceiling) {
            console.warn(
                `[format] ${shots.length} shots requested motion; capped at ${ceiling}. ` +
                    `The rest stay stills. Raise MAX_MOTION_SHOTS to change this.`,
            );
        }
    } else if (format === "hybrid" && shots.length > 0) {
        motionIndices.add(0); // the hook

        const budget = Math.min(ceiling, Math.max(1, Math.round(shots.length * HYBRID_MOTION_SHARE)));
        const byLength = shots
            .map((shot, i) => ({ i, length: shot.endMs - shot.startMs }))
            .sort((a, b) => b.length - a.length);

        for (const { i } of byLength) {
            if (motionIndices.size >= budget) break;
            motionIndices.add(i);
        }
    }

    return shots.map((shot, i) => {
        if (!motionIndices.has(i)) {
            return { ...shot, backgroundType: "image" as const };
        }
        const motion = MOTION_BY_SHOT_TYPE[shot.shotType ?? "medium"];
        return {
            ...shot,
            backgroundType: "video" as const,
            motionPrompt: [shot.visualPrompt, motion].filter(Boolean).join(", "),
        };
    });
}
