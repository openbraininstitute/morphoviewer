# Release Notes — v0.24.17

## New Features

- Add `onLoadProgress` callback to `<MorphoViewerSmallCircuit />` component, reporting cell loading progress as a value between `0.0` and `1.0`
- Demo page now shows a loading spinner with percentage while morphologies are being fetched

## Improvements

- Camera dynamically adapts as cells are loaded, updating the bounding box incrementally instead of computing it only from soma positions
- Bounding box now accounts for full morphology geometry (neurites and soma segments) for more accurate framing
- Adjust zoom range (min: 0.5, max: 20) and default zoom (2) for better initial view of circuits
- Enable back-face culling on cell and highlighted cell rendering for better performance
- Demo page increased default circuit size from 1 to 50 cells
- Add request throttling in demo to simulate realistic loading conditions

## Bug Fixes

- Fix camera framing by using morphology bounding boxes instead of only soma radii

## Refactoring

- Move `usePainterManager` export to `painter/index.ts` barrel file
- Consolidate imports in `morpho-viewer-small-circuit.tsx`
- `createCellFromTree` now returns both the painter node and its bounding box
- Add `applyTransfoToBBox` utility to transform bounding boxes by cell orientation and position
- Move `@biomejs/biome` dependency to the workspace root, removing it from `lib/` and `doc/`
