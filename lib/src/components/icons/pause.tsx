import { CSSProperties } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
};

export function IconPause({ className, style }: Props) {
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
      <title>pause</title>
      <path d="M14,19H18V5H14M6,19H10V5H6V19Z" />
    </svg>
  );
}
