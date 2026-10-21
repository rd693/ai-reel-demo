/**
 * What India is searching for today, from Google Trends' RSS feed.
 *
 * No key and no quota, which is why it is the default signal. Two caveats are
 * worth knowing before trusting the output:
 *
 *   1. It is a *general* feed. For a history and mythology channel most of a
 *      given day's queries are cricket, films and politics — genuinely
 *      irrelevant. The planner is told to use a query only where a real bridge
 *      exists (a festival, an anniversary, a film about a historical figure)
 *      and to fall back to evergreen otherwise. Forcing a tie-in to whatever
 *      is rising is how a mythology channel ends up posting about a cricketer.
 *   2. The feed is the day's top ten, not a niche query tool. It tells you what
 *      the country is looking at, not what your audience wants next.
 *
 * The endpoint moved: /trends/trendingsearches/daily/rss now answers 404 and
 * /trending/rss is the live one.
 */

const RSS_URL = "https://trends.google.com/trending/rss";

export type RisingQuery = {
    query: string;
    /** Searches, parsed from "1000+". 0 when the feed omitted it. */
    traffic: number;
    /** News headlines Google attached to the query — the actual context. */
    headlines: string[];
};

/** XML entities, plus CDATA wrappers, that appear in the feed's titles. */
function decodeXml(raw: string): string {
    return raw
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        // Ampersand last: decoding it first would let "&amp;lt;" become "<".
        .replace(/&amp;/g, "&")
        .trim();
}

function tag(block: string, name: string): string | null {
    const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return match ? decodeXml(match[1]) : null;
}

function allTags(block: string, name: string): string[] {
    const found = block.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"));
    return [...found].map((m) => decodeXml(m[1])).filter(Boolean);
}

/**
 * The day's rising queries for a region, most-searched first.
 *
 * Returns an empty array rather than throwing: a planner that cannot reach
 * Google should still plan from evergreen knowledge, not fail.
 */
export async function fetchRisingQueries(geo = "IN"): Promise<RisingQuery[]> {
    try {
        const res = await fetch(`${RSS_URL}?geo=${encodeURIComponent(geo)}`, {
            headers: {
                // The feed answers an unidentified client inconsistently.
                "User-Agent": "ai-reel-factory/1.0 (+topic planner)",
                Accept: "application/rss+xml, application/xml, text/xml",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            console.warn(`[trends] Google Trends RSS returned ${res.status}`);
            return [];
        }

        const xml = await res.text();
        const items = xml.split("<item>").slice(1);

        const queries = items
            .map((block) => {
                const query = tag(block, "title");
                if (!query) return null;
                const traffic = tag(block, "ht:approx_traffic") ?? "";
                return {
                    query,
                    traffic: Number(traffic.replace(/[^0-9]/g, "")) || 0,
                    headlines: allTags(block, "ht:news_item_title").slice(0, 3),
                } satisfies RisingQuery;
            })
            .filter((q): q is RisingQuery => q !== null)
            .sort((a, b) => b.traffic - a.traffic);

        console.log(`[trends] Google Trends (${geo}): ${queries.length} rising queries`);
        return queries;
    } catch (error) {
        console.warn("[trends] Google Trends fetch failed:", error);
        return [];
    }
}
