import { CSSProperties } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
};

export function IconPlay({ className, style }: Props) {
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
      <title>play</title>
      <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
    </svg>
  );
}
