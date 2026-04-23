# Release Notes — v0.24.16

By default `<MorphioViewerSimul />` starts in 3D mode, and can then be switched to Dendrogram mode.
The synapses stick to the neurites when transitionning between these modes, but only if they are added in 3D mode.
If you add synapses when in Dendrogram mode, they appear in 3D view, creating an inconstancy in the view.

This release fix this issue.

## Bug Fixes

- Preserve synapses when transitioning between views (use existing view synapses instead of resetting)
- Apply mix value to newly created synapse painters so they render correctly

## Refactoring

- Convert GLSL shader files (.frag, .vert) to TypeScript modules for gizmo tips painter because it was forcing the bundler of the library client to add special rules for them.
- Remove unused `TgdVec3` import from tips painter
