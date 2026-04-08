import { CSSProperties } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
};

export function IconMinimize({ className, style }: Props) {
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
      <title>minimize</title>
      <path d="M20,14H4V10H20" />
    </svg>
  );
}
