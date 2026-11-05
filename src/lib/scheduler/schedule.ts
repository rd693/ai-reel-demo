export type Frequency = "daily" | "weekly" | "manual";

export const INTERVAL_MS: Record<Exclude<Frequency, "manual">, number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Statuses that mean a reel is still being worked on. */
export const IN_FLIGHT_STATUSES = ["pending", "scripted", "voicing", "visualizing", "rendering"];

/**
 * Marks a failure the scheduler may retry on its own.
 *
 * A reel stopped by a dropped connection or a stopped app has nothing wrong with
 * it, and retrying costs only the stages still missing. A failure carrying any
 * other message stays put until someone looks at it: a rejected prompt would
 * fail, and bill, the same way every five minutes.
 */
const PAUSED_PREFIX = "Paused:";

export const PAUSED_NO_INTERNET = `${PAUSED_PREFIX} no internet connection.`;
export const PAUSED_INTERRUPTED = `${PAUSED_PREFIX} the app stopped before this reel finished.`;

export function isPausedError(error: string | null | undefined): boolean {
    return !!error?.startsWith(PAUSED_PREFIX);
}

/** The filter form of isPausedError, for queries. */
export const PAUSED_ERROR_FILTER = { startsWith: PAUSED_PREFIX };

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
