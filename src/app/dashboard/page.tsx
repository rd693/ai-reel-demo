"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Film, Clock, Edit2, Copy, Trash2, X, Video, Layers } from "lucide-react";
import { reelStore } from "../../lib/reel/reelStore";
import { ReelRecord, ReelStatus } from "../../lib/reel/reelTypes";
import { AssetManager } from "../../components/assets/AssetManager";

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<ReelStatus, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Ready: "bg-blue-100 text-blue-700",
  Rendering: "bg-amber-100 text-amber-700",
  Completed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
};

const StatusBadge = ({ status }: { status: ReelStatus }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
    {status}
  </span>
);

const PRESET_LABELS: Record<string, string> = {
  offer: "Offer Reel",
  before_after: "Before / After",
  new_service: "Service Launch",
  festival: "Holiday Promo",
  testimonial: "Testimonial",
  restaurant_menu: "Menu Highlight",
  flash_sale: "Flash Sale",
  local_awareness: "Local Buzz",
};

// ---------------------------------------------------------------------------
// Modal Shell
// ---------------------------------------------------------------------------
type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const Modal = ({ open, onClose, children }: ModalProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 animate-[scaleIn_150ms_ease-out]">
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const [reels, setReels] = useState<ReelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Clone dialog state
  const [cloneTarget, setCloneTarget] = useState<ReelRecord | null>(null);
  const [cloneName, setCloneName] = useState("");

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ReelRecord | null>(null);

  const refresh = useCallback(async () => {
    try {
      await reelStore.syncToBackend();
      const allReels = await reelStore.getReels();
      setReels(allReels.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt));
    } catch (e) {
      console.error("Failed to refresh reels", e);
    }
  }, []);

  useEffect(() => {
    refresh().then(() => setLoading(false));
  }, [refresh]);

  // ---- Clone handlers ----
  const openCloneDialog = (reel: ReelRecord) => {
    setCloneTarget(reel);
    setCloneName(`${reel.metadata.title} Copy`);
  };

  const confirmClone = async () => {
    if (!cloneTarget) return;
    const duplicate: ReelRecord = {
      ...cloneTarget,
      metadata: {
        ...cloneTarget.metadata,
        id: crypto.randomUUID(),
        title: cloneName.trim() || `${cloneTarget.metadata.title} Copy`,
        createdAt: Date.now(),
        status: "Draft",
      },
      renderedVideos: [],
    };
    await reelStore.saveReel(duplicate);
    await refresh();
    setCloneTarget(null);
  };

  // ---- Delete handlers ----
  const openDeleteDialog = (reel: ReelRecord) => {
    setDeleteTarget(reel);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await reelStore.deleteReel(deleteTarget.metadata.id);
    await refresh();
    setDeleteTarget(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">AI Reel Studio</h1>
          <p className="text-slate-500 mt-2">Manage your generated video reels</p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/dashboard/series"
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Layers size={18} />
            Content Series
          </Link>
          <Link
            href="/reels/new"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus size={18} />
            Create New Reel
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400">Loading reels...</div>
      ) : reels.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
          <Film size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No reels yet</h3>
          <p className="text-slate-500 mt-2 mb-6 max-w-md mx-auto">
            Get started by creating your first AI-generated viral reel for your business.
          </p>
          <Link
            href="/reels/new"
            className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Plus size={18} />
            Create First Reel
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reels.map((reel) => {
            // ... (existing reel card logic)
            const renderCount = reel.renderedVideos.length;
            const latestRender = renderCount > 0
              ? new Date(reel.renderedVideos[renderCount - 1].createdAt)
              : null;

            return (
              <div key={reel.metadata.id} className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
                {/* ... (existing content) */}
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <StatusBadge status={reel.metadata.status} />
                    <div className="flex items-center text-slate-400 text-xs gap-1">
                      <Clock size={12} />
                      {new Date(reel.metadata.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                    {reel.metadata.title}
                  </h3>
                  <p className="text-slate-500 text-sm mb-4 line-clamp-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{PRESET_LABELS[reel.input.preset] || "Custom"}</span> • {reel.input.industry} • {reel.input.tone}
                  </p>

                  <div className="bg-slate-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-gray-700 mb-3">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Offer:</span> {reel.input.offer}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Video size={12} />
                    <span>
                      {renderCount} render{renderCount !== 1 ? "s" : ""}
                      {latestRender && (
                        <> • Last: {latestRender.toLocaleDateString()}</>
                      )}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-gray-800 p-4 bg-slate-50 dark:bg-gray-900/50 flex justify-between gap-2">
                  <button
                    className="flex items-center justify-center gap-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-md font-medium text-sm transition-colors"
                    onClick={() => openCloneDialog(reel)}
                  >
                    <Copy size={14} />
                    Clone
                  </button>
                  <button
                    className="flex items-center justify-center gap-1.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-2 rounded-md font-medium text-sm transition-colors"
                    onClick={() => openDeleteDialog(reel)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <Link
                    href={`/reels/${reel.metadata.id}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md font-medium text-sm transition-colors shadow-sm"
                  >
                    <Edit2 size={14} />
                    Edit & Render
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-16 pt-12 border-t border-slate-200 dark:border-gray-800">
        <AssetManager />
      </div>

      {/* ---- Clone Modal ---- */}
      <Modal open={cloneTarget !== null} onClose={() => setCloneTarget(null)}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">Clone Reel</h2>
          <button onClick={() => setCloneTarget(null)} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Cloned reel title</label>
        <input
          autoFocus
          value={cloneName}
          onChange={(e) => setCloneName(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
          onKeyDown={(e) => e.key === "Enter" && confirmClone()}
        />
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setCloneTarget(null)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmClone}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
          >
            Create Clone
          </button>
        </div>
      </Modal>

      {/* ---- Delete Confirmation Modal ---- */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">Delete Reel</h2>
          <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Are you sure you want to delete this reel? This action cannot be undone.
        </p>
        {deleteTarget && (
          <div className="mt-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-sm font-semibold text-slate-800">{deleteTarget.metadata.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{deleteTarget.input.industry} • {deleteTarget.renderedVideos.length} render(s)</p>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
