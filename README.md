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

### v0.33.0

- Add a **dendrogram** to `MorphoViewerSmallCircuit` via `dendrogram`: the same segments in the same order, laid out with branching across x and path distance up y
  - Morphed on the GPU rather than switched, so a branch stays traceable from one view to the other
  - **Picking follows the chart.** Both offscreen buffers are seeded with the current morph when they are built, since they are rebuilt on circuit updates and when location picking is enabled; offsets and markers blend with the live mix, so they stay correct mid-animation
  - Stroke weights are scaled to the chart's own geometry, not taken from the morphology in microns: radius on a path-distance axis is styling, not measurement. Connectors are the lightest mark, the soma the heaviest, branches graded between by log-compressed calibre
  - Rotation is locked while the chart is shown, since it is flat; zoom and pan stay live
- Add `somaAsSphere`, drawing each soma as one fitted sphere rather than the contour chain the file records. **Off by default**, and it must stay off wherever `synapses` are drawn: those positions are recorded against the file's own geometry, so replacing the soma moves the surface out from under them. Meant for a lone neuron shown without a circuit around it

### v0.32.1

- Make the **fitted-sphere soma opt-in** through `somaAsSphere` on `MorphoViewerSmallCircuit`, defaulting to `false`. v0.32.0 always replaced the file's contour chain with one sphere, which moves the drawn surface out from under synapses positioned against the file's geometry. Branches leaving the soma keep their own radius and colour either way
- Keep the **camera** when only the query part of a cell's `id` changes. A host can use it as a reload key — flipping an axon toggle, say — to rebuild a cell's morphology in place without the view refitting and losing the user's zoom

### v0.32.0

- Add **morphology location picking** to `MorphoViewerSmallCircuit`: a pointer resolves to a `(section, offset)` point on a cell, reported through `locationSelection` as pick, hover and label events
  - Segment picking runs on its own offscreen buffer at half resolution; the existing cell-level hover and click keep their coarser, cheaper one, which was too lossy to hit a thin dendrite
  - The per-segment index rides in the free `v` UV channel, so no extra vertex attribute is needed
  - `MorphoViewerTreeItem` carries `sonataSectionId`, letting a host name the branch a click landed on
- Draw the **soma as a single fitted sphere** rather than the morphology file's contour chain, which rendered as a string of capsules where the instantiated cell shows one compact body
- Give **branches leaving the soma their own radius and colour**. They inherited both from their parent — a soma contour point — which drew a fat, soma-coloured cone off the cell body for every branch. Visible only once cells are coloured by section type, but wrong before that too
- Per-section-type cell colours via `SectionColors` on `MorphoViewerSmallCircuitCell.color`, alongside the existing flat colour

### v0.31.1

- Fix **adaptive resolution** in `MorphoViewerSomasOnly` lowering the render resolution on machines fast enough not to need it
  - Ending an interaction now always closes the measurement window. It did not when the resolution had never been reduced — i.e. always, on a fast GPU — which left the detector armed for the rest of the session and judging idle repaints, whose spacing reflects how often something asked for a repaint rather than how long a frame takes
  - Entering **fullscreen** or changing the **colours** no longer degrades the view
- Decide on the **median of the last 8 frames** instead of a single frame, so a one-off stall (layout, point cloud rebuild, garbage collection) no longer collapses the resolution
- **Give the resolution back** as soon as frames are fast again; a reduction used to persist for the lifetime of the viewer, so one bad measurement degraded every later interaction
- Limit a single adjustment to at most **halving** or **+40%** of the pixel count, and discard frames slower than 1s as stalls rather than steady-state render cost
- Ignore frames measured across a **canvas resize** or a **recolor**, which stall the main thread without saying anything about rendering speed
- Restore `context.resolution` from a `finally` block in **snapshot**, so a failed capture can no longer strand the canvas at device-pixel resolution with the gizmo hidden

### v0.31.0

- Add **world-space overlay point clouds** to `MorphoViewerSmallCircuit` and `MorphoViewerSomasOnly` via `overlays`
  - Per-group color, optional `id` / `kind` / `origin` / `rotation` for placement metadata
