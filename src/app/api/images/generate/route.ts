import { NextResponse } from "next/server";
import { generateImage } from "@/lib/visuals/imageGen";

export async function POST(req: Request) {
    try {
        const { prompt, artStyle, seed, usePremium } = await req.json();
        
        if (!prompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        const imageUrl = await generateImage({ 
            prompt, 
            style: artStyle,
            seed: seed ? Number(seed) : undefined,
            usePremium: usePremium ? true : false
        });
        
        return NextResponse.json({ imageUrl });
    } catch (error) {
        console.error("API Image generation failed:", error);
        return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
}
