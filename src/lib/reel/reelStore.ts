import { ReelRecord, RenderedVideo } from "./reelTypes";

const API_BASE = "/api/reels";

export const reelStore = {
  // Sync localStorage to server if server is empty (Migration helper)
  async syncToBackend() {
    const localContent = typeof window !== "undefined" ? localStorage.getItem("ai_reel_studio_reels") : null;
    if (!localContent) return;

    try {
      const serverReels = await this.getReels();
      if (serverReels.length === 0) {
        const localReels: ReelRecord[] = JSON.parse(localContent);
        console.log(`Migrating ${localReels.length} reels to server...`);
        for (const reel of localReels) {
          await this.saveReel(reel);
        }
        localStorage.removeItem("ai_reel_studio_reels");
      }
    } catch (e) {
      console.error("Sync to backend failed", e);
    }
  },

  async getReels(): Promise<ReelRecord[]> {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("Failed to fetch reels");
    return res.json();
  },

  async getReel(id: string): Promise<ReelRecord | null> {
    const res = await fetch(`${API_BASE}/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch reel");
    return res.json();
  },

  async saveReel(reel: ReelRecord): Promise<void> {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reel),
    });
    if (!res.ok) throw new Error("Failed to save reel");
  },

  async updateReel(id: string, updates: Partial<ReelRecord>): Promise<ReelRecord> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update reel");
    return res.json();
  },

  async deleteReel(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete reel");
  },

  async renderReel(id: string): Promise<{ success: boolean; renderedVideo: RenderedVideo; reel: ReelRecord }> {
    const res = await fetch(`${API_BASE}/${id}/render`, {
      method: "POST",
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Rendering failed");
    }
    return res.json();
  },
};
