import { NextResponse } from "next/server";
import { renderReelToMp4 } from "@/lib/remotion/renderReel";
import path from "path";
import fs from "fs";

// Simple in-memory status tracker (for local demo)
const renderJobs: Record<string, { status: string; progress: number; downloadUrl?: string; error?: string }> = {};

export async function POST(req: Request) {
    try {
        const { reelId, reelData } = await req.json();

        if (!reelId || !reelData) {
            return NextResponse.json({ error: "Missing reelId or reelData" }, { status: 400 });
        }

        // Check if already rendering
        if (renderJobs[reelId] && renderJobs[reelId].status === "processing") {
            return NextResponse.json({ jobId: reelId, ...renderJobs[reelId] });
        }

        // Initialize/Reset Job
        renderJobs[reelId] = { status: "processing", progress: 0 };

        const outputDir = path.join(process.cwd(), "public", "renders");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Use a unique filename for each render to avoid caching issues
        const timestamp = Date.now();
        const fileName = `reel-${reelId}-${timestamp}.mp4`;
        const outputPath = path.join(outputDir, fileName);
        const downloadUrl = `/renders/${fileName}?t=${timestamp}`;

        // Fire and forget the render process
        renderReelToMp4({
            reelId,
            reelData,
            outputPath,
            onProgress: (progress) => {
                if (renderJobs[reelId]) {
                    renderJobs[reelId].progress = Math.round(progress * 100);
                }
            }
        }).then(() => {
            if (renderJobs[reelId]) {
                renderJobs[reelId].status = "completed";
                renderJobs[reelId].progress = 100;
                renderJobs[reelId].downloadUrl = downloadUrl;
            }
        }).catch((err) => {
            if (renderJobs[reelId]) {
                renderJobs[reelId].status = "failed";
                renderJobs[reelId].error = err.message;
            }
        });

        return NextResponse.json({ jobId: reelId, status: "processing" });
    } catch (error) {
        console.error("Render API Error:", error);
        return NextResponse.json({ error: "Failed to start render" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const reelId = searchParams.get("reelId");

    if (!reelId || !renderJobs[reelId]) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(renderJobs[reelId]);
}
