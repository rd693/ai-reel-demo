export type Frequency = "daily" | "weekly" | "manual";

export const INTERVAL_MS: Record<Exclude<Frequency, "manual">, number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Statuses that mean a reel is still being worked on. */
export const IN_FLIGHT_STATUSES = ["pending", "scripted", "voicing", "visualizing", "rendering"];

export type DueInput = {
    frequency: string;
    status: string;
    /** When this series last produced a reel; undefined if it never has. */
    lastGeneratedAt?: Date | null;
    /** True when a reel for this series is mid-pipeline. */
    hasInFlightReel: boolean;
};

export type DueVerdict = { due: boolean; reason: string; nextDueAt?: Date };

/**
 * Decides whether a series should generate right now.
 *
 * Kept pure and separate from the database so the rules can be reasoned about
 * and tested directly — the failure mode of a scheduler is generating far too
 * much, and that is expensive in API calls.
 */
export function isDue(series: DueInput, now: Date = new Date()): DueVerdict {
    if (series.status !== "active") return { due: false, reason: "series is paused" };
    if (series.frequency === "manual") return { due: false, reason: "frequency is manual" };

    const interval = INTERVAL_MS[series.frequency as Exclude<Frequency, "manual">];
    if (!interval) return { due: false, reason: `unknown frequency "${series.frequency}"` };

    // One at a time per series. Without this, a slow reel would be joined by a
    // second on the next tick, and both would bill the same providers.
    if (series.hasInFlightReel) return { due: false, reason: "a reel is already generating" };

    if (!series.lastGeneratedAt) return { due: true, reason: "no reels yet" };

    const elapsed = now.getTime() - new Date(series.lastGeneratedAt).getTime();
    if (elapsed >= interval) {
        return { due: true, reason: `last reel was ${Math.floor(elapsed / 3600000)}h ago` };
    }

    return {
        due: false,
        reason: `next due in ${Math.ceil((interval - elapsed) / 60000)}m`,
        nextDueAt: new Date(new Date(series.lastGeneratedAt).getTime() + interval),
    };
}
