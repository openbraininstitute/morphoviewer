import { CSSProperties } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
};

export function MorphoViewerIconCameraOrtho({ className, style }: Props) {
  return (
    <svg
      className={className}
      style={{
        width: "1.5em",
        height: "1.5em",
        ...style,
      }}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>camera orthographic</title>
      <path
        d="M2,-2L4,-2L4,26L2,26ZM8,-2L10,-2L10,26L8,26ZM14,-2L16,-2L16,26L14,26ZM20,-2L22,-2L22,26L20,26ZM-2,2L26,2L26,4L-2,4ZM-2,8L26,8L26,10L-2,10ZM-2,14L26,14L26,16L-2,16ZM-2,20L26,20L26,22L-2,22Z"
        fill="currentColor"
        stroke="none"
      ></path>
    </svg>
  );
}
