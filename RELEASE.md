# Release Notes — v0.24.14

## Bug Fixes

- Fix missing somas after conversion from morphology to tree
  - Prevent a segment from being added as its own child when start and end coordinates match (self-referencing segments are now treated as roots)
- Fix circuit viewer becoming laggy after prolonged use
- Fix lagging with small circuits
- More control over WebGL logging output

## Features

- Controllable timeline
- Add minimize button (in addition to close button) with click handler fix

## Performance

- Speed up circuit viewer rendering

## Housekeeping

- Code cleanup and formatting (tabs, double quotes)
