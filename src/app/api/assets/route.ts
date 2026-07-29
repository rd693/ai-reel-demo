import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { assetRepo } from "@/lib/db/assetRepo";
import type { Asset } from "@/types/reel";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function GET() {
    try {
        return NextResponse.json(await assetRepo.list());
    } catch (error) {
        console.error("[api/assets] list failed:", error);
        return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const id = crypto.randomUUID();
        // Store under a generated name so uploads cannot collide or escape the
        // upload directory via a crafted filename; the original is kept as a label.
        const storedName = `${id}${path.extname(file.name)}`;

        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.writeFile(
            path.join(UPLOAD_DIR, storedName),
            Buffer.from(await file.arrayBuffer()),
        );

        const asset: Omit<Asset, "createdAt"> = {
            id,
            fileName: file.name,
            url: `/uploads/${storedName}`,
            type: file.type.startsWith("video") ? "video" : "image",
        };

        return NextResponse.json(await assetRepo.create(asset), { status: 201 });
    } catch (error) {
        console.error("[api/assets] upload failed:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
