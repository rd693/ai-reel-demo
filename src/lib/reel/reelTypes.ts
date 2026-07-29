import { ReelData } from "../../data/demoReelData";

export type ReelStatus = "Draft" | "Ready" | "Rendering" | "Completed" | "Failed";

export type RenderedVideo = {
  id: string;
  reelId: string;
  fileName: string;
  videoUrl: string;
  status: "Completed" | "Failed";
  createdAt: number;
};

export type Asset = {
  id: string;
  fileName: string;
  url: string;
  type: "image" | "video";
  createdAt: number;
};

export type ReelMetadata = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
  status: ReelStatus;
};

export type ReelPreset =
  | "offer"
  | "before_after"
  | "new_service"
  | "festival"
  | "testimonial"
  | "restaurant_menu"
  | "flash_sale"
  | "local_awareness";

export type ReelInput = {
  businessName: string;
  handle: string;
  industry: string;
  offer: string;
  cta: string;
  tone: "viral" | "premium" | "friendly";
  brandColor: string;
  accentColor: string;
  preset: ReelPreset;
  language: string;
  durationInSeconds: number;
  format: "reel" | "video";
  musicUrl?: string;
  logoUrl?: string;
  usePremiumImageStack?: boolean;
};

// The full record stored in DB/localStorage
export type ReelRecord = {
  metadata: ReelMetadata;
  input: ReelInput;
  data: ReelData; // The Remotion format
  renderedVideos: RenderedVideo[];
};
