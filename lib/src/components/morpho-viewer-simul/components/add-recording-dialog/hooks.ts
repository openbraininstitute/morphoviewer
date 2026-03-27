import React from "react";

export function useEscapeHandler(callback: () => void) {
  React.useEffect(() => {
    const listener = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") callback();
    };
    globalThis.document.addEventListener("keydown", listener);
    return () => globalThis.document.removeEventListener("keydown", listener);
  }, [callback]);
}
