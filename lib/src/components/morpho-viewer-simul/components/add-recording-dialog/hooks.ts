import React from 'react';

export function useEscapeHandler(callback: () => void) {
  React.useEffect(() => {
    const listener = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') callback();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [callback]);
}
