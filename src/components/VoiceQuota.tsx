"use client";

import { useEffect, useState } from "react";
import { Mic, AlertTriangle } from "lucide-react";

type QuotaView =
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
 * Characters a 60s reel costs, give or take.
 *
 * WORDS_PER_SECOND is 2.6 (measured across six real voiceovers), so 60s is
 * ~156 words. At roughly 6.5 characters a word including spaces that is ~1,000.
 * Devanagari runs longer than Latin, so treat the reel count as a ceiling
 * rather than a promise — it is there to answer "can I start a batch?", not to
 * be exact.
 */
const CHARS_PER_60S_REEL = 1000;

/**
 * Remaining voiceover quota.
 *
 * Voiceover is the one pipeline stage that re-bills on every run, and running
 * out mid-batch leaves reels half-generated rather than merely unstarted.
 */
export function VoiceQuota() {
    const [quota, setQuota] = useState<QuotaView | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/quota");
                if (!cancelled) setQuota(await res.json());
            } catch {
                // A missing quota readout is not worth an error state on the page.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!quota) return null;

    if (!quota.available) {
        return (
            <div
                className="flex items-center gap-2 text-xs font-semibold text-slate-400 px-3 py-2"
                title={quota.reason}
            >
                <AlertTriangle size={13} />
                Voice quota unavailable
            </div>
        );
    }

    const low = quota.percentUsed >= 90;
    const warn = quota.percentUsed >= 75;
    const reelsLeft = Math.floor(quota.remaining / CHARS_PER_60S_REEL);

    const tone = low
        ? { text: "text-red-600", bar: "bg-red-500", track: "bg-red-100" }
        : warn
          ? { text: "text-amber-600", bar: "bg-amber-500", track: "bg-amber-100" }
          : { text: "text-slate-700", bar: "bg-indigo-500", track: "bg-slate-100" };

    return (
        <div
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[190px]"
            title={
                `${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} characters used` +
                (quota.resetsAt ? ` — resets ${new Date(quota.resetsAt).toLocaleDateString()}` : "")
            }
        >
            <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <Mic size={11} /> Voice
                </span>
                <span className={`text-xs font-black ${tone.text}`}>
                    {quota.remaining.toLocaleString()} left
                </span>
            </div>

            <div className={`h-1.5 rounded-full overflow-hidden ${tone.track}`}>
                <div
                    className={`h-full rounded-full transition-all ${tone.bar}`}
                    // A floor keeps a small usage visible, but zero has to read
                    // as zero — a sliver of bar on a fresh quota is a small lie.
                    style={{ width: `${quota.used === 0 ? 0 : Math.min(100, Math.max(2, quota.percentUsed))}%` }}
                />
            </div>

            <div className="text-[10px] font-bold text-slate-400 mt-1.5">
                {/* The character count is the truth; this is the version that
                    answers the question actually being asked. */}
                ≈ {reelsLeft} more 60s {reelsLeft === 1 ? "reel" : "reels"}
                {quota.resetsAt && ` · resets ${new Date(quota.resetsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
            </div>
        </div>
    );
}
