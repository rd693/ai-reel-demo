"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Play, Pause, Loader2, Sparkles } from "lucide-react";

export type Voice = {
    id: string;
    name: string;
    language: string;
    gender?: string;
    useCase?: string;
    descriptive?: string;
    description?: string;
    previewUrl?: string;
    category?: string;
};

const LANGUAGE_CODES: Record<string, string> = {
    english: "en", hindi: "hi", spanish: "es", french: "fr", german: "de",
};

/** Turns ElevenLabs' snake_case labels into something readable. */
function humanize(value?: string): string {
    if (!value) return "";
    return value.replace(/_/g, " ");
}

/**
 * Lists the ElevenLabs voices actually on this account, with audio previews.
 *
 * The wizard used to offer four hardcoded aliases whose ids had been retired,
 * so the account's real voices — including the native Hindi ones — could not be
 * seen or selected. Voices native to the chosen language are shown first,
 * because that is the choice that matters most for a non-English series.
 */
export function VoicePicker({
    value,
    language,
    onChange,
}: {
    value: string;
    language: string;
    onChange: (voiceId: string) => void;
}) {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [playing, setPlaying] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/voices");
                const data = await res.json();
                setVoices(data.voices ?? []);
                if (data.error) setError(data.error);
            } catch {
                setError("Could not load voices");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Stop playback when the picker unmounts, so a preview does not keep
    // playing after the modal closes.
    useEffect(() => () => audioRef.current?.pause(), []);

    const langCode = LANGUAGE_CODES[language?.toLowerCase()] ?? "en";

    const { native, others } = useMemo(() => {
        const sorted = [...voices].sort((a, b) => a.name.localeCompare(b.name));
        return {
            native: sorted.filter((v) => v.language === langCode),
            others: sorted.filter((v) => v.language !== langCode),
        };
    }, [voices, langCode]);

    const preview = (voice: Voice) => {
        if (!voice.previewUrl) return;
        audioRef.current?.pause();

        if (playing === voice.id) {
            setPlaying(null);
            return;
        }

        const audio = new Audio(voice.previewUrl);
        audioRef.current = audio;
        audio.onended = () => setPlaying(null);
        audio.onerror = () => setPlaying(null);
        void audio.play();
        setPlaying(voice.id);
    };

    const card = (voice: Voice) => {
        const selected = value === voice.id;
        return (
            <div
                key={voice.id}
                className={`text-left p-4 rounded-xl border transition-all ${
                    selected
                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100"
                        : "border-slate-200 hover:border-slate-300"
                }`}
            >
                <div className="flex items-start justify-between gap-3">
                    <button onClick={() => onChange(voice.id)} className="text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-slate-900 font-bold">
                            <Music size={16} className="text-indigo-500 flex-shrink-0" />
                            <span className="truncate">{voice.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {voice.description || humanize(voice.descriptive) || humanize(voice.useCase)}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {voice.useCase && (
                                <span className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                                    {humanize(voice.useCase)}
                                </span>
                            )}
                            {voice.gender && (
                                <span className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                                    {voice.gender}
                                </span>
                            )}
                            {voice.category === "professional" && (
                                <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                                    paid plan
                                </span>
                            )}
                        </div>
                    </button>

                    {voice.previewUrl && (
                        <button
                            onClick={() => preview(voice)}
                            title={`Preview ${voice.name}`}
                            className="flex-shrink-0 w-9 h-9 rounded-full bg-white border border-slate-200 hover:border-indigo-400 flex items-center justify-center transition-colors"
                        >
                            {playing === voice.id ? (
                                <Pause size={14} className="text-indigo-600" />
                            ) : (
                                <Play size={14} className="text-slate-600" />
                            )}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-slate-500 text-sm p-4">
                <Loader2 size={16} className="animate-spin" />
                Loading voices from ElevenLabs…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button
                onClick={() => onChange("auto")}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                    value === "auto"
                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100"
                        : "border-slate-200 hover:border-slate-300"
                }`}
            >
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <Sparkles size={16} className="text-indigo-500" />
                    Auto — match to series
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    Picks a voice native to the language whose style fits the niche.
                </p>
            </button>

            {error && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}

            {native.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Native to {language} ({native.length})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{native.map(card)}</div>
                </div>
            )}

            {others.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Other voices ({others.length})
                        {native.length > 0 && " — will read with an accent"}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{others.map(card)}</div>
                </div>
            )}
        </div>
    );
}
