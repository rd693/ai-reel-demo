import { NextResponse } from "next/server";
import { reelFileStore } from "../../../lib/reel/reelFileStore";

export async function GET() {
  try {
    const reels = await reelFileStore.getAllReels();
    return NextResponse.json(reels);
  } catch (error) {
    console.error("Failed to fetch reels:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const reel = await request.json();
    await reelFileStore.saveReel(reel);
    return NextResponse.json(reel, { status: 201 });
  } catch (error) {
    console.error("Failed to save reel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
