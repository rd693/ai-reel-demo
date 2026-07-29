"use client";

import { useState, useEffect } from "react";
import { Asset } from "../../lib/reel/reelTypes";
import { Loader2, Check, X, Image as ImageIcon, Video as VideoIcon } from "lucide-react";

interface AssetPickerProps {
  onSelect: (assetUrl: string) => void;
  onClose: () => void;
  currentUrl?: string;
}

export function AssetPicker({ onSelect, onClose, currentUrl }: AssetPickerProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      const response = await fetch("/api/assets");
      const data = await response.json();
      setAssets(data);
    } catch (error) {
      console.error("Failed to fetch assets:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Background Asset</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center p-12">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No assets available.</p>
              <p className="text-sm text-gray-400 mt-1">Upload assets in the Dashboard first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => onSelect(asset.url)}
                  className={`group relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden border-2 transition-all ${
                    currentUrl === asset.url
                      ? "border-blue-600 ring-2 ring-blue-600/20"
                      : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {asset.type === "image" ? (
                    <img
                      src={asset.url}
                      alt={asset.fileName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <VideoIcon className="w-8 h-8" />
                    </div>
                  )}
                  
                  {currentUrl === asset.url && (
                    <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                      <div className="bg-blue-600 text-white p-1 rounded-full">
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{asset.fileName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Tip: You can manage assets in the main dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
