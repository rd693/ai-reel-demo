import fs from "fs/promises";
import path from "path";
import { ReelRecord, RenderedVideo } from "./reelTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const REELS_FILE = path.join(DATA_DIR, "reels.json");

// Simple mutex to prevent concurrent file access issues
let fileMutex = Promise.resolve();

const withMutex = <T>(fn: () => Promise<T>): Promise<T> => {
  const result = fileMutex.then(fn);
  fileMutex = result.then(() => {}).catch(() => {});
  return result;
};

const _readReels = async (): Promise<ReelRecord[]> => {
  try {
    const content = await fs.readFile(REELS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to read reels file:", e);
    return [];
  }
};

const _writeReels = async (reels: ReelRecord[]): Promise<void> => {
  await fs.writeFile(REELS_FILE, JSON.stringify(reels, null, 2));
};

export const reelFileStore = {
  async ensureInitialized() {
    return withMutex(async () => {
      try {
        await fs.access(DATA_DIR);
      } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
      }

      try {
        await fs.access(REELS_FILE);
      } catch {
        await fs.writeFile(REELS_FILE, JSON.stringify([], null, 2));
      }
    });
  },

  async getAllReels(): Promise<ReelRecord[]> {
    await this.ensureInitialized();
    return withMutex(async () => {
      return _readReels();
    });
  },

  async getReelById(id: string): Promise<ReelRecord | null> {
    const reels = await this.getAllReels();
    return reels.find((r) => r.metadata.id === id) || null;
  },

  async saveReel(reel: ReelRecord): Promise<void> {
    await this.ensureInitialized();
    return withMutex(async () => {
      const reels = await _readReels();
      const index = reels.findIndex((r: any) => r.metadata.id === reel.metadata.id);

      if (index >= 0) {
        reels[index] = reel;
      } else {
        reels.push(reel);
      }

      await _writeReels(reels);
    });
  },

  async updateReel(id: string, updates: Partial<ReelRecord>): Promise<ReelRecord | null> {
    await this.ensureInitialized();
    return withMutex(async () => {
      const reels = await _readReels();
      const index = reels.findIndex((r: any) => r.metadata.id === id);

      if (index === -1) return null;

      const updated = {
        ...reels[index],
        ...updates,
        metadata: {
          ...reels[index].metadata,
          ...(updates.metadata || {}),
          updatedAt: Date.now(),
        },
      };

      reels[index] = updated;
      await _writeReels(reels);
      return updated;
    });
  },

  async deleteReel(id: string): Promise<void> {
    await this.ensureInitialized();
    return withMutex(async () => {
      const reels = await _readReels();
      const filtered = reels.filter((r: any) => r.metadata.id !== id);
      await _writeReels(filtered);
    });
  },

  async addRenderedVideo(reelId: string, renderedVideo: RenderedVideo): Promise<ReelRecord | null> {
    await this.ensureInitialized();
    return withMutex(async () => {
      const reels = await _readReels();
      const index = reels.findIndex((r: any) => r.metadata.id === reelId);

      if (index === -1) return null;

      const reel = reels[index];
      const updated: ReelRecord = {
        ...reel,
        renderedVideos: [...(reel.renderedVideos || []), renderedVideo],
      };

      reels[index] = updated;
      await _writeReels(reels);
      return updated;
    });
  },
};
