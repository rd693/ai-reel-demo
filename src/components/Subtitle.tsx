import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Props = {
  text: string;
};

export const Subtitle = ({ text }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: {
      damping: 10,
      stiffness: 200,
      mass: 0.5,
    },
  });

  const opacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(pop, [0, 1], [0.8, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        bottom: 250,
        top: "auto",
        height: "auto",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          color: "white",
          padding: "12px 32px",
          borderRadius: "24px",
          fontSize: "48px",
          fontWeight: "bold",
          textAlign: "center",
          maxWidth: "80%",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          opacity,
          transform: `scale(${scale})`,
          textTransform: "uppercase",
          letterSpacing: "1px",
          lineHeight: "1.2",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
