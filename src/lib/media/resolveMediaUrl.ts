/**
 * Builds the URL the player and the renderer should actually load.
 *
 * The image proxy exists to work around CORS on third-party image hosts. Since
 * generated images are copied into public/uploads, most scenes are now
 * same-origin and need no proxy at all — and passing a root-relative path to
 * the proxy is worse than useless: it cannot fetch "/uploads/x.jpg" server-side
 * and answers with a 1x1 transparent PNG and status 200, so every scene
 * rendered blank while nothing appeared to fail.
 *
 * `baseHost` is empty in the browser (same origin) and an absolute origin during
 * a render, where the bundle is served from a different port.
 *
 * The preloader and the <Img> must produce byte-identical URLs or Remotion
 * treats them as different assets and the preload is wasted, so both call this.
 */
export function resolveMediaUrl(
    raw: string | undefined | null,
    baseHost = "",
    version?: string | number,
): string | undefined {
    if (!raw) return undefined;
    if (raw.startsWith("data:")) return raw;

    if (raw.startsWith("/")) return `${baseHost}${raw}`;

    const suffix = version === undefined ? "" : `&v=${version}`;
    return `${baseHost}/api/image-proxy?url=${encodeURIComponent(raw)}${suffix}`;
}
