# Release Notes

## Package rename

The npm package has been renamed from `@bbp/morphoviewer` to `@openbraininstitute/morphoviewer`.

## CI/CD improvements

- Simplified the npm publish workflow into a single job (removed separate build/test step)
- Upgraded GitHub Actions from v3 to v4 (`actions/checkout`, `actions/setup-node`)
- Auto-publish on push to `main` (in addition to manual `workflow_dispatch`)
- Publish now uses `--access public`

## Misc

- Improved `.gitignore` to better handle `.DS_Store` files
