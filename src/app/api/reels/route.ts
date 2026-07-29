import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { toReel } from "@/lib/db/mappers";

// Every reel across all series, newest first. Creating a reel is scoped to its
// series and lives at POST /api/series/[id]/reels.
export async function GET() {
    try {
        const rows = await prisma.reel.findMany({
            orderBy: { createdAt: "desc" },
            include: { scenes: { orderBy: { index: "asc" } } },
        });
        return NextResponse.json(rows.map(toReel));
    } catch (error) {
        console.error("[api/reels] list failed:", error);
        return NextResponse.json({ error: "Failed to load reels" }, { status: 500 });
    }
}
