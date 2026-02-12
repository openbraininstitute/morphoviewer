import React from "react";
import { classNames } from "@/utils";

import styles from "./slider.module.css";

export interface SliderProps {
    className?: string;
    min: number;
    max: number;
    step: number;
    frontColor?: string;
    backColor?: string;
    value: number;
    onChange(value: number): void;
}

/**
 * Slider stylized according to Loris' mockup.
 */
export function Slider({
    className,
    min,
    max,
    step,
    frontColor = "#003a8c",
    backColor = "#d9d9d9",
    value,
    onChange,
}: SliderProps) {
    return (
        <input
            type="range"
            style={{
                "--custom-slider-color-front": frontColor,
                "--custom-slider-color-back": backColor,
            }}
            className={classNames(className, styles.sliderRoot)}
            min={min}
            max={max}
            step={step}
            value={value}
            onInput={(evt) =>
                onChange(parseFloat((evt.target as HTMLInputElement).value))}
        />
    );
}
