import { NextResponse } from "next/server";
import { seriesRepo } from "@/lib/db/seriesRepo";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
    const { id } = await params;
    try {
        const series = await seriesRepo.getById(id);
        if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });
        return NextResponse.json(series);
    } catch (error) {
        console.error("[api/series/:id] get failed:", error);
        return NextResponse.json({ error: "Failed to load series" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: Params) {
    const { id } = await params;
    try {
        const body = await req.json();

        // `{ toggleStatus: true }` flips active/paused without the client
        // needing to read the current value first and race with itself.
        const series = body?.toggleStatus
            ? await seriesRepo.toggleStatus(id)
            : await seriesRepo.update(id, body);

        if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });
        return NextResponse.json(series);
    } catch (error) {
        console.error("[api/series/:id] update failed:", error);
        return NextResponse.json({ error: "Failed to update series" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: Params) {
    const { id } = await params;
    try {
        const deleted = await seriesRepo.delete(id);
        if (!deleted) return NextResponse.json({ error: "Series not found" }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[api/series/:id] delete failed:", error);
        return NextResponse.json({ error: "Failed to delete series" }, { status: 500 });
    }
}
