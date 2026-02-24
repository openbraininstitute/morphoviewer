import type { ArrayNumber3 } from "@tolokoban/tgd";
import React from "react";

interface CustomEvent<T> {
	addListener(listener: (v: T) => void): void;
	removeListener(listener: (v: T) => void): void;
}

interface CustomEventDispatchable<T> extends CustomEvent<T> {
	dispatch(arg: T): void;
}

export function useEventValue<T>(
	initialValue: T,
	event?: CustomEvent<T> | null,
): T {
	const [value, setValue] = React.useState<T>(initialValue);
	React.useEffect(() => {
		if (!event) return;

		event.addListener(setValue);
		return () => event.removeListener(setValue);
	}, [event]);
	return value;
}

export function useEventState<T>(
	initialValue: T,
	event?: CustomEventDispatchable<T> | null,
): [T, (value: T) => void] {
	const [value, setValue] = React.useState<T>(initialValue);
	React.useEffect(() => {
		if (!event) return;

		event.addListener(setValue);
		return () => event.removeListener(setValue);
	}, [event]);
	return [
		value,
		(arg: T) => {
			event?.dispatch(arg);
		},
	];
}

export function classNames(...args: unknown[]): string {
	return args
		.filter((arg) => typeof arg === "string" && arg.trim().length > 0)
		.join(" ");
}

function float01ToVec3(value: number): ArrayNumber3 {
	let z = Math.floor(0xffffff * value);
	const r = (z & 0xff) / 255.0;
	z >>= 8;
	const g = (z & 0xff) / 255.0;
	z >>= 8;
	const b = (z & 0xff) / 255.0;
	return [r, g, b];
}

export function int16ToVec3(index: number) {
	return float01ToVec3(index / 32768);
}

function vec3ToFloat01([r, g, b]: ArrayNumber3): number {
	return (b * 256.0 * 256.0 + g * 256.0 + r) * 0.000015199185323666652;
}

export function vec3ToInt16(vec3: ArrayNumber3) {
	return Math.round(vec3ToFloat01(vec3) * 32768);
}
