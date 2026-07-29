/** Stability fix: Normalized relative imports */
import { NextResponse } from "next/server";
import { assetFileStore } from "../../../../lib/assets/assetFileStore";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const assets = await assetFileStore.getAssets();
    const asset = assets.find((a) => a.id === assetId);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Delete from store (this also deletes the physical file)
    await assetFileStore.deleteAsset(assetId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
