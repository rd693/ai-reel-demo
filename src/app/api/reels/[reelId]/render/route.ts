import { NextResponse } from "next/server";
import { reelFileStore } from "../../../../../lib/reel/reelFileStore";
import path from "path";
import fs from "fs/promises";
import { RenderedVideo } from "../../../../../lib/reel/reelTypes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reelId: string }> }
) {
  const { reelId } = await params;

  try {
    const reel = await reelFileStore.getReelById(reelId);
    if (!reel) {
      return NextResponse.json({ error: "Reel not found" }, { status: 404 });
    }

    // 1. Prepare directory
    const renderId = crypto.randomUUID();
    const outputDir = path.join(process.cwd(), "public", "renders", reelId);
    await fs.mkdir(outputDir, { recursive: true });

    const fileName = `${renderId}.mp4`;
    const outputPath = path.join(outputDir, fileName);
    const videoUrl = `/renders/${reelId}/${fileName}`;

    // 2. Perform rendering (FFmpeg Assembly)
    console.log(`[Render] Starting FFmpeg assembly for reel ${reelId}...`);
    const { assembleWithFFmpeg } = await import("../../../../../lib/video/ffmpegAssembly");
    
    const tmpOutputFile = await assembleWithFFmpeg({
      ...reel.data,
      id: reelId,
    } as any, {
      format: reel.input.format || "reel",
      musicUrl: reel.input.musicUrl,
      logoUrl: reel.input.logoUrl,
    });

    // 3. Move from tmp to public destination
    await fs.rename(tmpOutputFile, outputPath);

    // 4. Create rendered video record
    const renderedVideo: RenderedVideo = {
      id: renderId,
      reelId,
      fileName,
      videoUrl,
      status: "Completed",
      createdAt: Date.now(),
    };

    // 4. Update the reel record in the file store
    const updatedReel = await reelFileStore.addRenderedVideo(reelId, renderedVideo);

    return NextResponse.json({
      success: true,
      renderedVideo,
      reel: updatedReel,
    });
  } catch (error) {
    console.error("Rendering failed:", error);
    return NextResponse.json(
      { error: "Rendering failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
