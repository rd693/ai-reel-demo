"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ArrowUp,
    ChevronDown,
    ChevronRight,
    Lightbulb,
    Loader2,
    Sparkles,
    Trash2,
    TrendingUp,
    X,
    MonitorPlay,
} from "lucide-react";

import type { TopicIdea } from "@/lib/db/topicRepo";

/**
 * The topic queue for a series.
 *
 * The queue is the difference between a channel and a generator: the
 * scheduler takes the top entry instead of re-deriving a subject from the
 * niche on every run. It is editable here because a planner that cannot be
 * overruled is worse than no planner — the whole point is to review what is
 * about to be made before it costs a narration and ten images.
 */

type PlanSummary = {
    inserted: number;
    duplicates: number;
    provider: string;
    geo: string;
    risingQueries: number;
    nicheVideos: number;
    notes: string[];
};

const SOURCE_BADGES: Record<string, { label: string; className: string; icon: typeof TrendingUp }> = {
    "google-trends": {
        label: "Trending",
        className: "bg-rose-50 text-rose-700 border-rose-200",
        icon: TrendingUp,
    },
    youtube: {
        label: "Niche signal",
        className: "bg-red-50 text-red-700 border-red-200",
        icon: MonitorPlay,
    },
    evergreen: {
        label: "Evergreen",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: Lightbulb,
    },
};

