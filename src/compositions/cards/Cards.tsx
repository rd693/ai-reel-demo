import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { CardSpec } from "./cardSpec";
import type { Deck } from "./deck";
import { MARGIN, Page, PageHeader, useAssetUrl } from "./Page";

/**
 * The layouts.
 *
 * Five of them cover the reference reel end to end, which is the point: a beat
 * does not get a bespoke frame, it gets assigned a page type. Variety comes
 * from which type and which two words, not from asking an image model for
 * something different each time.
 *
 * Every element enters on its own. A card where the type, the specimen and the
 * label all arrive together is a slide; a card where the type lands, then the
 * leader line draws, then the label snaps on is an edit.
 */

const easeOut = { damping: 200, mass: 0.7, stiffness: 110 } as const;

function useEnter(delayFrames: number): number {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return spring({ frame: frame - delayFrames, fps, config: easeOut, durationInFrames: 18 });
}

/** One line of display type. Its own component so each can enter on its own. */
const DisplayLine: React.FC<{
    deck: Deck;
    text: string;
    accented: boolean;
    size: number;
    dark?: boolean;
    delayFrames: number;
}> = ({ deck, text, accented, size, dark, delayFrames }) => {
    const progress = useEnter(delayFrames);
    return (
        <div
            style={{
                fontFamily: deck.fonts.display,
                fontWeight: 700,
                fontSize: size * deck.fonts.displayScale,
                lineHeight: deck.fonts.displayLeading,
                letterSpacing: "-0.012em",
                textTransform: deck.uppercase ? "uppercase" : "none",
                color: accented ? deck.colors.accent : dark ? deck.colors.darkInk : deck.colors.ink,
                opacity: progress,
                // Type that rises a little as it fades in reads as printed onto
                // the page rather than dropped over it.
                transform: `translateY(${interpolate(progress, [0, 1], [26, 0])}px)`,
            }}
        >
            {text}
        </div>
    );
};

/** The one or two words that carry the beat. */
const DisplayType: React.FC<{
    deck: Deck;
    lines: string[];
    accentLines?: number[];
    size?: number;
    dark?: boolean;
}> = ({ deck, lines, accentLines = [], size = 172, dark }) => (
    <div>
        {lines.map((line, i) => (
            <DisplayLine
                key={`${line}-${i}`}
                deck={deck}
                text={line}
                accented={accentLines.includes(i)}
                size={size}
                dark={dark}
                delayFrames={i * 4}
            />
        ))}
    </div>
);

/**
 * The illustration.
 *
 * `multiply` is what makes this work without a cut-out. A generated specimen on
 * a plain light background blends into the paper under multiply — the white
 * disappears, the drawn marks stay, and the halftone picks up the stock
 * underneath. That removes a whole background-removal step from the pipeline
 * and gets a more convincing print at the same time. On the dark plate the same
 * trick runs the other way with `screen`.
 */
const Plate: React.FC<{
    src: string;
    dark?: boolean;
    style?: React.CSSProperties;
    delayFrames?: number;
}> = ({ src, dark, style, delayFrames = 2 }) => {
    const progress = useEnter(delayFrames);
    const resolved = useAssetUrl(src);
    if (!resolved) return null;
    return (
        <div style={{ position: "absolute", ...style, opacity: progress }}>
            <svg width={0} height={0} style={{ position: "absolute" }}>
                <filter id="plate-levels" colorInterpolationFilters="sRGB">
                    <feComponentTransfer>
                        <feFuncR type="linear" slope={1.2} intercept={-0.02} />
                        <feFuncG type="linear" slope={1.2} intercept={-0.02} />
                        <feFuncB type="linear" slope={1.2} intercept={-0.02} />
                    </feComponentTransfer>
                </filter>
            </svg>
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <Img
                    src={resolved}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        mixBlendMode: dark ? "screen" : "multiply",
                        // The white point has to be clipped before the multiply
                        // or the illustration's own "off-white" background is a
                        // shade darker than the paper and shows as a rectangle
                        // around the subject. Pushing everything above ~83% to
                        // pure white is what makes a plain-background image
                        // behave like a cut-out without cutting anything out.
                        // Inverted before the screen: an illustration on a white
                        // background screened onto a black page floods the whole
                        // page white. Inverting turns that background black, so
                        // screen drops it and keeps only the subject — which is
                        // also exactly what an x-ray of the thing looks like.
                        filter: dark
                            ? "grayscale(1) invert(1) brightness(1.05) contrast(1.25)"
                            : "url(#plate-levels) contrast(1.1) saturate(0.95)",
                        transform: `scale(${interpolate(progress, [0, 1], [1.04, 1])})`,
                    }}
                />
                {/* A dot screen over the top. Real halftone is in the artwork;
                    this is what keeps it there after the image model has
                    smoothed everything out. */}
                <AbsoluteFill
                    style={{
                        mixBlendMode: "multiply",
                        opacity: dark ? 0 : 0.22,
                        backgroundImage:
                            "radial-gradient(rgba(0,0,0,0.55) 0.9px, rgba(0,0,0,0) 1.1px)",
                        backgroundSize: "4px 4px",
                    }}
                />
            </div>
        </div>
    );
};

