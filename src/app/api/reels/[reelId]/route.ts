import { NextResponse } from "next/server";
import { reelRepo } from "@/lib/db/reelRepo";

// Reels are addressed by id alone: the detail page only has a reelId from the
// URL. This replaces the file-store implementation that backed the preset
// pipeline and read from data/reels.json.
type Params = { params: Promise<{ reelId: string }> };

export async function GET(_req: Request, { params }: Params) {
    const { reelId } = await params;
    try {
        const reel = await reelRepo.getById(reelId);
        if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
        return NextResponse.json(reel);
    } catch (error) {
        console.error("[api/reels/:id] get failed:", error);
        return NextResponse.json({ error: "Failed to load reel" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: Params) {
    const { reelId } = await params;
    try {
        const updates = await req.json();
        const reel = await reelRepo.update(reelId, updates);
        if (!reel) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
        return NextResponse.json(reel);
    } catch (error) {
        console.error("[api/reels/:id] update failed:", error);
        return NextResponse.json({ error: "Failed to update reel" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: Params) {
    const { reelId } = await params;
    try {
        const deleted = await reelRepo.delete(reelId);
        if (!deleted) return NextResponse.json({ error: "Reel not found" }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[api/reels/:id] delete failed:", error);
        return NextResponse.json({ error: "Failed to delete reel" }, { status: 500 });
    }
}
