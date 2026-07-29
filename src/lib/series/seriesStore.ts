import { Series, FacelessReel } from "../../types/series";

const STORAGE_KEY = "faceless_reels_series";

export const seriesStore = {
    getAll: (): Series[] => {
        if (typeof window === "undefined") return [];
        const saved = localStorage.getItem(STORAGE_KEY);
        const all: Series[] = saved ? JSON.parse(saved) : [
            {
                id: "s1",
                userId: "u1",
                name: "Ancient Mysteries",
                niche: "mythology",
                targetDuration: 60,
                language: "english",
                voiceId: "v1",
                artStyle: "cinematic",
                musicSettings: {
                    enabled: true,
                    trackId: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                    volume: 0.5
                },
                captionStyle: {
                    type: 'word',
                    animation: 'pop',
                    color: '#FFD700',
                    fontSize: 120,
                    fontFamily: 'Inter',
                    boxEnabled: true
                },
                reels: [],
                status: "active",
                createdAt: new Date("2024-01-01")
            }
        ];
        
        return all.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    },

    save: (series: Series) => {
        const all = seriesStore.getAll();
        const updated = [...all, series];
        safeSetItem(STORAGE_KEY, JSON.stringify(updated));
    },

    update: (series: Series) => {
        const all = seriesStore.getAll();
        const updated = all.map(s => s.id === series.id ? series : s);
        safeSetItem(STORAGE_KEY, JSON.stringify(updated));
    },

    updateSeries: (id: string, series: Series) => {
        seriesStore.update(series);
    },

    toggleStatus: (id: string): Series[] => {
        const all = seriesStore.getAll();
        const updated: Series[] = all.map(s => s.id === id ? { ...s, status: (s.status === "active" ? "paused" : "active") as "active" | "paused" } : s);
        safeSetItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    },

    deleteSeries: (id: string) => {
        const all = seriesStore.getAll();
        const updated = all.filter(s => s.id !== id);
        safeSetItem(STORAGE_KEY, JSON.stringify(updated));
        localStorage.removeItem(`reels_${id}`);
        return updated;
    },

    getReelsForSeries: (seriesId: string): FacelessReel[] => {
        if (typeof window === "undefined") return [];
        const saved = localStorage.getItem(`reels_${seriesId}`);
        return saved ? JSON.parse(saved) : [];
    },

    saveReel: (seriesId: string, reel: FacelessReel) => {
        const key = `reels_${seriesId}`;
        const all = seriesStore.getReelsForSeries(seriesId);
        let updated = [reel, ...all];
        
        try {
            localStorage.setItem(key, JSON.stringify(updated));
        } catch (e) {
            console.warn("[SeriesStore] Storage quota exceeded. Evicting oldest reels...");
            // Keep trying to save by removing the oldest reel until it fits
            while (updated.length > 1) {
                updated.pop(); // Remove oldest
                try {
                    localStorage.setItem(key, JSON.stringify(updated));
                    console.log(`[SeriesStore] Successfully saved after evicting old data. Current count: ${updated.length}`);
                    return;
                } catch (err) {
                    continue;
                }
            }
            console.error("[SeriesStore] Could not save even after eviction. Data too large.");
        }
    },

    deleteReel: (seriesId: string, reelId: string) => {
        const key = `reels_${seriesId}`;
        const all = seriesStore.getReelsForSeries(seriesId);
        const updated = all.filter(r => r.id !== reelId);
        safeSetItem(key, JSON.stringify(updated));
        return updated;
    },
    
    updateReel: (seriesId: string, reel: FacelessReel) => {
        const key = `reels_${seriesId}`;
        const all = seriesStore.getReelsForSeries(seriesId);
        const updated = all.map(r => r.id === reel.id ? reel : r);
        safeSetItem(key, JSON.stringify(updated));
    }
};

/**
 * Robust wrapper for localStorage.setItem with error handling
 */
function safeSetItem(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.error(`[SeriesStore] Failed to save to ${key}:`, e);
        // If the main series list is full, we have a bigger problem, but we should at least not crash
    }
}
