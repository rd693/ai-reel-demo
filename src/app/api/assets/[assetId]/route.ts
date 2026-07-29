import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { assetRepo } from "@/lib/db/assetRepo";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ assetId: string }> },
) {
    const { assetId } = await params;
    try {
        const asset = await assetRepo.getById(assetId);
        if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

        // Resolve and confirm containment before unlinking, so a stored url can
        // never point the delete at a file outside the upload directory.
        const target = path.resolve(UPLOAD_DIR, path.basename(asset.url));
        if (target.startsWith(UPLOAD_DIR + path.sep)) {
            await fs.unlink(target).catch((err) => {
                // A missing file should not block removing the stale row.
                if (err?.code !== "ENOENT") throw err;
            });
        }

        await assetRepo.delete(assetId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[api/assets/:id] delete failed:", error);
        return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
}
