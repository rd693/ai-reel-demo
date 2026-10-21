import { fetchRisingQueries, type RisingQuery } from "./googleTrends";
import { fetchTopVideos, youtubeKey, type TopVideo } from "./youtubeTrends";

export type { RisingQuery, TopVideo };

/**
 * Everything the planner is allowed to know about "right now".
 *
 * Both sources degrade independently: a missing YouTube key or an unreachable
 * trends feed removes one signal and leaves the rest. `notes` records what was
 * missing so the planner's output can say honestly whether a topic was chosen
 * against live data or from evergreen knowledge.
 */
export type TrendSignals = {
    geo: string;
    language: string;
    fetchedAt: Date;
    risingQueries: RisingQuery[];
    topVideos: TopVideo[];
    notes: string[];
};

export type CollectOptions = {
    niche: string;
    language: string;
    geo?: string;
    /** Extra niche phrases to search YouTube for, beyond the niche itself. */
    extraQueries?: string[];
    withinDays?: number;
};

function searchQueries(niche: string, extra: string[] | undefined): string[] {
    return [...new Set([niche, `${niche} shorts`, ...(extra ?? [])].map((q) => q.trim()).filter(Boolean))];
}

export async function collectTrendSignals(opts: CollectOptions): Promise<TrendSignals> {
    const geo = opts.geo || process.env.TRENDS_GEO || "IN";
    const relevanceLanguage = opts.language?.toLowerCase() === "hindi" ? "hi" : "en";
    const notes: string[] = [];

    // Independent on purpose: one source failing must not cost the other.
    const [risingQueries, topVideos] = await Promise.all([
        fetchRisingQueries(geo),
        fetchTopVideos({
            queries: searchQueries(opts.niche, opts.extraQueries),
            regionCode: geo,
            relevanceLanguage,
            withinDays: opts.withinDays ?? 30,
        }),
    ]);

    if (!risingQueries.length) notes.push("Google Trends returned nothing — no rising-query signal.");
    if (!youtubeKey()) {
        notes.push("No YOUTUBE_API_KEY — no signal about which titles are performing in this niche.");
    } else if (!topVideos.length) {
        notes.push("YouTube returned no recent videos for this niche.");
    }

    return {
        geo,
        language: opts.language,
        fetchedAt: new Date(),
        risingQueries,
        topVideos,
        notes,
    };
}

/** Rough age of a video in days, for the briefing. */
function daysAgo(iso: string): number | null {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;
    return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

function compactViews(views: number): string {
    if (views >= 10_000_000) return `${(views / 10_000_000).toFixed(1)}cr`;
    if (views >= 100_000) return `${(views / 100_000).toFixed(1)}L`;
    if (views >= 1_000) return `${Math.round(views / 1_000)}k`;
    return String(views);
}

/**
 * The signals as prompt text.
 *
 * Deliberately labelled rather than dumped: the rising queries are introduced
 * as *mostly irrelevant* because for this niche they usually are, and a model
 * handed an unlabelled list of today's searches will dutifully write a
 * mythology reel about a cricket match.
 */
export function renderTrendBriefing(signals: TrendSignals): string {
    const parts: string[] = [];

    if (signals.risingQueries.length) {
        const lines = signals.risingQueries
            .slice(0, 10)
            .map((q) => {
                const headline = q.headlines[0] ? ` — "${q.headlines[0]}"` : "";
                return `- ${q.query} (${q.traffic.toLocaleString()}+ searches)${headline}`;
            })
            .join("\n");

        parts.push(
            `RISING SEARCHES IN ${signals.geo} TODAY (general feed — most of these will have nothing to do with this niche, and that is expected):\n${lines}`,
        );
    }

    if (signals.topVideos.length) {
        const lines = signals.topVideos
            .slice(0, 15)
            .map((v) => {
                const age = daysAgo(v.publishedAt);
                const form = v.durationSeconds && v.durationSeconds <= 180 ? "short" : "long";
                return `- "${v.title}" — ${compactViews(v.views)} views${age === null ? "" : `, ${age}d old`}, ${form}, ${v.channel}`;
            })
            .join("\n");

        parts.push(
            `ALREADY PERFORMING IN THIS NICHE (recent, by views — study which subjects and which title shapes earn clicks, do not copy a title):\n${lines}`,
        );
    }

    if (signals.notes.length) {
        parts.push(`SIGNAL GAPS:\n${signals.notes.map((n) => `- ${n}`).join("\n")}`);
    }

    return parts.join("\n\n") || "No live trend data was available for this run.";
}
