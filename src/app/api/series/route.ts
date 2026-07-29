import { NextResponse } from "next/server";
import { seriesRepo, type SeriesInput } from "@/lib/db/seriesRepo";

export async function GET() {
    try {
        return NextResponse.json(await seriesRepo.list());
    } catch (error) {
        console.error("[api/series] list failed:", error);
        return NextResponse.json({ error: "Failed to load series" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SeriesInput;

        if (!body?.name || !body?.niche) {
            return NextResponse.json({ error: "name and niche are required" }, { status: 400 });
        }

        return NextResponse.json(await seriesRepo.create(body), { status: 201 });
    } catch (error) {
        console.error("[api/series] create failed:", error);
        return NextResponse.json({ error: "Failed to create series" }, { status: 500 });
    }
}