/** A leader line to a point, with the thing it names. */
const Annotation: React.FC<{
    deck: Deck;
    annotation: NonNullable<CardSpec["annotation"]>;
    dark?: boolean;
    delayFrames?: number;
}> = ({ deck, annotation, dark, delayFrames = 20 }) => {
    const progress = useEnter(delayFrames);
    const { at } = annotation;
    const from = annotation.from ?? { x: Math.max(8, at.x - 34), y: at.y + 2 };
    const color = dark ? deck.colors.darkInk : deck.colors.ink;

    return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                <line
                    x1={`${from.x}%`}
                    y1={`${from.y}%`}
                    // The line draws toward the subject rather than appearing.
                    x2={`${from.x + (at.x - from.x) * progress}%`}
                    y2={`${from.y + (at.y - from.y) * progress}%`}
                    stroke={color}
                    strokeWidth={2.5}
                />
                <circle
                    cx={`${at.x}%`}
                    cy={`${at.y}%`}
                    r={14 * progress}
                    fill={deck.colors.accent}
                    stroke={color}
                    strokeWidth={2.5}
                />
            </svg>
            <div
                style={{
                    position: "absolute",
                    left: `${from.x}%`,
                    top: `${from.y}%`,
                    transform: "translate(-100%, -50%)",
                    paddingRight: 18,
                    fontFamily: deck.fonts.label,
                    fontWeight: 700,
                    fontSize: 34,
                    letterSpacing: deck.fonts.labelTracking,
                    color,
                    opacity: progress,
                    whiteSpace: "nowrap",
                }}
            >
                {annotation.label}
            </div>
        </AbsoluteFill>
    );
};

/** The torn label pinned under a specimen. */
const SpecimenTag: React.FC<{ deck: Deck; tag: NonNullable<CardSpec["tag"]> }> = ({ deck, tag }) => {
    const progress = useEnter(24);
    return (
        <div
            style={{
                position: "absolute",
                left: MARGIN,
                bottom: 300,
                padding: "20px 40px",
                background: "rgba(255,252,240,0.78)",
                border: `1px solid ${deck.colors.ink}33`,
                boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
                // Torn, not cut: a tag with four straight edges reads as a UI
                // element instead of a piece of paper.
                clipPath:
                    "polygon(0% 6%, 4% 0%, 38% 4%, 72% 0%, 100% 5%, 99% 94%, 64% 100%, 28% 96%, 2% 100%)",
                opacity: progress,
                transform: `rotate(-0.8deg) translateY(${interpolate(progress, [0, 1], [14, 0])}px)`,
            }}
        >
            <div
                style={{
                    fontFamily: deck.fonts.label,
                    fontWeight: 700,
                    fontSize: 36,
                    letterSpacing: deck.fonts.labelTracking,
                    color: deck.colors.ink,
                }}
            >
                {tag.title}
            </div>
            {tag.subtitle && (
                <div
                    style={{
                        fontFamily: deck.fonts.label,
                        fontSize: 26,
                        letterSpacing: deck.fonts.labelTracking,
                        color: deck.colors.muted,
                        marginTop: 6,
                    }}
                >
                    {tag.subtitle}
                </div>
            )}
        </div>
    );
};

