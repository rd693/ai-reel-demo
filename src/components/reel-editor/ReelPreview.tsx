"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { OfferReel } from "../../compositions/OfferReel";
import { ReelData } from "../../data/demoReelData";
import { Play, Pause, RotateCcw } from "lucide-react";

type Props = {
  data: ReelData;
};

export function ReelPreview({ data }: Props) {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const fps = 30;
  const durationInFrames = data.scenes.reduce(
    (sum, scene) => sum + scene.durationInSeconds,
    0
  ) * fps;

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onFrame = (e: { detail: { frame: number } }) => {
      setProgress(e.detail.frame / durationInFrames);
    };

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.addEventListener("frameupdate", onFrame);

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("frameupdate", onFrame);
    };
  }, [durationInFrames]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying]);

  const restart = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(0);
    player.play();
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = clickX / rect.width;
    const frame = Math.round(fraction * durationInFrames);
    playerRef.current?.seekTo(frame);
  }, [durationInFrames]);

  const currentTime = Math.round((progress * durationInFrames) / fps * 10) / 10;
  const totalTime = Math.round(durationInFrames / fps * 10) / 10;

  return (
    <div className="bg-slate-900 rounded-2xl p-4 flex flex-col items-center shadow-xl border border-slate-800">
      {/* Title bar */}
      <div className="w-full flex justify-between items-center mb-4 px-2">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div className="text-xs font-mono text-slate-400">1080×1920 • 9:16</div>
      </div>

      {/* Phone frame — NO controls inside */}
      <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black border border-slate-700 w-full max-w-[300px] aspect-[9/16]">
        <Player
          ref={playerRef}
          component={OfferReel}
          inputProps={{ reel: data, enableVoiceover: false }}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{
            width: "100%",
            height: "100%",
          }}
          controls={false}
          autoPlay
          loop
        />
      </div>

      {/* External controls — OUTSIDE the video frame */}
      <div className="w-full max-w-[300px] mt-4 space-y-3">
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-slate-700 rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-100 relative"
            style={{ width: `${progress * 100}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>
            <button
              onClick={restart}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {currentTime}s / {totalTime}s
          </span>
        </div>
      </div>
    </div>
  );
}
