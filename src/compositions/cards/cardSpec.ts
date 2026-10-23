import type { CardKind } from "./deck";

/**
 * What one beat of narration becomes on the page.
 *
 * This is the contract the script writer will have to fill, which is why it is
 * worth being strict about. Today the model returns a `visualPrompt` and the
 * whole frame is handed to an image model; a page cannot be specified that way.
 * A page needs to know which of a handful of layouts it is, which two or three
 * words are set large, and what — if anything — is being pointed at.
 *
 * Everything here is optional except `kind`, `figure` and `lines`, because a
 * card has to survive a model that leaves fields out.
 */
export type CardSpec = {
    kind: CardKind;
    /** Printed in the header and counted across the reel, never reset per card. */
    figure: number;
    /**
     * The display type, one entry per line. Two or three words total.
     * Long sentences belong in the narration, not on the page.
     */
    lines: string[];
    /** Indices of `lines` set in the accent colour. Usually the last one. */
    accentLines?: number[];
    /** The illustration: a generated specimen, or anything already on disk. */
    imageUrl?: string;
    /**
     * A leader line from a label to a point on the illustration, in percent of
     * the frame. What turns a picture into a diagram.
     */
    annotation?: {
        label: string;
        /** Where the line lands — the thing being named. */
        at: { x: number; y: number };
        /** Where the label sits. Defaults to the left of `at`. */
        from?: { x: number; y: number };
    };
    /** `list` cards: the options, struck through as the narration rules them out. */
    items?: { text: string; struck?: boolean }[];
    /** The torn label pinned under a specimen. */
    tag?: { title: string; subtitle?: string };
    /** Micro-text set vertically down the right edge of a plate. */
    sidenote?: string;
};

/** A reel's worth of pages, plus which deck prints them. */
export type CardReel = {
    deckId: string;
    cards: CardSpec[];
};
