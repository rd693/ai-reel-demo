export const msToFrame = (ms: number, fps: number): number => {
  return Math.round((ms / 1000) * fps);
};

export const calculateFrameTiming = (startMs: number, endMs: number, fps: number) => {
  const startFrame = msToFrame(startMs, fps);
  const endFrame = msToFrame(endMs, fps);
  const durationInFrames = Math.max(1, endFrame - startFrame);

  return {
    startFrame,
    durationInFrames,
  };
};