function SourceBadge({ source }: { source: string }) {
    const badge = SOURCE_BADGES[source] ?? SOURCE_BADGES.evergreen;
    const Icon = badge.icon;
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold ${badge.className}`}
        >
            <Icon size={11} />
            {badge.label}
        </span>
    );
}

/** Score colour: the planner is asked to spread these, so show the spread. */
function scoreClass(score: number): string {
    if (score >= 75) return "bg-emerald-100 text-emerald-800";
    if (score >= 50) return "bg-amber-100 text-amber-800";
    return "bg-slate-100 text-slate-600";
}

export function TopicQueue({ seriesId }: { seriesId: string }) {
    const [topics, setTopics] = useState<TopicIdea[]>([]);
    const [loading, setLoading] = useState(true);
    const [planning, setPlanning] = useState(false);
    const [summary, setSummary] = useState<PlanSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/series/${seriesId}/topics`);
            if (!res.ok) throw new Error("Could not load the topic queue");
            const data = await res.json();
            setTopics(data.topics ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [seriesId]);

    useEffect(() => {
        void load();
    }, [load]);

    const plan = async () => {
        setPlanning(true);
        setError(null);
        setSummary(null);
        try {
            const res = await fetch(`/api/series/${seriesId}/topics`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ count: 20 }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Planning failed");

            setSummary({
                inserted: data.inserted?.length ?? 0,
                duplicates: data.duplicates?.length ?? 0,
                provider: data.provider,
                geo: data.signals?.geo ?? "",
                risingQueries: data.signals?.risingQueries ?? 0,
                nicheVideos: data.signals?.nicheVideos ?? 0,
                notes: data.signals?.notes ?? [],
            });
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPlanning(false);
        }
    };

    const patch = async (topicId: string, body: Record<string, unknown>) => {
        await fetch(`/api/series/${seriesId}/topics/${topicId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        await load();
    };

    const remove = async (topicId: string) => {
        await fetch(`/api/series/${seriesId}/topics/${topicId}`, { method: "DELETE" });
        await load();
    };

    const planned = topics.filter((t) => t.status === "planned");
    const history = topics.filter((t) => t.status !== "planned");
    // Moving a topic to the front means beating the current lowest sortOrder,
    // not renumbering the queue.
    const frontOfQueue = planned.length ? Math.min(...planned.map((t) => t.sortOrder)) - 1 : 0;

    return (
        <div className="space-y-6 mb-10">
            <div className="flex items-center justify-between ml-2">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Sparkles size={22} className="text-indigo-600" />
                    Topic Queue
                    {planned.length > 0 && (
                        <span className="text-sm font-bold text-slate-400">{planned.length} waiting</span>
                    )}
                </h2>

                <button
                    onClick={plan}
                    disabled={planning}
                    className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                >
                    {planning ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {planning ? "Reading trends…" : "Plan topics"}
                </button>
            </div>

            {summary && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 text-sm">
                    <p className="font-bold text-indigo-900">
                        Added {summary.inserted} topic{summary.inserted === 1 ? "" : "s"}
                        {summary.duplicates > 0 && (
                            <span className="font-medium text-indigo-700">
                                {" "}
                                · dropped {summary.duplicates} already in the queue
                            </span>
                        )}
                    </p>
                    <p className="text-indigo-700 mt-1">
                        Planned by {summary.provider} from {summary.risingQueries} rising searches in{" "}
                        {summary.geo} and {summary.nicheVideos} recent videos in this niche.
                    </p>
                    {summary.notes.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-indigo-600">
                            {summary.notes.map((note) => (
                                <li key={note}>· {note}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-800 flex items-start gap-2">
                    <X size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div className="py-10 text-center text-slate-400">
                    <Loader2 className="animate-spin mx-auto" size={22} />
                </div>
            ) : planned.length === 0 ? (
                <div className="py-12 px-8 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                    <Sparkles className="mx-auto text-slate-300 mb-3" size={28} />
                    <p className="font-bold text-slate-700">No topics planned</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                        Until there are, a scheduled reel falls back to generating from the niche — the same
                        one line every run, which is how a channel ends up repeating itself. Plan a batch and
                        the scheduler works through it in order.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {planned.map((topic, index) => (
                        <div
                            key={topic.id}
                            className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 transition-all"
                        >
                            <div className="flex items-start gap-4">
                                <span
                                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${scoreClass(topic.score)}`}
                                    title={`Planner confidence: ${topic.score}/100`}
                                >
                                    {topic.score}
                                </span>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {index === 0 && (
                                            <span className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold">
                                                Next up
                                            </span>
                                        )}
                                        <SourceBadge source={topic.trendSource} />
                                    </div>

                                    <p className="font-bold text-slate-900 mt-2 break-words">{topic.title}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Depicts: <span className="font-semibold">{topic.subject}</span>
                                    </p>
                                    {topic.angle && (
                                        <p className="text-sm text-slate-600 mt-2 italic">{topic.angle}</p>
                                    )}
                                    {topic.rationale && (
                                        <p className="text-xs text-slate-400 mt-1">{topic.rationale}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {index > 0 && (
                                        <button
                                            onClick={() => patch(topic.id, { sortOrder: frontOfQueue })}
                                            title="Make this the next reel"
                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        >
                                            <ArrowUp size={16} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => patch(topic.id, { status: "skipped" })}
                                        title="Skip — keeps it out of future batches"
                                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                    >
                                        <X size={16} />
                                    </button>
                                    <button
                                        onClick={() => remove(topic.id)}
                                        title="Delete"
                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {history.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowHistory((v) => !v)}
                        className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 ml-2"
                    >
                        {showHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        {history.length} used or skipped
                    </button>

                    {showHistory && (
                        <div className="mt-3 space-y-2">
                            {history.map((topic) => (
                                <div
                                    key={topic.id}
                                    className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl text-sm"
                                >
                                    <span
                                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                            topic.status === "used"
                                                ? "bg-slate-200 text-slate-600"
                                                : "bg-amber-100 text-amber-700"
                                        }`}
                                    >
                                        {topic.status}
                                    </span>
                                    <span className="text-slate-600 truncate flex-1">{topic.title}</span>
                                    {topic.status === "skipped" && (
                                        <button
                                            onClick={() => patch(topic.id, { status: "planned" })}
                                            className="text-xs font-bold text-indigo-600 hover:underline shrink-0"
                                        >
                                            Restore
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
