export type TimelineText = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type TimelineAudio = {
  id: string;
  startMs: number;
  endMs: number;
  audioUrl: string;
};

export type Timeline = {
  text: TimelineText[];
  audio: TimelineAudio[];
};
