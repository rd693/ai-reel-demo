import { NextResponse } from "next/server";
import { generateScriptWithAI } from "@/lib/ai/llm";

export async function POST(req: Request) {
    try {
        const {
            niche,
            language,
            durationInSeconds,
            customScript,
            artStyle,       
            subject,        
            seriesContext,  
            visualStylePrompt, 
            visualStyleOverride,
            usePremium
        } = await req.json();

        const scriptData = await generateScriptWithAI(
            niche,
            language,
            durationInSeconds,
            customScript,
            artStyle,
            subject,
            seriesContext,
            visualStylePrompt,
            visualStyleOverride,
            usePremium ? true : false
        );

        return NextResponse.json(scriptData);
    } catch (error) {
        console.error("API Script generation failed:", error);
        return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
}