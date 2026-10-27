import React from "react";
import { AbsoluteFill } from "remotion";

import { Card } from "./cards/Cards";
import { BaseHostContext, CardFonts } from "./cards/Page";
import { resolveDeck } from "./cards/deck";
import type { CardSpec } from "./cards/cardSpec";

/**
 * One card, on its own, for judging the art direction.
 *
 * Registered as a composition so the deck can be edited in Remotion Studio with
 * the page in front of you — the alternative is re-rendering a whole reel to
 * see whether a headline is two points too big.
 */
export const CardSample: React.FC<{
    deckId: string;
    spec: CardSpec;
    /** Absolute origin for the fonts and the illustration, as the renderer needs. */
    baseHost?: string;
}> = ({ deckId, spec, baseHost }) => {
    const deck = resolveDeck(deckId);
    return (
        <BaseHostContext.Provider value={baseHost ?? ""}>
            <AbsoluteFill>
                <CardFonts baseHost={baseHost} deck={deck} />
                <Card deck={deck} spec={spec} />
            </AbsoluteFill>
        </BaseHostContext.Provider>
    );
};

export const SAMPLE_CARD: CardSpec = {
    kind: "statement",
    figure: 2,
    lines: ["IT WON'T", "KILL"],
    accentLines: [1],
};
