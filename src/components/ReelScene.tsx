import {
    AbsoluteFill,
    Img,
    Video,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
    staticFile,
} from "remotion";
import type { ReelScene as Scene } from "../data/demoReelData";

type Props = {
    scene: Scene;
    brandColor: string;
    accentColor: string;
};

export const ReelScene = ({ scene, brandColor, accentColor }: Props) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const pop = spring({
        frame,
        fps,
        config: {
            damping: 9,
            stiffness: 180,
            mass: 0.55,
        },
    });

    const bgZoom = interpolate(frame, [0, 90], [1.05, 1.16], {
        extrapolateRight: "clamp",
    });

    const shake = Math.sin(frame * 0.45) * 2;

    const textY = interpolate(frame, [0, 8], [70, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const opacity = interpolate(frame, [0, 6, 85, 96], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill style={{ backgroundColor: "#111" }}>
            {scene.backgroundUrl ? (
                scene.backgroundType === "video" ? (
                    <Video
                        src={staticFile(scene.backgroundUrl.replace(/^\//, ""))}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            transform: `scale(${bgZoom})`,
                        }}
                        muted
                    />
                ) : (
                    <Img
                        src={
                            scene.backgroundUrl.startsWith("data:")
                                ? scene.backgroundUrl
                                : scene.backgroundUrl.startsWith("http")
                                ? `/api/image-proxy?url=${encodeURIComponent(scene.backgroundUrl)}&v=${scene.id}`
                                : staticFile(scene.backgroundUrl.replace(/^\//, ""))
                        }
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            transform: `scale(${bgZoom}) translateX(${shake}px)`,
                            filter: "contrast(1.08) saturate(1.12)",
                        }}
                        crossOrigin="anonymous"
                    />
                )
            ) : null}

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.82) 100%)",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    top: 70,
                    left: 42,
                    right: 42,
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    opacity,
                }}
            >
                {scene.sticker ? (
                    <div
                        style={{
                            backgroundColor: accentColor,
                            color: "#111",
                            borderRadius: 18,
                            padding: "14px 22px",
                            fontSize: 27,
                            fontWeight: 950,
                            transform: `rotate(-3deg) scale(${0.85 + pop * 0.15})`,
                            boxShadow: "0 10px 0 rgba(0,0,0,0.25)",
                        }}
                    >
                        {scene.sticker}
                    </div>
                ) : null}
            </div>

            <div
                style={{
                    position: "absolute",
                    left: 42,
                    right: 42,
                    bottom: 130,
                    opacity,
                    transform: `translateY(${textY}px)`,
                }}
            >
                <div
                    style={{
                        width: 95,
                        height: 10,
                        backgroundColor: brandColor,
                        borderRadius: 999,
                        marginBottom: 26,
                    }}
                />

                <h1
                    style={{
                        margin: 0,
                        color: "white",
                        fontSize: 74,
                        lineHeight: 0.98,
                        fontWeight: 950,
                        letterSpacing: -2.6,
                        textShadow: "0 8px 24px rgba(0,0,0,0.45)",
                    }}
                >
                    {scene.headline}
                </h1>

                {scene.subText ? (
                    <p
                        style={{
                            marginTop: 24,
                            display: "inline-block",
                            backgroundColor: brandColor,
                            color: "white",
                            padding: "16px 24px",
                            borderRadius: 22,
                            fontSize: 34,
                            fontWeight: 900,
                            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                        }}
                    >
                        {scene.subText}
                    </p>
                ) : null}
            </div>

            <div
                style={{
                    position: "absolute",
                    bottom: 42,
                    left: 42,
                    right: 42,
                    height: 12,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    borderRadius: 999,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        width: `${Math.min((frame / (scene.durationInSeconds * fps)) * 100, 100)}%`,
                        height: "100%",
                        backgroundColor: accentColor,
                        borderRadius: 999,
                    }}
                />
            </div>
        </AbsoluteFill>
    );
};