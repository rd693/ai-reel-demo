"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AssetManager } from "../../../components/assets/AssetManager";

// The asset library used to be embedded in the preset-reel dashboard. That
// dashboard is gone, so it lives on its own route rather than being dropped.
export default function AssetsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/dashboard/series"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to series
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Asset Library</h1>
        <p className="text-slate-600 mb-8">
          Images and video you upload here can be used as scene backgrounds.
        </p>

        <AssetManager />
      </div>
    </div>
  );
}
