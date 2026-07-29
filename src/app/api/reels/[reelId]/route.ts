import { NextResponse } from "next/server";
import { reelFileStore } from "../../../../lib/reel/reelFileStore";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reelId: string }> }
) {
  try {
    const { reelId } = await params;
    const reel = await reelFileStore.getReelById(reelId);
    if (!reel) {
      return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    }
    return NextResponse.json(reel);
  } catch (error) {
    console.error("Failed to fetch reel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reelId: string }> }
) {
  try {
    const { reelId } = await params;
    const updates = await request.json();
    const updated = await reelFileStore.updateReel(reelId, updates);
    if (!updated) {
      return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update reel:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ reelId: string }> }
) {
  try {
    const { reelId } = await params;
    await reelFileStore.deleteReel(reelId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete reel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
