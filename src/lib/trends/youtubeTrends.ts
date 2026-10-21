/**
 * What is already working in this niche, from YouTube search.
 *
 * For a history and mythology channel this matters more than the general
 * trends feed: it answers "which subjects and which title shapes are pulling
 * views in my niche *this month*", which is the question a planner actually
 * needs. The trends feed can only say what the country is searching for.
 *
 * Read-only, so it needs an API key and no OAuth — unrelated to uploading,
 * which needs a user's consent. Quota is the thing to watch: search.list costs
 * 100 units of a 10,000/day default, so MAX_QUERIES caps one planning run at
 * ~400 units. Planning monthly, that is nothing; polling it hourly would not
 * be.
 */

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

/** search.list costs 100 quota units per call, so the fan-out is capped. */
const MAX_QUERIES = 4;

export type TopVideo = {
    videoId: string;
    title: string;
    channel: string;
    publishedAt: string;
    views: number;
    /** Runtime in seconds — lets the planner tell a Short from a documentary. */
    durationSeconds: number;
};

export type YouTubeTrendOptions = {
    /** Niche phrases to search, e.g. ["भारतीय इतिहास", "Indian mythology"]. */
    queries: string[];
    regionCode?: string;
    relevanceLanguage?: string;
    /** Only consider videos published within this window. */
    withinDays?: number;
    /** Cap on returned videos after merging and ranking. */
    limit?: number;
};

export function youtubeKey(): string | undefined {
    return process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
}

/** "PT4M13S" -> 253. YouTube reports duration in ISO 8601. */
function parseDuration(iso: string | undefined): number {
    if (!iso) return 0;
    const m = iso.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    const [, d, h, min, s] = m;
    return Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(min || 0) * 60 + Number(s || 0);
}

async function searchIds(query: string, opts: YouTubeTrendOptions, key: string): Promise<string[]> {
    const publishedAfter = new Date(
        Date.now() - (opts.withinDays ?? 30) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        order: "viewCount",
        q: query,
        maxResults: "15",
        publishedAfter,
        key,
    });
    if (opts.regionCode) params.set("regionCode", opts.regionCode);
    if (opts.relevanceLanguage) params.set("relevanceLanguage", opts.relevanceLanguage);

    const res = await fetch(`${SEARCH_URL}?${params}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
        // 403 here is almost always quota exhausted or a key without the Data
        // API enabled, and both are worth saying out loud rather than logging
        // as a generic failure.
        const body = await res.text().catch(() => "");
        console.warn(`[trends] YouTube search failed (${res.status}): ${body.slice(0, 200)}`);
        return [];
    }

    const data = await res.json();
    return (data.items ?? [])
        .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter((id: unknown): id is string => typeof id === "string");
}

/** videos.list costs 1 unit and is the only way to get view counts. */
async function hydrate(ids: string[], key: string): Promise<TopVideo[]> {
    if (!ids.length) return [];

    const params = new URLSearchParams({
        part: "snippet,statistics,contentDetails",
        id: ids.slice(0, 50).join(","),
        key,
    });

    const res = await fetch(`${VIDEOS_URL}?${params}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        console.warn(`[trends] YouTube videos.list failed (${res.status})`);
        return [];
    }

    const data = await res.json();
    type Row = {
        id: string;
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
        statistics?: { viewCount?: string };
        contentDetails?: { duration?: string };
    };

    return (data.items ?? [])
        .map((row: Row) => ({
            videoId: row.id,
            title: row.snippet?.title ?? "",
            channel: row.snippet?.channelTitle ?? "",
            publishedAt: row.snippet?.publishedAt ?? "",
            views: Number(row.statistics?.viewCount ?? 0),
            durationSeconds: parseDuration(row.contentDetails?.duration),
        }))
        .filter((v: TopVideo) => v.title);
}

/**
 * Best-performing recent videos across the given niche queries, by views.
 *
 * Returns an empty array when there is no API key — the planner degrades to
 * the trends feed and its own knowledge rather than failing.
 */
export async function fetchTopVideos(opts: YouTubeTrendOptions): Promise<TopVideo[]> {
    const key = youtubeKey();
    if (!key) {
        console.log("[trends] No YOUTUBE_API_KEY; skipping the YouTube signal");
        return [];
    }

    const queries = opts.queries.filter(Boolean).slice(0, MAX_QUERIES);
    if (!queries.length) return [];

    try {
        const idLists = await Promise.all(queries.map((q) => searchIds(q, opts, key)));
        const ids = [...new Set(idLists.flat())];
        const videos = await hydrate(ids, key);

        const ranked = videos.sort((a, b) => b.views - a.views).slice(0, opts.limit ?? 20);
        console.log(
            `[trends] YouTube: ${ranked.length} videos from ${queries.length} queries (~${queries.length * 100 + 1} quota units)`,
        );
        return ranked;
    } catch (error) {
        console.warn("[trends] YouTube fetch failed:", error);
        return [];
    }
}