- Add **interactive overlay transforms** (`overlaysInteractive`, `onOverlayTransform`)
  - Left-drag translates; right-drag / Alt-drag / Shift-drag rotates
  - Emits absolute origin + rotation with `phase: "end"` on pointer-up so hosts can sync forms without mid-drag churn
- Add **`highlightedOverlayId`** for host-controlled overlay selection highlighting
- Add **`neuronOpacity`** to fade neuron geometry while keeping overlay markers fully opaque
- Add **`overlaysRadius`** / **`overlaysMinRadiusInPixels`** for overlay marker sizing

### v0.30.1

- Fix **bounding box** computation in `MorphoViewerSmallCircuit` by recentering each cell's bbox around its soma center
  - Prevents camera framing issues when morphologies extend asymmetrically from their soma
- Add **`zoom` option** to `cameraReset` signal for controlling zoom level on reset
- Simplify **snapshot** pipeline by removing the `reencodeSnapshot` step and passing options directly to `takeSnapshot`
- Export additional **scalebar types** (`ScalebarLabelsConfig`, `ScalebarOrientation`, `ScalebarPinsConfig`, `ScalebarPlacement`, `ScalebarSide`, `ScalebarWhen`)
- Refactor `PainterCell` into separate `PainterCellFlat` and `PainterCellId` subclasses for cleaner separation of concerns

### v0.30.0

- Add **per-cell soma coloring** to `MorphoViewerSomasOnly` via optional `color` on each cell info
  - Distinct colors map to a categorical palette; recolor-only updates preserve the camera
- Extend **scalebar** with vertical orientation, placement, hover-revealed pins/labels, and hiDPI rendering
- Add **`resetCameraSignal`** to `MorphoViewerSomasOnly` and `MorphoViewerSmallCircuit` for host-triggered camera reset
- Preserve **camera position** on recolor-only circuit updates in `MorphoViewerSmallCircuit`

### v0.29.0

- Add **version tracking** via `data-version` attribute on root elements of `MorphoViewerOctree`, `MorphoViewerSimul`, `MorphoViewerSmallCircuit`, and `MorphoViewerSomasOnly`
- Add **synapses** support to `MorphoViewerSmallCircuit`
  - New `synapses`, `synapsesRadius`, and `synapsesMinRadiusInPixels` props
  - Dynamically updates synapse rendering without recreating the painter

### v0.27.2

- Fix **minimum size** for synapses in `MorphoViewerSimul` to prevent them from disappearing at certain zoom levels
- Simplify **cell highlighting** logic in `MorphoViewerSmallCircuit` by computing black state inline during cell addition
- Fix the issue with `TGDMaterialFlatTexture` that couldn't change the texture once created.

### v0.27.1

- PointsClouds were using square with back facing.
- Fix **depth issue** with synapses in `MorphoViewerSimul` by disabling depth precision on synapse painter
- **MorphoViewerSomasOnly** now uses an adaptative resolution decreaser to adpat to different GPU.

### v0.27.0

- Add optional **somaRadius** prop to `MorphoViewerSomasOnly` for controlling the rendered soma size at runtime
  - Defaults to `12` when not provided
  - Dynamically updates without recreating the points cloud by leveraging `radiusMultiplier`
- Optimize **bounding box** computation in `PainterCellInfos` to avoid per-point `addSphere` calls
  - Computes center and extents in a single pass for better performance on large datasets

### v0.26.4

- **Reduce resolution** during camera movement in `MorphoViewerSomasOnly` for smoother interaction on large circuits
  - Resolution scales down based on cell count (threshold at 250k cells)
  - Full resolution is restored after 50ms of inactivity
- Simplify **ambient occlusion** algorithm in `MorphoViewerSomasOnly` for faster computation
  - Increase AO sampling radius from `10×` to `15×` cell radius
- Refactor `addLiaisons` in `MorphoViewerSimul` to use iterative traversal instead of recursion because this breaks in Chrome
- Remove leftover `console.log` debug statement from `MorphoViewerSimul`

### v0.26.3

- Fix missing colors for segments.
- Add optional **per-block color** support to `MorphoViewerOctree`
  - `MorphoViewerOctreeMeshType` now accepts an optional `color` string property
  - Octree blocks with a custom color override the default material at render time

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
