"use client";

import { useState } from "react";
import { Check, Clapperboard, Copy, Loader2, RefreshCw } from "lucide-react";
import { seriesStore } from "@/lib/series/seriesStore";
import type { PublishCopy } from "@/types/series";

/**
 * The reel's YouTube upload copy, one copy button per field of the upload form.
 *
 * Fields are shown in the order YouTube Studio asks for them, so pasting is a
 * walk down the page rather than a hunt.
 */
export function PublishCopyPanel({
    reelId,
    copy,
    canWrite,
    onChange,
}: {
    reelId: string;
    copy?: PublishCopy;
    /** False until the reel has a script to write from. */
    canWrite: boolean;
    onChange: (copy: PublishCopy) => void;
}) {
    const [writing, setWriting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const write = async () => {
        setWriting(true);
        setError(null);
        try {
            onChange(await seriesStore.writePublishCopy(reelId));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not write the upload copy");
        } finally {
            setWriting(false);
        }
    };

    return (
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
                    <Clapperboard size={20} className="text-red-600" />
                    YouTube Upload Copy
                </h2>
                {canWrite && (
                    <button
                        onClick={write}
                        disabled={writing}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {writing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {copy ? "Rewrite" : "Write copy"}
                    </button>
                )}
            </div>

            {error && <p className="text-sm font-bold text-red-500">{error}</p>}

            {!copy ? (
                <p className="text-slate-500 font-medium">
                    {canWrite
                        ? "No upload copy yet. Write it to get a title, description, hashtags and tags for this reel."
                        : "Upload copy is written once the script is ready."}
                </p>
            ) : (
                <div className="space-y-5">
                    <Field label="Title" text={copy.title} hint={`${copy.title.length}/100`} />
                    <Field label="Description" text={copy.description} multiline />
                    <Field label="Hashtags" text={copy.hashtags.join(" ")} />
                    <Field label="Tags" text={copy.tags.join(", ")} hint={`${copy.tags.length} tags`} />
                    {copy.pinnedComment && <Field label="Pinned comment" text={copy.pinnedComment} />}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Setting label="Category" value={copy.settings.category} />
                        <Setting label="Video language" value={copy.settings.language} />
                        <Setting label="Made for kids" value="No" />
                        <Setting
                            label="Altered or synthetic content"
                            value={copy.settings.alteredContent ? "Yes — realistic AI imagery" : "No — stylised art"}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, text, hint, multiline }: { label: string; text: string; hint?: string; multiline?: boolean }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard access can be refused; the text is still selectable.
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {label}
                    {hint && <span className="ml-2 normal-case tracking-normal font-bold text-slate-300">{hint}</span>}
                </span>
                <button
                    onClick={copy}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <div
                className={`bg-slate-50 rounded-2xl px-5 py-4 text-slate-800 font-medium break-words ${
                    multiline ? "whitespace-pre-wrap leading-relaxed" : ""
                }`}
            >
                {text}
            </div>
        </div>
    );
}

function Setting({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-slate-50 rounded-2xl px-5 py-3">
            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
            <span className="block text-sm font-bold text-slate-800 mt-1">{value}</span>
        </div>
    );
}
