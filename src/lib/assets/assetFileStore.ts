import fs from "fs/promises";
import path from "path";
import { Asset } from "../reel/reelTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const ASSETS_FILE = path.join(DATA_DIR, "assets.json");

// Simple mutex to prevent concurrent file access issues
let fileMutex = Promise.resolve();

const withMutex = <T>(fn: () => Promise<T>): Promise<T> => {
  const result = fileMutex.then(fn);
  fileMutex = result.then(() => {}).catch(() => {});
  return result;
};

const _getAssets = async (): Promise<Asset[]> => {
  try {
    const content = await fs.readFile(ASSETS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
};

const _writeAssets = async (assets: Asset[]) => {
  await fs.writeFile(ASSETS_FILE, JSON.stringify(assets, null, 2));
};

export const assetFileStore = {
  async ensureDataDir() {
    return withMutex(async () => {
      try {
        await fs.access(DATA_DIR);
      } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
      }
    });
  },

  async getAssets(): Promise<Asset[]> {
    await this.ensureDataDir();
    return withMutex(async () => {
      return _getAssets();
    });
  },

  async saveAssets(assets: Asset[]) {
    await this.ensureDataDir();
    return withMutex(async () => {
      await _writeAssets(assets);
    });
  },

  async addAsset(asset: Asset) {
    await this.ensureDataDir();
    return withMutex(async () => {
      const assets = await _getAssets();
      assets.push(asset);
      await _writeAssets(assets);
      return asset;
    });
  },

  async deleteAsset(id: string) {
    await this.ensureDataDir();
    return withMutex(async () => {
      const assets = await _getAssets();
      const assetToDelete = assets.find((a) => a.id === id);
      
      if (assetToDelete) {
        // 1. Delete physical file
        const filePath = path.join(process.cwd(), "public", assetToDelete.url);
        try {
          await fs.unlink(filePath);
        } catch (e) {
          console.warn(`Failed to delete physical file: ${filePath}`, e);
        }
        
        // 2. Remove from metadata
        const filtered = assets.filter((a) => a.id !== id);
        await _writeAssets(filtered);
      }
    });
  },
};
