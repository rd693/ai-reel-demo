/** Stability fix: Normalized relative imports */
import { NextResponse } from "next/server";
import { assetFileStore } from "../../../lib/assets/assetFileStore";
import { Asset } from "../../../lib/reel/reelTypes";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  const assets = await assetFileStore.getAssets();
  return NextResponse.json(assets);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const ext = path.extname(file.name);
    const fileName = `${id}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    // Ensure upload dir exists
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);

    const asset: Asset = {
      id,
      fileName: file.name,
      url: `/uploads/${fileName}`,
      type: file.type.startsWith("video") ? "video" : "image",
      createdAt: Date.now(),
    };

    await assetFileStore.addAsset(asset);

    return NextResponse.json(asset);
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
