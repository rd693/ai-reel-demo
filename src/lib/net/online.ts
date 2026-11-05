/**
 * Whether this machine can reach the internet right now.
 *
 * Every provider failure looks alike from inside a stage: a fetch that throws.
 * This is what separates "the model rejected the request" from "the laptop went
 * to sleep", and only the second is worth retrying without being asked.
 *
 * Two hosts, because one being down must not read as the whole internet being
 * down. Any HTTP answer counts, whatever its status.
 */
const PROBES = ["https://www.gstatic.com/generate_204", "https://1.1.1.1/cdn-cgi/trace"];

export async function isOnline(timeoutMs = 5000): Promise<boolean> {
    const answers = await Promise.all(
        PROBES.map((url) =>
            fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) })
                .then(() => true)
                .catch(() => false),
        ),
    );
    return answers.some(Boolean);
}