/** Micro-text set down the right edge of a plate. */
const SideNote: React.FC<{ deck: Deck; text: string; dark?: boolean }> = ({ deck, text, dark }) => (
    <div
        style={{
            position: "absolute",
            right: 26,
            top: "38%",
            writingMode: "vertical-rl",
            fontFamily: deck.fonts.label,
            fontSize: 22,
            letterSpacing: "0.3em",
            color: dark ? deck.colors.darkInk : deck.colors.muted,
            opacity: 0.55,
        }}
    >
        {text}
    </div>
);

// ── The five pages ───────────────────────────────────────────────────────────

const SpecimenCard: React.FC<{ deck: Deck; spec: CardSpec }> = ({ deck, spec }) => (
    <>
        <div style={{ position: "absolute", left: MARGIN, top: 280 }}>
            <DisplayType deck={deck} lines={spec.lines} accentLines={spec.accentLines} size={160} />
        </div>
        {spec.imageUrl && (
            <Plate src={spec.imageUrl} style={{ left: -60, right: -60, top: 520, height: 1060 }} />
        )}
        {spec.annotation && <Annotation deck={deck} annotation={spec.annotation} />}
        {spec.tag && <SpecimenTag deck={deck} tag={spec.tag} />}
        {spec.sidenote && <SideNote deck={deck} text={spec.sidenote} />}
    </>
);

/**
 * Type alone, filling the frame.
 *
 * The reference uses this for the beats that are a sentence, not a thing —
 * "IT WON'T KILL", "TOO HEAVY". It is also the cheapest card there is: no image
 * call at all, which matters when a reel is twenty-five pages long.
 */
const StatementCard: React.FC<{ deck: Deck; spec: CardSpec }> = ({ deck, spec }) => (
    <>
        <div style={{ position: "absolute", left: MARGIN, top: 300, right: MARGIN }}>
            <DisplayType deck={deck} lines={spec.lines} accentLines={spec.accentLines} size={200} />
        </div>
        {spec.imageUrl && (
            <Plate
                src={spec.imageUrl}
                style={{ left: -40, right: -40, bottom: 300, height: 900 }}
                delayFrames={8}
            />
        )}
        {spec.sidenote && <SideNote deck={deck} text={spec.sidenote} />}
    </>
);

/** The inverted plate: the same subject, looked through rather than at. */
const XrayCard: React.FC<{ deck: Deck; spec: CardSpec }> = ({ deck, spec }) => {
    const progress = useEnter(16);
    const target = spec.annotation?.at ?? { x: 50, y: 50 };
    return (
        <>
            {spec.imageUrl && (
                <Plate src={spec.imageUrl} dark style={{ inset: 0, width: "100%", height: "100%" }} />
            )}
            <div style={{ position: "absolute", left: MARGIN, top: 280 }}>
                <DisplayType
                    deck={deck}
                    lines={spec.lines}
                    accentLines={spec.accentLines}
                    size={150}
                    dark
                />
            </div>
            {/* The crosshair snaps to its mark and settles, the way a scope
                does. Fading it in reads as a graphic; snapping reads as aim. */}
            <AbsoluteFill style={{ pointerEvents: "none", opacity: progress }}>
                <svg width="100%" height="100%">
                    <g
                        transform={`translate(${(target.x / 100) * 1080} ${(target.y / 100) * 1920}) scale(${interpolate(progress, [0, 1], [1.9, 1])})`}
                    >
                        <ellipse
                            rx={160}
                            ry={108}
                            fill="none"
                            stroke={deck.colors.accent}
                            strokeWidth={8}
                        />
                        <circle r={72} fill="none" stroke={deck.colors.accent} strokeWidth={6} />
                        <line x1={-104} y1={0} x2={104} y2={0} stroke={deck.colors.accent} strokeWidth={6} />
                        <line x1={0} y1={-104} x2={0} y2={104} stroke={deck.colors.accent} strokeWidth={6} />
                    </g>
                </svg>
            </AbsoluteFill>
            {spec.sidenote && <SideNote deck={deck} text={spec.sidenote} dark />}
        </>
    );
};

