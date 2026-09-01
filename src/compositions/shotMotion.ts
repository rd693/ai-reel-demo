/**
 * How a shot moves, and how it arrives.
 *
 * Both were previously one setting applied to everything: every shot scaled
 * 1.05 -> 1.3 while drifting, and every boundary was a 15-frame crossfade.
 * Dissolving every cut is the clearest tell of an automated edit — real cutting
 * is mostly hard cuts, and a dissolve means something when it is not the
 * default. The single Ken Burns had the same problem in the other direction: a
 * 25% push is right for an insert and wrong for a face.
 */

export type ShotType = "wide" | "medium" | "close" | "detail";
export type TransitionKind = "cut" | "dissolve" | "push";

/** The opening, where a slightly stronger move is worth it. */
export const HOOK_FRAMES = 20;

type Move = { fromScale: number; toScale: number; drift: number; rise: number };

/**
 * Camera move per shot type.
 *
 * A wide can breathe; a close-up cannot. Pushing hard on a face exaggerates
 * every flaw in a generated image and reads as a zoom rather than a camera.
 */
const MOVES: Record<ShotType, Move> = {
    wide: { fromScale: 1.02, toScale: 1.16, drift: 8, rise: 10 },
    medium: { fromScale: 1.04, toScale: 1.17, drift: 14, rise: 12 },
    close: { fromScale: 1.06, toScale: 1.13, drift: 6, rise: 6 },
    detail: { fromScale: 1.1, toScale: 1.3, drift: 10, rise: 14 },
};

/**
 * The Ken Burns transform for a shot, as a fraction of its own length.
 *
 * `progress` is 0 at the shot's first frame and 1 at its last, so the move
 * completes exactly within the shot however long it turns out to be. The old
 * version interpolated over [0, 1.5] and so never finished the move it started.
 */
export function kenBurns(
    shotType: ShotType | undefined,
    progress: number,
    index: number,
): { scale: number; x: number; y: number } {
    const move = MOVES[shotType ?? "medium"];
    const t = Math.min(1, Math.max(0, progress));

    // Alternate direction so two shots in a row never drift the same way.
    const direction = index % 2 === 0 ? 1 : -1;

    return {
        scale: move.fromScale + (move.toScale - move.fromScale) * t,
        x: direction * move.drift * (t - 0.5) * 2,
        y: -move.rise * t,
    };
}

/** Frames a transition occupies. A cut occupies none, which is the point. */
export function transitionFrames(kind: TransitionKind): number {
    return kind === "cut" ? 0 : kind === "push" ? 8 : 6;
}

/**
 * How a shot arrives. The default is a cut.
 *
 * The first version of this treated anything under 2s as "fast" and dissolved
 * the rest — but the shot planner *makes* 2.7s shots, so 22 of 30 boundaries
 * came out as dissolves and the edit still read as a slideshow. The threshold
 * was calibrated against a distribution that no longer exists.
 *
 * So: cut, unless there is a reason. Every sixth boundary pushes, which is
 * enough variety to feel edited without becoming a motif, and only genuinely
 * long shots dissolve, where it reads as a breath rather than a smear.
 */
const LONG_SHOT_FRAMES = 100; // ~3.3s at 30fps

export function transitionFor(index: number, shotFrames: number): TransitionKind {
    if (index === 0) return "cut";
    if (index % 6 === 0) return "push";
    if (shotFrames >= LONG_SHOT_FRAMES) return "dissolve";
    return "cut";
}

/**
 * Opacity and entry offset for a shot, `framesIn` frames after its start.
 *
 * A cut is fully opaque on its first frame — no ramp, no gap.
 */
export function transitionStyle(
    kind: TransitionKind,
    framesIn: number,
): { opacity: number; offsetPercent: number } {
    const span = transitionFrames(kind);
    if (span === 0 || framesIn >= span) return { opacity: 1, offsetPercent: 0 };

    const t = Math.min(1, Math.max(0, framesIn / span));

    if (kind === "push") {
        // Ease-out so the shot settles rather than stopping dead.
        const eased = 1 - Math.pow(1 - t, 3);
        return { opacity: 1, offsetPercent: (1 - eased) * 100 };
    }

    return { opacity: t, offsetPercent: 0 };
}

/**
 * Extra scale on the opening frames.
 *
 * The first shot settles out of a slight push-in. It costs nothing, and it is
 * the difference between a reel that starts and one that just appears.
 */
export function hookScale(frame: number): number {
    if (frame >= HOOK_FRAMES) return 1;
    const t = frame / HOOK_FRAMES;
    return 1.08 - 0.08 * (1 - Math.pow(1 - t, 3));
}
