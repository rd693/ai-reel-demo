"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";

/**
 * Delete in two clicks: the first arms it, the second deletes.
 *
 * Not window.confirm: embedded browsers, including the app's own preview pane,
 * answer it with "no" immediately and show nothing, so a delete button guarded
 * by it silently does nothing. Errors show on the button for the same reason
 * they cannot go through alert().
 */
export function DeleteButton({
    onDelete,
    idleLabel,
    armedLabel = "Click again to delete",
    title,
    className = "",
    iconSize = 16,
}: {
    onDelete: () => Promise<void>;
    idleLabel?: ReactNode;
    armedLabel?: string;
    title?: string;
    className?: string;
    iconSize?: number;
}) {
    const [state, setState] = useState<"idle" | "armed" | "deleting">("idle");
    const [error, setError] = useState<string | null>(null);

    // A stray click must not leave the next click loaded.
    useEffect(() => {
        if (state !== "armed") return;
        const timer = setTimeout(() => setState("idle"), 4000);
        return () => clearTimeout(timer);
    }, [state]);

    const click = async () => {
        if (state === "idle") {
            setError(null);
            setState("armed");
            return;
        }
        if (state !== "armed") return;

        setState("deleting");
        try {
            await onDelete();
            // The owner usually removes this button on success; if it stays,
            // it should not stay spinning.
            setState("idle");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete");
            setState("idle");
        }
    };

    return (
        <button
            type="button"
            onClick={click}
            disabled={state === "deleting"}
            title={error ?? title}
            className={`${className} relative flex items-center justify-center gap-2 font-bold text-sm whitespace-nowrap ${
                state === "armed" ? "!bg-red-600 !text-white !border-red-600" : ""
            } ${error ? "!text-red-600" : ""}`}
        >
            {state === "deleting" ? <Loader2 size={iconSize} className="animate-spin" /> : <Trash2 size={iconSize} />}
            {idleLabel && (state === "armed" ? armedLabel : idleLabel)}
            {/* An icon button floats its message rather than growing: if arming
                moved the button, the second click would land where it used to be. */}
            {!idleLabel && (state === "armed" || error) && (
                <span className="absolute top-full right-0 mt-1 z-50 px-2 py-1 rounded-lg bg-red-600 text-white text-xs font-bold shadow-lg">
                    {state === "armed" ? armedLabel : "Delete failed"}
                </span>
            )}
        </button>
    );
}
