import { NextRequest, NextResponse } from 'next/server';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

/**
 * AI Image Proxy
 * Solves CORS and DecodingErrors from free-tier AI image providers.
 * Includes retry with exponential backoff to handle ECONNRESET from Pollinations.
 */
export async function GET(req: NextRequest) {
    const rawUrl = req.nextUrl.searchParams.get('url');
    
    if (!rawUrl) {
        return new NextResponse('Missing image URL parameter', { status: 400 });
    }

    // Guard against double-encoding: if the URL contains %25 it has been double-encoded.
    const url = rawUrl.includes('%25') ? decodeURIComponent(rawUrl) : rawUrl;

    // ── Fast path: Gemini returns base64 data URLs — no network fetch needed ──
    if (url.startsWith('data:')) {
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
            return serveFallback(`Data URL parse error: ${e.message}`);
        }
    }

    let targetUrl: string;
    try {
        targetUrl = new URL(url).toString();
    } catch {
        return serveFallback("Malformed URL");
    }

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000 + attempt * 5000);

            console.log(`[Proxy] Fetching: ${targetUrl.substring(0, 80)}... (Attempt ${attempt})`);
            
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const status = response.status;
                console.warn(`[Proxy] Provider rejected with status ${status} for ${targetUrl.substring(0, 50)}`);
                
                const isTransient = status === 404 || status === 429 || status >= 500;
                if (isTransient && attempt < MAX_RETRIES) {
                    await sleep(1500 * attempt);
                    continue;
                }
                return serveFallback(`HTTP ${status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            
            // If the provider returned JSON or HTML, it's likely an error page/message
            if (!contentType.includes('image/') && !contentType.includes('svg')) {
                console.warn(`[Proxy] Provider returned non-image content-type: ${contentType}`);
                if (attempt < MAX_RETRIES) {
                    await sleep(1000);
                    continue;
                }
                return serveFallback(`Invalid content-type: ${contentType}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Basic Magic Bytes Validation
            const isJpeg = buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
            const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
            const isWebP = buffer.length > 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46; // RIFF

            if (!isJpeg && !isPng && !isWebP && !contentType.includes('svg')) {
                 console.warn(`[Proxy] Invalid image magic bytes for ${contentType}. Buffer size: ${buffer.length}. Body start: ${buffer.toString('utf8', 0, 100)}`);
                 if (attempt < MAX_RETRIES) {
                     await sleep(1500);
                     continue;
                 }
                 return serveFallback(`Invalid magic bytes for ${contentType}`);
            }

            if (buffer.length < 200 && !contentType.includes('svg')) {
                 console.warn(`[Proxy] Response too small (${buffer.length} bytes).`);
                 if (attempt < MAX_RETRIES) {
                     await sleep(1000);
                     continue;
                 }
                 return serveFallback("Image too small");
            }

            console.log(`[Proxy] Success: ${contentType} (${buffer.length} bytes)`);

            // Use a standard Response with Buffer for maximum compatibility
            return new Response(buffer, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': buffer.length.toString(),
                    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
                    'Access-Control-Allow-Origin': '*',
                    'Timing-Allow-Origin': '*',
                }
            });

        } catch (error: any) {
            const isRetryable = 
                error?.name === 'AbortError' || 
                error?.cause?.code === 'ECONNRESET' || 
                error?.message?.includes('fetch failed') ||
                error?.message?.includes('network error');

            if (isRetryable && attempt < MAX_RETRIES) {
                console.warn(`[Proxy] ${error?.name || 'Error'} on attempt ${attempt} (${error?.message}). Retrying...`);
                await sleep(BASE_DELAY_MS * attempt);
                continue;
            }

            console.error(`[Proxy] Failed after ${attempt} attempt(s):`, error?.message);
            return serveFallback(`Error: ${error?.message}`);
        }
    }

    return serveFallback("Retry limit reached");
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Serves a dark cinematic placeholder SVG when AI generation fails.
 * Returned as SVG so there are no EncodingErrors on the client.
 */
/**
 * Serves a transparent 1x1 PNG placeholder when AI generation fails.
 * This avoids EncodingErrors on the client.
 */
function serveFallback(reason: string = "unknown") {
    console.error(`[Proxy] Serving fallback. Reason: ${reason}`);
    
    // Solid dark-grey 1x1 PNG (opaque) — prevents transparency bleed
    // Base64 for a 1x1 solid #1a1a1a pixel
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const binary = Buffer.from(b64, 'base64');

    return new Response(binary, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': binary.length.toString(),
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
