"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Play, Pause, Layers, Trash2, ChevronRight, Film, Clock, FolderOpen, Loader2, CalendarClock } from "lucide-react";
import { seriesStore } from "../../../lib/series/seriesStore";
import { Series, NicheType } from "../../../types/series";
import { countLegacySeries, importLegacyData } from "../../../lib/series/legacyImport";

const NICHE_LABELS: Record<NicheType, string> = {
    mythology: "Mythology",
    scary_stories: "Scary Stories",
    history: "History",
    ai_news: "AI News",
    motivation: "Motivation",
    school_gossip: "School Gossip"
};

const NICHE_COLORS: Record<NicheType, string> = {
    mythology: "bg-violet-100 text-violet-700",
    scary_stories: "bg-slate-700 text-slate-100",
    history: "bg-amber-100 text-amber-700",
    ai_news: "bg-blue-100 text-blue-700",
    motivation: "bg-green-100 text-green-700",
    school_gossip: "bg-pink-100 text-pink-700",
};

function sortNewestFirst(arr: Series[]) {
    return [...arr].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export default function SeriesDashboardPage() {
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setSeries(sortNewestFirst(await seriesStore.getAll()));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load series");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Scheduler's own view of each series: whether it is due and when next.
    // Read from the dry-run endpoint so the page shows the same verdict the
    // worker will act on, rather than recomputing the rules in the client.
    const [schedule, setSchedule] = useState<Record<string, { due: boolean; reason: string }>>({});

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/cron/tick");
                if (!res.ok) return;
                const data = await res.json();
                setSchedule(
                    Object.fromEntries(
                        data.series.map((s: { id: string; due: boolean; reason: string }) => [
                            s.id,
                            { due: s.due, reason: s.reason },
                        ]),
                    ),
                );
            } catch {
                // Schedule detail is supplementary; the list still works without it.
            }
        })();
    }, [series]);

    // Data created before the SQLite migration still lives in this browser.
    const [legacyCount, setLegacyCount] = useState(0);
    const [importing, setImporting] = useState(false);
    const [importNote, setImportNote] = useState<string | null>(null);

    useEffect(() => {
        setLegacyCount(countLegacySeries());
    }, []);

    const handleImport = async () => {
        setImporting(true);
        try {
            const { imported, skipped } = await importLegacyData();
            setImportNote(
                `Imported ${imported.series} series and ${imported.reels} reels` +
                    (skipped.length ? ` (${skipped.length} already present)` : "") + ".",
            );
            setLegacyCount(0);
            await refresh();
        } catch (e) {
            setImportNote(e instanceof Error ? e.message : "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const handleToggle = async (id: string) => {
        // Reflect the flip immediately, then reconcile with what the server saved.
        setSeries((current) =>
            current.map((s) =>
                s.id === id ? { ...s, status: s.status === "active" ? "paused" : "active" } : s,
            ),
        );
        try {
            await seriesStore.toggleStatus(id);
        } finally {
            void refresh();
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this series and all its reels?")) return;
        try {
            await seriesStore.deleteSeries(id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete series");
        }
        void refresh();
    };

    return (
        <div className="max-w-5xl mx-auto p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Content Series</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage your automated video channels</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/assets"
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-semibold transition-colors shadow-sm text-sm"
                    >
                        <FolderOpen size={16} />
                        Assets
                    </Link>
                    <Link
                        href="/dashboard/series/new"
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors shadow-sm text-sm"
                    >
                        <Plus size={16} />
                        New Series
                    </Link>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
                    {error}
                </div>
            )}

            {legacyCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-4">
                    <p className="text-amber-800 text-sm">
                        Found <strong>{legacyCount}</strong> series saved in this browser from before
                        the database migration. Import them to keep them.
                    </p>
                    <button
                        onClick={handleImport}
                        disabled={importing}
                        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-colors"
                    >
                        {importing ? "Importing…" : "Import now"}
                    </button>
                </div>
            )}

            {importNote && (
                <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 mb-4 text-sm">
                    {importNote}
                </div>
            )}

            {/* Series load over the network now, so an explicit loading state
                keeps the empty state from flashing on every visit. */}
            {loading ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                    <Loader2 size={32} className="mx-auto text-slate-300 mb-3 animate-spin" />
                    <p className="text-slate-500 text-sm">Loading series…</p>
                </div>
            ) : series.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                    <Layers size={48} className="mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">No series yet</h3>
                    <p className="text-slate-500 mt-2 mb-6 max-w-md mx-auto text-sm">
                        Create a series to start generating and posting faceless reels on auto-pilot.
                    </p>
                    <Link
                        href="/dashboard/series/new"
                        className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-5 py-2.5 rounded-xl font-semibold transition-colors text-sm"
                    >
                        <Plus size={16} />
                        Create Your First Series
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {series.map((item) => (
                        <div
                            key={item.id}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all flex flex-col sm:flex-row sm:items-center gap-4 p-5"
                        >
                            {/* Icon */}
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                <Film size={20} className="text-indigo-500" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <Link
                                        href={`/dashboard/series/${item.id}`}
                                        className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-base"
                                    >
                                        {item.name}
                                    </Link>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${NICHE_COLORS[item.niche] ?? "bg-slate-100 text-slate-600"}`}>
                                        {NICHE_LABELS[item.niche] ?? item.niche}
                                    </span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${item.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                        {item.status}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-medium">
                                    {/* What the scheduler intends to do with this series. */}
                                    <span
                                        className={`flex items-center gap-1 ${schedule[item.id]?.due ? "text-emerald-600" : ""}`}
                                        title={schedule[item.id]?.reason ?? ""}
                                    >
                                        <CalendarClock size={11} />
                                        {item.frequency === "manual"
                                            ? "manual"
                                            : schedule[item.id]
                                              ? schedule[item.id].due
                                                  ? `${item.frequency} · due now`
                                                  : `${item.frequency} · ${schedule[item.id].reason}`
                                              : item.frequency}
                                    </span>
                                    <span>·</span>
                                    <span className="capitalize">{item.artStyle.replace(/_/g, " ")}</span>
                                    <span>·</span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={11} />
                                        {item.targetDuration ?? 60}s
                                    </span>
                                    <span>·</span>
                                    <span className="capitalize">{item.frequency}</span>
                                    {item.targetPlatforms?.length > 0 && (
                                        <>
                                            <span>·</span>
                                            <span>{item.targetPlatforms.join(", ")}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Actions — always visible, no hover needed */}
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                <Link
                                    href={`/dashboard/series/${item.id}`}
                                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold text-xs transition-colors whitespace-nowrap"
                                >
                                    Open <ChevronRight size={13} />
                                </Link>
                                <button
                                    onClick={() => handleToggle(item.id)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs transition-colors border whitespace-nowrap ${
                                        item.status === "active"
                                            ? "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                    }`}
                                >
                                    {item.status === "active" ? <Pause size={12} /> : <Play size={12} />}
                                    {item.status === "active" ? "Pause" : "Resume"}
                                </button>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                                    title="Delete Series"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
