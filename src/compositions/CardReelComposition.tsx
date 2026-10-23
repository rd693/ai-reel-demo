import React from "react";
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";

import type { FacelessReel } from "../types/series";
import type { ReelScene } from "../types/reel";
import { Card } from "./cards/Cards";
import { BaseHostContext, CardFonts } from "./cards/Page";
import type { CardSpec } from "./cards/cardSpec";
import { resolveDeck } from "./cards/deck";

/**
 * A reel printed as pages.
 *
 * Deliberately much smaller than FacelessReelComposition, because almost
 * everything that one does is no longer needed. There is no caption layer —
 * the display type on the page is the caption, and a yellow bar across the
 * bottom of a printed page is the single clearest sign that a reel was
 * assembled rather than designed. There are no Ken Burns moves, because a page
 * does not drift. What is left is the cut: one card, the length of the words
 * spoken over it, and the next.
 */

type CardReelProps = {
    reel: FacelessReel & { baseHost?: string };
};

/** The spec the pipeline planned, or a bare page if a shot never got one. */
function specFor(scene: ReelScene, index: number): CardSpec {
    const planned = scene.cardSpec as CardSpec | undefined;
    const base: CardSpec = planned?.kind
        ? planned
        : { kind: "statement", figure: index + 1, lines: [scene.headline || ""] };
    // The illustration is attached here rather than planned in: the planner
    // decides what to draw, the pipeline decides where it ended up on disk.
    return { ...base, imageUrl: scene.backgroundUrl };
}

export const CardReelComposition: React.FC<CardReelProps> = ({ reel }) => {
    const { fps, durationInFrames } = useVideoConfig();
    const deck = resolveDeck(reel.deckId);
    const baseHost = reel.baseHost ?? "";

    // Timings come from the voiceover, the same ones the slideshow uses. A card
    // that outstays its narration is worse than one that is a beat short.
    let cursor = 0;
    const pages = reel.scenes.map((scene, i) => {
        const start =
            typeof scene.startMs === "number" ? Math.round((scene.startMs / 1000) * fps) : cursor;
        const end =
            typeof scene.endMs === "number"
                ? Math.round((scene.endMs / 1000) * fps)
                : start + Math.round((scene.durationInSeconds || 3) * fps);
        cursor = end;
        const last = i === reel.scenes.length - 1;
        return {
            scene,
            start,
            // The last page runs to the end of the audio. Without this a reel
            // whose narration overruns its shot plan ends on a black frame.
            end: last ? Math.max(end, durationInFrames) : end,
        };
    });

    return (
        <BaseHostContext.Provider value={baseHost}>
            <AbsoluteFill style={{ backgroundColor: deck.colors.paper }}>
                <CardFonts baseHost={baseHost} deck={deck} />

                {pages.map(({ scene, start, end }, i) => (
                    <Sequence
                        key={scene.id || i}
                        from={start}
                        durationInFrames={Math.max(1, end - start)}
                    >
                        <Card deck={deck} spec={specFor(scene, i)} />
                    </Sequence>
                ))}

                {reel.voiceoverUrl && <Audio src={reel.voiceoverUrl} />}
            </AbsoluteFill>
        </BaseHostContext.Provider>
    );
};
