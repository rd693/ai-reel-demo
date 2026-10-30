/**
 * One JSON answer from whichever provider is configured.
 *
 * generateScriptWithAI has its own copy of this ladder, inlined and wrapped
 * around script-shaped prompts and script-shaped validation. Rather than
 * widen that function into a general LLM client, this is the small version for
 * callers that just want structured JSON back — currently the topic planner.
 *
 * Claude is tried first whenever a key exists, unlike the script path where it
 * is gated behind the premium flag. Planning is one call per *batch* of topics,
 * and that one call decides a month of content: it is the cheapest place in
 * the pipeline to spend the better model.
 */

export type JsonLlmRequest = {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
    /** Shown in logs so a failed run says which call failed. */
    label?: string;
};

export type JsonLlmResult<T> = { data: T; provider: string };

/**
 * Pulls the JSON object out of a model's reply.
 *
 * Models fence their JSON, prefix it with "Here is", or append a closing
 * remark, and any of those breaks a bare JSON.parse. Slicing to the outermost
 * braces survives all three.
 */
export function extractJson<T>(raw: string): T {
    const cleaned = raw
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        throw new Error(`No JSON object in model reply: ${cleaned.slice(0, 120)}`);
    }

    return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

async function viaClaude<T>(req: JsonLlmRequest): Promise<JsonLlmResult<T> | null> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "claude-opus-5",
            // Opus thinks by default and max_tokens covers thinking plus the
            // reply, so a tight cap truncates the JSON mid-object.
            max_tokens: req.maxTokens ?? 16000,
            system: req.system,
            messages: [{ role: "user", content: req.user }],
        }),
        signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
        console.warn(`[jsonLlm] Claude failed (${res.status})`);
        return null;
    }

    const data = await res.json();
    // A refusal is HTTP 200 with an empty content array.
    if (data.stop_reason === "refusal") {
        console.warn("[jsonLlm] Claude declined this prompt");
        return null;
    }

    const text = data.content?.find((b: { type: string }) => b.type === "text")?.text;
    if (!text) return null;
    return { data: extractJson<T>(text), provider: "claude-opus-5" };
}

/**
 * Groq models, in preference order.
 *
 * Pinned names rot: every Llama chat model this project used to name has been
 * decommissioned and answers 404, which silenced this rung completely. Check
 * what an account can actually reach with
 * GET https://api.groq.com/openai/v1/models.
 */
const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

async function viaGroq<T>(req: JsonLlmRequest): Promise<JsonLlmResult<T> | null> {
    const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (!key?.startsWith("gsk_")) return null;

    for (const model of GROQ_MODELS) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: req.system },
                        { role: "user", content: req.user },
                    ],
                    temperature: req.temperature ?? 0.8,
                    max_tokens: 8000,
                    response_format: { type: "json_object" },
                }),
                signal: AbortSignal.timeout(120_000),
            });

            if (!res.ok) {
                console.warn(`[jsonLlm] Groq ${model} failed (${res.status})`);
                continue;
            }

            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) continue;
            return { data: extractJson<T>(text), provider: model };
        } catch (error) {
            console.warn(`[jsonLlm] Groq ${model} error:`, error);
        }
    }
    return null;
}

async function viaGemini<T>(req: JsonLlmRequest): Promise<JsonLlmResult<T> | null> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${req.system}\n\n${req.user}` }] }],
                generationConfig: {
                    temperature: req.temperature ?? 0.9,
                    maxOutputTokens: 8000,
                    responseMimeType: "application/json",
                },
            }),
            signal: AbortSignal.timeout(120_000),
        },
    );

    if (!res.ok) {
        console.warn(`[jsonLlm] Gemini failed (${res.status})`);
        return null;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return { data: extractJson<T>(text), provider: "gemini-3.8-flash" };
}

/**
 * Asks the first available provider for JSON, falling through on failure.
 *
 * Throws when every provider is unavailable or unparseable. Callers here are
 * user-initiated (a planning run), so a thrown error reaches a UI that can say
 * what went wrong — unlike the pipeline, which has nobody to catch it.
 */
export async function callJsonLlm<T>(req: JsonLlmRequest): Promise<JsonLlmResult<T>> {
    const label = req.label ?? "json call";

    for (const attempt of [viaClaude<T>, viaGroq<T>, viaGemini<T>]) {
        try {
            const result = await attempt(req);
            if (result) {
                console.log(`[jsonLlm] ${label} answered by ${result.provider}`);
                return result;
            }
        } catch (error) {
            console.warn(`[jsonLlm] ${label} provider error:`, error);
        }
    }

    throw new Error(
        `No LLM provider could answer the ${label}. Set ANTHROPIC_API_KEY, GROQ_API_KEY or GEMINI_API_KEY.`,
    );
}
