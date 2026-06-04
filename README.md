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

### v0.26.0

- New points cloud painter that overcome the MacOS limitation of 64px for points sizes.
- Apply darker colors for more dense zones.
- Enable **specular lighting** on soma sphere rendering (`specularExponent: 50`)
- Simplify color palette to 3 gradient stops for cleaner visual appearance
- Add full **spinner overlay** styling to `MorphoViewerSpinner` component
- Remove leftover `console.log` and `camera.debug()` debug statements

### v0.25.4

- Fix **event listener leak** in `MorphoViewerSmallCircuit` camera adaptation: the paint event listener was never removed, causing infinite re-registration on each paint cycle

### v0.25.3

- Add optional `verbose` prop to `MorphoViewerSmallCircuit` for enabling/disabling debug console output
- Refactor `MorphoViewerSmallCircuit` rendering pipeline: remove `TgdFilterBlur`, `TgdPainterFilter`, `TgdPainterFramebufferWithAntiAliasing`, and `TgdPainterMix` for a leaner rendering approach
- Refactor `CameraManager` to use `TgdControllerCameraOrbit` with smooth camera interpolation via `tgdActionCreateCameraInterpolation`
- Use `TgdValueWaitable` for lazy context initialization in `PainterManager`
- Add `isDeleted` guard in `OffscreenPainter` to prevent operations after deletion

### v0.25.2

- Increase default **minRadius** from `0.25` to `2.5` in `MorphologyCanvas` and from `2` to `2.5` in `SwcPainter` for better rendering of thin neurites
- Remove leftover `console.log` debug statements from `AbstractCanvas`, `SwcPainter`, and NRRD parser

### v0.25.1

- Enable **antialiasing** on `MorphoViewerSmallCircuit` WebGL context for smoother rendering
- Remove leftover `console.debug` statement from `MorphoViewerSimul`

### v0.25.0

- Add **section-based coloring** to `MorphoViewerSmallCircuit`
  - Cell `color` prop now accepts a `SectionColors` object with per-section colors (soma, axon, myelin, apicalDendrite, basalDendrite, unknown)
  - Uses a texture palette for rendering distinct colors per morphology section type
- Add `Myelin` entry to `CellNodeType` enum
- Add new `morphoViewerConvertSwcIntoTree` utility function for converting SWC file content into a `MorphoViewerTree` structure
- Export `morphoViewerConvertSwcIntoTree` from the library entry point

### v0.24.24

- Improve Octree misalignment tester (`tst/`) with margin-based bounding box comparison to handle float precision errors
  - Add `SuccessGrid` component displaying per-LOD-level success/failure counts
  - Add restart button and hide file selector after loading
  - Use `rehype-raw` for richer Markdown rendering in reports
- Add loading progress indicator to `MorphoViewerOctree` doc page (bytes loaded, blocks in progress)
- Remove leftover `console.log` debug statement from `OctreeManager`
- Split `typedoc` script into `doc` (single run) and `doc:watch` (watch mode)

### v0.24.23

- Add new `MorphoViewerScalebar` component (`lib/src/components/morpho-viewer-scalebar/`) for displaying a dynamic scale bar
  - Renders graduated tick marks with auto-scaled units (m, mm, μm, nm, pm, fm)
  - Accepts a `spacePerPixel` event to reactively update when the camera zooms
  - Supports custom positioning via an optional `className` prop
- Add optional `scalebar` prop to `MorphoViewerSmallCircuit` and `MorphoViewerOctree`
  - Accepts `boolean` or a CSS class name string for custom styling
- Switch camera from perspective to orthographic projection for `MorphoViewerSmallCircuit` and `MorphoViewerOctree`
  - Enables accurate scale bar measurements
- Add `space-per-pixel` behavior (`lib/src/behaviors/`) to broadcast camera zoom level changes
- Rename `controls-layer/` directory to `controls-layout/` for consistency
- Fix CSS specificity issues by scoping canvas styles to a `.webgl` class

### v0.24.22

- Add new `ControlsLayout` component (`lib/src/components/controls-layer/`) for configurable viewer header controls
  - Supports built-in actions: `fullscreen`, `reset-camera`, `minimize`, `close`
  - Accepts arbitrary `React.ReactNode` elements alongside named actions
  - Groups can be nested in arrays for flex-based layout with `space-between` justification
- Add `controls` prop to `MorphoViewerSmallCircuit` to allow custom header control layouts
  - Falls back to a default layout (`reset-camera`, `fullscreen`, `close`, `minimize`) when not provided
- Add `onMinimize` callback prop to `MorphoViewerSmallCircuit`
- Replace hardcoded `<header>` markup in `MorphoViewerSmallCircuit` with the new `ControlsLayout` component
- Update `MorphoViewerSmallCircuit` doc page to demonstrate the configurable controls

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
