/**
 * Spells out the numbers in a Hindi script as Hindi words, for speech only.
 *
 * ElevenLabs' multilingual model reads digits inside Devanagari text in
 * English, or as a string of single digits, so "1757 में 80,000 सैनिक" came out
 * as "seventeen fifty-seven में eighty thousand सैनिक" on an English-trained
 * voice. Writing the words ourselves takes the guesswork away: years read the
 * way a Hindi narrator says them ("सत्रह सौ सत्तावन") and large numbers use the
 * Indian system (हज़ार, लाख, करोड़).
 *
 * Like speakable(), this only changes what is SPOKEN. Captions follow the
 * synthesiser's word timings, so they show the words that were said.
 */

/** 0-99 are irregular in Hindi, so they are listed rather than composed. */
const UNDER_100 = [
    "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
    "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
    "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
    "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
    "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
    "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
    "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
    "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी",
    "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
    "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
];

const SCALES: Array<[number, string]> = [
    [10_000_000, "करोड़"],
    [100_000, "लाख"],
    [1_000, "हज़ार"],
    [100, "सौ"],
];

/** A whole number in the Indian system: 250000 → "दो लाख पचास हज़ार". */
export function hindiNumberWords(n: number): string {
    if (!Number.isFinite(n) || n < 0) return String(n);
    n = Math.floor(n);
    if (n < 100) return UNDER_100[n];

    const parts: string[] = [];
    let rest = n;
    for (const [size, name] of SCALES) {
        if (rest >= size) {
            parts.push(`${hindiNumberWords(Math.floor(rest / size))} ${name}`);
            rest %= size;
        }
    }
    if (rest > 0) parts.push(UNDER_100[rest]);
    return parts.join(" ");
}

/**
 * A year the way it is said aloud: 1757 → "सत्रह सौ सत्तावन", 1900 → "उन्नीस सौ".
 * Years from 2000, and the 1000s, read as ordinary numbers ("दो हज़ार चौबीस").
 */
export function hindiYearWords(year: number): string {
    if (year >= 1100 && year < 2000) {
        const hundreds = Math.floor(year / 100);
        const rest = year % 100;
        return rest ? `${UNDER_100[hundreds]} सौ ${UNDER_100[rest]}` : `${UNDER_100[hundreds]} सौ`;
    }
    return hindiNumberWords(year);
}

function decimalWords(digits: string): string {
    return digits
        .split("")
        .map((d) => UNDER_100[Number(d)])
        .join(" ");
}

/** Devanagari digits (०-९) behave exactly like ASCII ones. */
function toAsciiDigits(text: string): string {
    return text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/** One number token as written: "1757", "80,000", "1,00,000", "2.5". */
function spellToken(token: string, asYear: boolean): string {
    const [whole, fraction] = token.replace(/,/g, "").split(".");
    const value = Number(whole);
    if (!Number.isSafeInteger(value)) return token;

    const words = asYear ? hindiYearWords(value) : hindiNumberWords(value);
    return fraction ? `${words} दशमलव ${decimalWords(fraction)}` : words;
}

/** A bare four-digit number in the range years usually fall in. */
function looksLikeYear(token: string): boolean {
    if (!/^\d{4}$/.test(token)) return false;
    const n = Number(token);
    return n >= 1000 && n <= 2099;
}

const NUMBER = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

/**
 * One number as written and as spoken. Captions show `display` over the words
 * the voice actually said for it.
 */
export type SpokenNumber = { display: string; spoken: string };

/**
 * A year span ("1757-64"), a percentage ("2.5%") or a plain number, matched in
 * one pass so the replacements come out in the order they appear.
 */
const TOKEN = new RegExp(
    String.raw`(?<![\w.])(?:(\d{4})\s*[-–—]\s*(\d{2,4})|(${NUMBER})\s*%|(${NUMBER}))(?![\w])`,
    "g",
);

export function spellHindiNumbersWithMap(text: string): { text: string; numbers: SpokenNumber[] } {
    const numbers: SpokenNumber[] = [];
    if (!text) return { text, numbers };

    const out = toAsciiDigits(text).replace(
        TOKEN,
        (match, from?: string, to?: string, percent?: string, plain?: string) => {
            let spoken: string;
            if (from && to) {
                // "1757-64" is a span; a short second half borrows the century.
                const end = to.length === 4 ? to : from.slice(0, 4 - to.length) + to;
                spoken =
                    looksLikeYear(from) && looksLikeYear(end)
                        ? `${spellToken(from, true)} से ${spellToken(end, true)}`
                        : `${spellToken(from, false)} से ${spellToken(to, false)}`;
            } else if (percent) {
                spoken = `${spellToken(percent, false)} प्रतिशत`;
            } else {
                spoken = spellToken(plain!, looksLikeYear(plain!));
            }
            numbers.push({ display: match.trim(), spoken });
            return spoken;
        },
    );

    return { text: out, numbers };
}

export function spellHindiNumbers(text: string): string {
    return spellHindiNumbersWithMap(text).text;
}

type TimedWord = { word: string; start: number; end: number };

const EDGE_PUNCTUATION = /^[\s"'“”‘’(«]+|[\s"'“”‘’)»।.,!?;:…—–-]+$/g;
const bare = (word: string) => word.replace(EDGE_PUNCTUATION, "");

/**
 * Puts the written numbers back into the voice's word timings, so captions
 * read "1757" while the audio says "सत्रह सौ सत्तावन".
 *
 * Each number's spoken words are found in order and merged into one caption
 * word spanning them, keeping any punctuation around the run. A number the
 * voice did not say as expected is left as spoken rather than guessed at, and
 * the search only looks a short way ahead so one miss cannot swallow the rest.
 */
export function restoreDisplayNumbers<W extends TimedWord>(words: W[], numbers: SpokenNumber[]): W[] {
    if (!numbers.length || !words.length) return words;

    const out: W[] = [];
    let i = 0;
    for (const { display, spoken } of numbers) {
        const target = spoken.split(/\s+/);
        const limit = Math.min(words.length - target.length, i + 60);
        let found = -1;
        for (let j = i; j <= limit; j++) {
            if (target.every((t, k) => bare(words[j + k].word) === t)) {
                found = j;
                break;
            }
        }
        if (found < 0) continue;

        out.push(...words.slice(i, found));
        const first = words[found];
        const last = words[found + target.length - 1];
        const lead = first.word.match(/^[\s"'“”‘’(«]+/)?.[0] ?? "";
        const trail = last.word.match(/[\s"'“”‘’)»।.,!?;:…—–-]+$/)?.[0] ?? "";
        out.push({ ...first, word: `${lead}${display}${trail}`, end: last.end });
        i = found + target.length;
    }
    out.push(...words.slice(i));
    return out;
}
