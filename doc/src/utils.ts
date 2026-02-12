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
