import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";

import type { Deck } from "./deck";

/**
 * The page itself: stock, tooth, rules, holes, crease, and the header that
 * numbers it.
 *
 * Every card draws on this, which is the whole point — the furniture is
 * identical from figure 1 to figure 25, so the pages read as one notebook even
 * when the illustrations have nothing to do with each other.
 *
 * All of it is drawn rather than loaded: a texture bitmap would have to be
 * fetched over HTTP at render time like every other asset, and the renderer
 * already has enough ways to fail on a missing file.
 */

export const MARGIN = 56;
const HEADER_Y = 196;

/**
 * Where "/uploads/x.png" actually lives.
 *
 * The renderer serves the composition from the bundle's own origin, so a
 * root-relative path resolves against a server that has no media on it. The
 * reel composition relies on its caller rewriting every string before handing
 * the data over; cards resolve their own, because a card is also rendered one
 * at a time by the sample script and in Studio, where no such caller exists.
 */
export const BaseHostContext = React.createContext<string>("");

export function useAssetUrl(src: string | undefined): string | undefined {
    const baseHost = React.useContext(BaseHostContext);
    if (!src) return undefined;
    return src.startsWith("/") ? `${baseHost}${src}` : src;
}

/**
 * Waits for the display faces before a frame is captured.
 *
 * Without this the first frames render in a fallback face and then snap, which
 * on a two-second card means the snap is most of the card. The fonts are served
 * from the app rather than from Google so an overnight render does not depend
 * on anything outside the machine.
 */
export const CardFonts: React.FC<{ baseHost?: string; deck: Deck }> = ({ baseHost = "", deck }) => {
    const [handle] = useState(() => delayRender("Loading card fonts"));

    useEffect(() => {
        const wanted = [`700 100px "${deck.fonts.display}"`, `700 24px "${deck.fonts.label}"`];
        Promise.all(wanted.map((font) => document.fonts.load(font).catch(() => undefined)))
            .then(() => document.fonts.ready)
            .catch(() => undefined)
            .then(() => continueRender(handle));
    }, [handle, deck.fonts.display, deck.fonts.label]);

    return <link rel="stylesheet" href={`${baseHost}/fonts/fonts.css`} />;
};

/** Paper tooth. One SVG filter, no bitmap, identical on every frame. */
const Grain: React.FC<{ amount: number; dark?: boolean }> = ({ amount, dark }) => (
    <AbsoluteFill
        style={{
            opacity: amount * (dark ? 0.5 : 1),
            mixBlendMode: dark ? "screen" : "multiply",
            pointerEvents: "none",
        }}
    >
        <svg width="100%" height="100%">
            <filter id="tooth">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} seed={7} />
                <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#tooth)" opacity={0.42} />
        </svg>
    </AbsoluteFill>
);

/** Feint rules. Spaced like a notebook, not like a spreadsheet. */
const Rules: React.FC<{ color: string }> = ({ color }) => (
    <AbsoluteFill style={{ opacity: 0.18 }}>
        {Array.from({ length: 18 }, (_, i) => (
            <div
                key={i}
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 300 + i * 96,
                    height: 1,
                    background: color,
                }}
            />
        ))}
    </AbsoluteFill>
);

/** Punched holes. Shadowed, so they read as holes rather than as dots. */
const Holes: React.FC<{ color: string }> = ({ color }) => (
    <>
        {Array.from({ length: 9 }, (_, i) => (
            <div
                key={i}
                style={{
                    position: "absolute",
                    left: 6,
                    top: 190 + i * 198,
                    width: 20,
                    height: 34,
                    borderRadius: "50%",
                    background: color,
                    opacity: 0.22,
                    boxShadow: `inset -2px 0 3px ${color}`,
                }}
            />
        ))}
    </>
);

/** The crease of a page folded once down its length. */
const Fold: React.FC = () => (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
            style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "63%",
                width: 54,
                marginLeft: -27,
                background:
                    "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.07) 44%, rgba(255,255,255,0.14) 52%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0) 100%)",
            }}
        />
    </AbsoluteFill>
);

/**
 * The header: what kind of page this is, and which number it is.
 *
 * The figure number is the cheapest device in the whole reference and the one
 * doing the most work. It is what turns unrelated shots into pages of one
 * document, so it counts across the reel and is never reset.
 */
export const PageHeader: React.FC<{
    deck: Deck;
    label: string;
    figure: number;
    dark?: boolean;
}> = ({ deck, label, figure, dark }) => {
    const color = dark ? deck.colors.darkInk : deck.colors.muted;
    return (
        <div
            style={{
                position: "absolute",
                left: MARGIN,
                right: MARGIN,
                top: HEADER_Y,
                fontFamily: `"${deck.fonts.label}", monospace`,
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: deck.fonts.labelTracking,
                color,
                opacity: dark ? 0.5 : 0.85,
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{label}</span>
                <span>
                    {deck.figurePrefix} {deck.figureNumeral ? deck.figureNumeral(figure) : figure}
                </span>
            </div>
            <div style={{ height: 2, background: color, opacity: 0.55, marginTop: 14 }} />
        </div>
    );
};

export const Page: React.FC<{
    deck: Deck;
    /** The x-ray plate inverts the stock; everything else keeps the paper. */
    dark?: boolean;
    children: React.ReactNode;
}> = ({ deck, dark, children }) => {
    const { colors, paper } = deck;
    return (
        <AbsoluteFill style={{ background: dark ? colors.darkPaper : colors.paper, overflow: "hidden" }}>
            {!dark && paper.rules && <Rules color={colors.ink} />}
            {!dark && paper.holes && <Holes color={colors.ink} />}
            {paper.fold && <Fold />}
            {!dark && paper.border && (
                <div
                    style={{
                        position: "absolute",
                        inset: 118,
                        border: `3px solid ${colors.ink}`,
                        opacity: 0.3,
                        outline: `1px solid ${colors.ink}`,
                        outlineOffset: 10,
                    }}
                />
            )}
            {children}
            <Grain amount={paper.grain} dark={dark} />
            {/* Printed pages are never evenly lit; the vignette is what stops
                the frame reading as a flat colour swatch behind the type. */}
            <AbsoluteFill
                style={{
                    pointerEvents: "none",
                    background:
                        "radial-gradient(130% 85% at 50% 42%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.28) 100%)",
                }}
            />
        </AbsoluteFill>
    );
};
