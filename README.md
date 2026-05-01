# @openbraininstitute/morphoviewer

[See it in action](https://openbraininstitute.github.io/morphoviewer/).

## Developent

```ts
git clone git@github.com:openbraininstitute/morphoviewer.git
cd morphoviewer
```

Then, you will need two terminals:

```ts
cd lib
npm install
npm start
```

```ts
cd doc
npm install
npm start
```

## Funding & Acknowledgment

The development of this software was supported by funding to the Blue Brain Project, a research center of the École polytechnique fédérale de Lausanne (EPFL), from the Swiss government's ETH Board of the Swiss Federal Institutes of Technology.

Copyright (c) 2024 Blue Brain Project/EPFL
Copyright (c) 2025 Open Brain Institute

## Release notes

### v0.24.21

- Add optional `gizmo` prop to `MorphoViewerSmallCircuit` for displaying an axes orientation controller
  - Accepts `boolean` or a `Partial<TgdPainterGizmoOptions>` object (`alignX`, `alignY`, `size`, `margin`)
  - Dynamically updates gizmo position, size, and visibility at runtime
- Reuse `GizmoSettings` component in the `MorphoViewerSmallCircuit` doc page for interactive gizmo configuration
- Move `GizmoSettings` component to shared `doc/src/components/gizmo-settings/` directory
- Remove leftover `console.log` debug statements from `OctreeManager`
- Fix import ordering in `tst/rspack.config.mjs`

### v0.24.20

- Add optional `gizmo` prop to `MorphoViewerOctree` for displaying an axes orientation controller
  - Accepts `boolean` or a `Partial<TgdPainterGizmoOptions>` object (`alignX`, `alignY`, `size`, `margin`)
  - Dynamically updates gizmo position, size, and visibility at runtime
- Add `GizmoSettings` panel in the doc app for interactive gizmo configuration
- Add nested route `/morpho-viewer-octree/gizmo-settings` in the doc app
- Upgrade `@tolokoban/tgd` dependency from `^2.0.126` to `^2.0.130` to fix a bug in Gizmo resizing

### v0.24.18

- Add Tauri-based testing tool (`tst/`) for checking LOD blocks bounding boxes potential misalignements
