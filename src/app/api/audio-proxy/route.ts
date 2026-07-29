import { NextRequest, NextResponse } from 'next/server';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

/**
 * AI Audio Proxy
 * Solves CORS and "no supported sources" errors from free-tier AI audio providers.
 * Includes retry with exponential backoff to handle transient connection issues.
 */
export async function GET(req: NextRequest) {
    const rawUrl = req.nextUrl.searchParams.get('url');
    
    if (!rawUrl) {
        return new NextResponse('Missing audio URL parameter', { status: 400 });
    }

    // Guard against double-encoding
    const url = rawUrl.includes('%25') ? decodeURIComponent(rawUrl) : rawUrl;

    // ── Fast path: Data URLs ──
    if (url.startsWith('data:audio/')) {
        try {
            const [header, b64] = url.split(',');
            const mimeType = header.replace('data:', '').replace(';base64', '');
            const binary = Buffer.from(b64, 'base64');
            return new NextResponse(binary, {
                headers: {
                    'Content-Type': mimeType,
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (e: any) {
            return new NextResponse(`Data URL parse error: ${e.message}`, { status: 400 });
        }
    }

    let targetUrl: string;
    try {
        targetUrl = new URL(url).toString();
    } catch {
        return new NextResponse("Malformed URL", { status: 400 });
    }

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000 + attempt * 5000);

            console.log(`[AudioProxy] Fetching: ${targetUrl.substring(0, 80)}... (Attempt ${attempt})`);
            
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'audio/mpeg,audio/wav,audio/*;q=0.8,*/*;q=0.5',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const status = response.status;
                console.warn(`[AudioProxy] Provider rejected with status ${status} for ${targetUrl.substring(0, 50)}`);
                
                const isTransient = status === 404 || status === 429 || status >= 500;
                if (isTransient && attempt < MAX_RETRIES) {
                    await sleep(BASE_DELAY_MS * attempt);
                    continue;
                }
                return new NextResponse(`Provider HTTP Error: ${status}`, { status: 502 });
            }

            const contentType = response.headers.get('content-type') || '';
            
            // Allow octet-stream for some providers, but prefer audio/
            if (!contentType.includes('audio/') && !contentType.includes('application/octet-stream') && !contentType.includes('audio/mpeg')) {
                console.warn(`[AudioProxy] Provider returned non-audio content-type: ${contentType}`);
                if (attempt < MAX_RETRIES) {
                    await sleep(1000);
                    continue;
                }
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (buffer.length < 500) {
                 console.warn(`[AudioProxy] Response too small (${buffer.length} bytes). Likely an error message.`);
                 if (attempt < MAX_RETRIES) {
                     await sleep(1000);
                     continue;
                 }
            }

            console.log(`[AudioProxy] Success: ${contentType} (${buffer.length} bytes)`);

            // Use a standard Response with Buffer for maximum compatibility
            // We force audio/mpeg if it's octet-stream as a heuristic for MP3 voices
            const finalContentType = contentType.includes('application/octet-stream') ? 'audio/mpeg' : contentType;

            return new Response(buffer, {
                status: 200,
                headers: {
                    'Content-Type': finalContentType,
                    'Content-Length': buffer.length.toString(),
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*',
                    'Timing-Allow-Origin': '*',
                }
            });

        } catch (error: any) {
            const isRetryable = error?.name === 'AbortError' || error?.cause?.code === 'ECONNRESET';

            if (isRetryable && attempt < MAX_RETRIES) {
                console.warn(`[AudioProxy] ${error?.name} on attempt ${attempt}. Retrying...`);
                await sleep(BASE_DELAY_MS * attempt);
                continue;
            }

            console.error(`[AudioProxy] Failed after ${attempt} attempt(s):`, error?.message);
            return new NextResponse(`Proxy Error: ${error?.message}`, { status: 500 });
        }
    }

    return new NextResponse("Retry limit reached", { status: 504 });
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
