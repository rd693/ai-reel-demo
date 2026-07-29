import { NextResponse } from "next/server";

// Superseded by POST /api/series/[id]/reels/generate.
//
// This endpoint never worked: it called the generation agent server-side, and
// that agent reached its own API routes with relative fetch(), which Node
// cannot resolve. It had no callers.
export async function POST() {
    return NextResponse.json(
        {
            error: "Endpoint removed",
            use: "POST /api/series/[id]/reels/generate",
        },
        { status: 410 },
    );
}
