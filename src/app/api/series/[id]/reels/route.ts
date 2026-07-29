import { NextResponse } from "next/server";
import { reelRepo } from "@/lib/db/reelRepo";
import { seriesRepo } from "@/lib/db/seriesRepo";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
    const { id } = await params;
    try {
        return NextResponse.json(await reelRepo.listBySeries(id));
    } catch (error) {
        console.error("[api/series/:id/reels] list failed:", error);
        return NextResponse.json({ error: "Failed to load reels" }, { status: 500 });
    }
}

export async function POST(req: Request, { params }: Params) {
    const { id } = await params;
    try {
        const series = await seriesRepo.getById(id);
        if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });

        const body = await req.json();
        const reel = await reelRepo.create({ ...body, seriesId: id });
        return NextResponse.json(reel, { status: 201 });
    } catch (error) {
        console.error("[api/series/:id/reels] create failed:", error);
        return NextResponse.json({ error: "Failed to create reel" }, { status: 500 });
    }
}
