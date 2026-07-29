import { Series, FacelessReel } from "../../types/series";

// Was a localStorage store. That capped everything at the ~5MB quota and, once
// full, silently dropped the oldest reels to make room (base64 voiceovers ate
// it fast). It is now a thin client over the SQLite-backed API; every method
// is async as a result.

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });

    if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `Request failed: ${res.status} ${url}`);
    }

    return res.json() as Promise<T>;
}

export const seriesStore = {
    /** All series, newest first. Does not include reels. */
    getAll(): Promise<Series[]> {
        return request<Series[]>("/api/series");
    },

    /** A single series including its reels and their scenes. */
    async getById(id: string): Promise<Series | null> {
        const res = await fetch(`/api/series/${id}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("Failed to load series");
        return res.json();
    },

    create(series: Omit<Series, "createdAt" | "reels"> & Partial<Series>): Promise<Series> {
        return request<Series>("/api/series", {
            method: "POST",
            body: JSON.stringify(series),
        });
    },

    update(id: string, patch: Partial<Series>): Promise<Series> {
        return request<Series>(`/api/series/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        });
    },

    /** Server-side flip, so two rapid clicks cannot both read "active". */
    toggleStatus(id: string): Promise<Series> {
        return request<Series>(`/api/series/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ toggleStatus: true }),
        });
    },

    async deleteSeries(id: string): Promise<void> {
        await request(`/api/series/${id}`, { method: "DELETE" });
    },

    getReelsForSeries(seriesId: string): Promise<FacelessReel[]> {
        return request<FacelessReel[]>(`/api/series/${seriesId}/reels`);
    },

    saveReel(seriesId: string, reel: Partial<FacelessReel>): Promise<FacelessReel> {
        return request<FacelessReel>(`/api/series/${seriesId}/reels`, {
            method: "POST",
            body: JSON.stringify(reel),
        });
    },

    async getReel(reelId: string): Promise<FacelessReel | null> {
        const res = await fetch(`/api/reels/${reelId}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("Failed to load reel");
        return res.json();
    },

    updateReel(reelId: string, patch: Partial<FacelessReel>): Promise<FacelessReel> {
        return request<FacelessReel>(`/api/reels/${reelId}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        });
    },

    async deleteReel(reelId: string): Promise<void> {
        await request(`/api/reels/${reelId}`, { method: "DELETE" });
    },
};
