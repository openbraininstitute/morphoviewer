import { classNames } from "@/utils";

import type { CSSProperties } from "react";

import styles from "./icon.module.css";

type Props = {
  className?: string;
  size?: string;
  style?: CSSProperties;
};

export function IconSpinner({ className, style, size }: Props) {
  return (
    <svg
      className={classNames(className, styles.icon, styles.spin)}
      style={{
        "--custom-icon-size": size ?? "1.5em",
        ...style,
      }}
      viewBox="-12 -12 24 24"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>spinner</title>
      <path d="M0,-8A8,8 0 0,0 -8,0" strokeWidth="1" strokeLinecap="round" fill="none" />
    </svg>
  );
}
