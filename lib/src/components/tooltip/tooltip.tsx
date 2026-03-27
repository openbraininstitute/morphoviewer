import React from "react";

import { classNames } from "@/utils";

import styles from "./tooltip.module.css";

export interface TooltipProps {
    className?: string;
    classNameTooltip?: string;
    backColor?: string;
    foreColor?: string;
    arrow?: "top" | "topLeft" | "topRight";
    arrowWidth?: number;
    arrowHeight?: number;
    tooltip: React.ReactNode;
    children: React.ReactNode;
}

export default function Tooltip({
    className,
    classNameTooltip,
    tooltip,
    arrow = "top",
    arrowWidth = 16,
    arrowHeight = 16,
    backColor = "#fff",
    foreColor = "#000",
    children,
}: TooltipProps) {
    return (
        <div
            className={classNames(className, styles.container)}
            style={{
                "--custom-backColor": backColor,
                "--custom-foreColor": foreColor,
            }}
        >
            {children}
            <div
                className={classNames(
                    styles.tooltip,
                    styles[arrow],
                    classNameTooltip,
                )}
            >
                {tooltip}
                <svg
                    className={classNames(styles.arrow, styles[arrow])}
                    viewBox={`0 0 ${arrowWidth} ${arrowHeight}`}
                >
                    <path
                        stroke="none"
                        d={`M0,${arrowHeight}L${
                            arrowWidth / 2
                        },0,${arrowWidth},${arrowHeight}Z`}
                    />
                    <path
                        fill="none"
                        d={`M0,${arrowHeight}L${
                            arrowWidth / 2
                        },0,${arrowWidth},${arrowHeight}`}
                    />
                </svg>
            </div>
        </div>
    );
}
