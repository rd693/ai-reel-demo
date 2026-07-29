import type { FacelessReel, Series } from "../../types/series";

// Keys written by the old localStorage store.
const SERIES_KEY = "faceless_reels_series";
const REELS_PREFIX = "reels_";
// Set once an import succeeds, so the banner does not reappear.
const DONE_KEY = "faceless_reels_migrated_to_db";

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

/** How many legacy series are sitting in this browser, if any. */
export function countLegacySeries(): number {
    if (typeof window === "undefined") return 0;
    if (localStorage.getItem(DONE_KEY)) return 0;
    return readJson<Series[]>(SERIES_KEY, []).length;
}

export type ImportResult = {
    imported: { series: number; reels: number };
    skipped: string[];
};

export async function importLegacyData(): Promise<ImportResult> {
    const series = readJson<Series[]>(SERIES_KEY, []);
    const reelsBySeries: Record<string, FacelessReel[]> = {};
    for (const s of series) {
        reelsBySeries[s.id] = readJson<FacelessReel[]>(`${REELS_PREFIX}${s.id}`, []);
    }

    const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series, reelsBySeries }),
    });

    if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Import failed");
    }

    const result = (await res.json()) as ImportResult;

    // The old keys are left in place deliberately: the data is now in SQLite,
    // but keeping the originals means a failed or partial import is still
    // recoverable. Only the banner is dismissed.
    localStorage.setItem(DONE_KEY, new Date().toISOString());

    return result;
}
