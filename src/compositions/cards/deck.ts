/**
 * Art direction as data.
 *
 * The reels this is modelled on are not a sequence of pictures. They are pages
 * of one artifact: the same paper, the same two typefaces, the same three
 * colours, a figure number counting up in the corner. That consistency is what
 * makes twenty-five unrelated shots read as one piece — and none of it can come
 * from an image model, which samples every frame independently.
 *
 * So the look lives here, in code, and the generated image is one element on
 * the page rather than the whole page. A new style is a new Deck, not a rewrite
 * of the composition.
 */

export type CardKind = "specimen" | "statement" | "xray" | "list" | "diagram";

export type DeckColors = {
    /** Page base. Everything else is chosen to sit on it. */
    paper: string;
    /** Display type and rules. Near-black, never pure black — print never is. */
    ink: string;
    /** The one loud colour. At most one line of type per card may use it. */
    accent: string;
    /** Header labels and micro-text: present, not competing. */
    muted: string;
    /** The inverted page (the x-ray plate) swaps to these. */
    darkPaper: string;
    darkInk: string;
};

export type Deck = {
    id: string;
    /** Printed top-left, by card kind. The reference uses CUT / XRAY / LIST. */
    labels: Record<CardKind, string>;
    /** Printed top-right, before the figure number. */
    figurePrefix: string;
    fonts: {
        /**
         * Heavy and condensed. Carries the one or two words that matter.
         *
         * A full CSS stack, not one family, because a deck has to survive a
         * language its display face has no glyphs for. Anton is Latin only, so
         * a Hindi headline on the notebook deck silently fell through to
         * whatever Devanagari face the machine happened to have — which looked
         * fine on the Mac it was rendered on and would not be the same font
         * anywhere else. Teko backs it up, and ships with the repo.
         */
        display: string;
        /** Monospaced or near it. Every small label on the page. */
        label: string;
        /** Display size relative to the grid. Faces of equal point size are not of equal height. */
        displayScale: number;
        /**
         * Line height for stacked display type. Latin can be set tight; Devanagari
         * cannot — matras sit above and below the line and clip at 0.86.
         */
        displayLeading: number;
        /**
         * Tracking for small labels. Latin loves it; Devanagari does not —
         * letterspacing pulls conjuncts apart and the word stops being a word.
         */
        labelTracking: string;
    };
    /** How the figure number is written. Devanagari counts in its own digits. */
    figureNumeral?: (n: number) => string;
    /**
     * How this deck's illustrations are drawn.
     *
     * "isolated on a plain background" is the load-bearing half: the page
     * supplies the paper, the light and the composition, and an illustration
     * that brings its own fights all three. It is also what lets the plate be
     * multiplied onto the stock instead of cut out.
     */
    imageStyle: string;
    /** Devanagari has no case, so uppercasing has to be something a deck opts out of. */
    uppercase: boolean;
    colors: DeckColors;
    paper: {
        /** Ruled feint, like a notebook. */
        rules: boolean;
        /** Punched holes down the left edge. */
        holes: boolean;
        /** The crease of a page that has been folded once. */
        fold: boolean;
        /** A drawn border inset from the edge, the way a manuscript page is set. */
        border: boolean;
        /** 0-1: how much tooth the stock has. Paper is never flat. */
        grain: number;
    };
};

/**
 * Field notebook — science and nature.
 *
 * Lab beige, a red that reads as a marker pen, type set like a specimen label.
 * The punched holes and the fold do more work than they look like they do:
 * they say "this is a page" before a single word has been read.
 */
export const fieldNotebook: Deck = {
    id: "field-notebook",
    labels: {
        specimen: "CUT",
        statement: "TEXT",
        xray: "XRAY",
        list: "LIST",
        diagram: "PLATE",
    },
    figurePrefix: "FIG.",
    fonts: { display: '"Anton", "Teko", sans-serif', label: '"JetBrains Mono", "Mukta", monospace', displayScale: 1, displayLeading: 0.95, labelTracking: "0.22em" },
    uppercase: true,
    colors: {
        paper: "#d6cbae",
        ink: "#2a2118",
        accent: "#c4382a",
        muted: "#8a7c62",
        darkPaper: "#131211",
        darkInk: "#e9e3d4",
    },
    paper: { rules: true, holes: true, fold: true, border: false, grain: 0.5 },
    imageStyle:
        "antique scientific engraving, etched linework, halftone print, single isolated specimen, " +
        "centred on a plain flat white background, no scenery, no shadow, no text",
};

/**
 * Manuscript — the Hindi mythology series.
 *
 * Same engine, different page: no punched holes (nothing was ever filed), a
 * ruled border the way a pothi leaf is set, warmer stock, vermillion in place
 * of marker red. Teko is the display face because it is condensed in Devanagari
 * as well as Latin, which Anton is not — the headline has to be able to say
 * समुद्र मंथन, not only SAMUDRA MANTHAN.
 */
export const manuscript: Deck = {
    id: "manuscript",
    labels: {
        specimen: "चित्र",
        statement: "पाठ",
        xray: "भीतर",
        list: "सूची",
        diagram: "रेखा",
    },
    figurePrefix: "पर्व",
    fonts: { display: '"Teko", "Anton", sans-serif', label: '"Mukta", "JetBrains Mono", monospace', displayScale: 1.22, displayLeading: 1.02, labelTracking: "0.05em" },
    uppercase: false,
    colors: {
        paper: "#e0cfa9",
        ink: "#33210f",
        accent: "#a93116",
        muted: "#8f7850",
        darkPaper: "#17120c",
        darkInk: "#efe2c6",
    },
    paper: { rules: false, holes: false, fold: true, border: true, grain: 0.62 },
    figureNumeral: (n) =>
        String(n)
            .padStart(2, "0")
            .replace(/\d/g, (d) => "०१२३४५६७८९"[Number(d)]),
    imageStyle:
        "indian miniature painting, ink and gouache, flat gold and ochre palette, single isolated " +
        "figure centred on a plain flat cream background, no scenery, no border, no text",
};

export const DECKS: Record<string, Deck> = {
    [fieldNotebook.id]: fieldNotebook,
    [manuscript.id]: manuscript,
};

export function resolveDeck(id: string | undefined): Deck {
    return (id && DECKS[id]) || fieldNotebook;
}
