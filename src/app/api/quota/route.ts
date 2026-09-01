import { NextResponse } from "next/server";

/**
 * Remaining ElevenLabs character quota.
 *
 * Exists because voiceover is the one stage that re-bills on every run, and
 * finding out you are out of characters halfway through a batch is expensive
 * in time rather than money — the reel is left half-generated.
 *
 * The key stays on the server. This endpoint returns only the counts.
 */

export type QuotaView =
    | {
          available: true;
          tier: string;
          used: number;
          limit: number;
          remaining: number;
          percentUsed: number;
          resetsAt: string | null;
      }
    | { available: false; reason: string };

/**
 * Cached briefly: the dashboard reads this on every visit, and the number
 * only moves when a reel is generated.
 */
let cache: { at: number; body: QuotaView } | null = null;
const CACHE_MS = 60_000;

export async function GET() {
    if (cache && Date.now() - cache.at < CACHE_MS) {
        return NextResponse.json(cache.body);
    }

    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ available: false, reason: "No ElevenLabs key configured" });
    }

    try {
        const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
            headers: { "xi-api-key": apiKey },
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            // 401 here is usually a scoped key rather than a bad one: the
            // `user_read` permission is off by default, and everything else in
            // the app keeps working without it.
            const detail = await res.json().catch(() => null);
            const message = detail?.detail?.message ?? `HTTP ${res.status}`;
            const body: QuotaView = {
                available: false,
                reason: res.status === 401 ? "Key lacks the user_read permission" : message,
            };
            cache = { at: Date.now(), body };
            return NextResponse.json(body);
        }

        const data = await res.json();
        const used = Number(data.character_count ?? 0);
        const limit = Number(data.character_limit ?? 0);

        const body: QuotaView = {
            available: true,
            tier: String(data.tier ?? "unknown"),
            used,
            limit,
            remaining: Math.max(0, limit - used),
            percentUsed: limit > 0 ? (used / limit) * 100 : 0,
            resetsAt: data.next_character_count_reset_unix
                ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
                : null,
        };

        cache = { at: Date.now(), body };
        return NextResponse.json(body);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Quota lookup failed";
        return NextResponse.json({ available: false, reason: message });
    }
}