/** One option, with the mark that rules it out. */
const ListRow: React.FC<{
    deck: Deck;
    item: { text: string; struck?: boolean };
    index: number;
}> = ({ deck, item, index }) => {
    const row = useEnter(12 + index * 8);
    const strike = useEnter(26 + index * 10);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 34, marginBottom: 30, opacity: row }}>
            <div
                style={{
                    width: 58,
                    height: 58,
                    border: `4px solid ${deck.colors.ink}`,
                    position: "relative",
                    flexShrink: 0,
                }}
            >
                {item.struck && (
                    <svg width="58" height="58" style={{ position: "absolute", inset: -4 }}>
                        <line
                            x1={8}
                            y1={8}
                            x2={8 + 42 * strike}
                            y2={8 + 42 * strike}
                            stroke={deck.colors.accent}
                            strokeWidth={7}
                        />
                        <line
                            x1={50}
                            y1={8}
                            x2={50 - 42 * strike}
                            y2={8 + 42 * strike}
                            stroke={deck.colors.accent}
                            strokeWidth={7}
                        />
                    </svg>
                )}
            </div>
            <div style={{ position: "relative" }}>
                <span
                    style={{
                        fontFamily: deck.fonts.display,
                        fontSize: 86 * deck.fonts.displayScale,
                        lineHeight: 1,
                        textTransform: deck.uppercase ? "uppercase" : "none",
                        color: item.struck ? deck.colors.muted : deck.colors.ink,
                    }}
                >
                    {item.text}
                </span>
                {item.struck && (
                    <div
                        style={{
                            position: "absolute",
                            left: -8,
                            right: 0,
                            top: "52%",
                            height: 8,
                            background: deck.colors.accent,
                            transformOrigin: "left center",
                            // Drawn in front of you, not already there.
                            transform: `scaleX(${strike}) rotate(-1.4deg)`,
                            borderRadius: 4,
                        }}
                    />
                )}
            </div>
        </div>
    );
};

/**
 * Options being ruled out.
 *
 * The narration says what will not work; the page crosses it off while the
 * sentence is still being spoken. The strike wipes rather than appears —
 * a line drawn in front of you is a decision being made.
 */
const ListCard: React.FC<{ deck: Deck; spec: CardSpec }> = ({ deck, spec }) => {
    const panel = useEnter(4);
    return (
        <>
            {spec.imageUrl && (
                <Plate src={spec.imageUrl} style={{ left: -40, right: -40, top: 280, height: 640 }} />
            )}
            <div
                style={{
                    position: "absolute",
                    left: MARGIN - 20,
                    right: MARGIN - 20,
                    top: 900,
                    padding: "44px 52px",
                    background: "rgba(255,251,238,0.72)",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
                    opacity: panel,
                    transform: `translateY(${interpolate(panel, [0, 1], [20, 0])}px)`,
                }}
            >
                <div
                    style={{
                        fontFamily: deck.fonts.label,
                        fontWeight: 700,
                        fontSize: 30,
                        letterSpacing: deck.fonts.labelTracking,
                        color: deck.colors.muted,
                        marginBottom: 34,
                    }}
                >
                    {spec.lines[0] ?? ""}
                </div>
                {(spec.items ?? []).map((item, i) => (
                    <ListRow key={item.text} deck={deck} item={item} index={i} />
                ))}
            </div>
        </>
    );
};

/** A labelled plate with no headline: the page that explains a mechanism. */
const DiagramCard: React.FC<{ deck: Deck; spec: CardSpec }> = ({ deck, spec }) => (
    <>
        {spec.imageUrl && (
            <Plate src={spec.imageUrl} style={{ left: -60, right: -60, top: 430, height: 1120 }} />
        )}
        <div style={{ position: "absolute", left: MARGIN, bottom: 300 }}>
            <DisplayType deck={deck} lines={spec.lines} accentLines={spec.accentLines} size={120} />
        </div>
        {spec.annotation && <Annotation deck={deck} annotation={spec.annotation} delayFrames={14} />}
        {spec.sidenote && <SideNote deck={deck} text={spec.sidenote} />}
    </>
);

const LAYOUTS = {
    specimen: SpecimenCard,
    statement: StatementCard,
    xray: XrayCard,
    list: ListCard,
    diagram: DiagramCard,
} as const;

export const Card: React.FC<{ deck: Deck; spec: CardSpec }> = ({ deck, spec }) => {
    const Layout = LAYOUTS[spec.kind] ?? StatementCard;
    const dark = spec.kind === "xray";
    return (
        <Page deck={deck} dark={dark}>
            <PageHeader deck={deck} label={deck.labels[spec.kind]} figure={spec.figure} dark={dark} />
            <Layout deck={deck} spec={spec} />
        </Page>
    );
};
