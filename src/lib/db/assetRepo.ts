import { prisma } from "./client";
import type { Asset } from "../../types/reel";

// Replaces assetFileStore's data/assets.json, which needed a hand-rolled mutex
// to survive concurrent writes. SQLite handles that.
export const assetRepo = {
    async list(): Promise<Asset[]> {
        const rows = await prisma.asset.findMany({ orderBy: { createdAt: "desc" } });
        return rows.map((row) => ({
            id: row.id,
            fileName: row.fileName,
            url: row.url,
            type: row.type as Asset["type"],
            createdAt: row.createdAt.getTime(),
        }));
    },

    async getById(id: string): Promise<Asset | null> {
        const row = await prisma.asset.findUnique({ where: { id } });
        if (!row) return null;
        return {
            id: row.id,
            fileName: row.fileName,
            url: row.url,
            type: row.type as Asset["type"],
            createdAt: row.createdAt.getTime(),
        };
    },

    async create(asset: Omit<Asset, "createdAt"> & { createdAt?: number }): Promise<Asset> {
        const row = await prisma.asset.create({
            data: {
                id: asset.id,
                fileName: asset.fileName,
                url: asset.url,
                type: asset.type,
                ...(asset.createdAt ? { createdAt: new Date(asset.createdAt) } : {}),
            },
        });
        return {
            id: row.id,
            fileName: row.fileName,
            url: row.url,
            type: row.type as Asset["type"],
            createdAt: row.createdAt.getTime(),
        };
    },

    async delete(id: string): Promise<boolean> {
        const existing = await prisma.asset.findUnique({ where: { id } });
        if (!existing) return false;
        await prisma.asset.delete({ where: { id } });
        return true;
    },
};
