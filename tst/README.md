# MorphoViewer Test (Tauri App)

## Prerequisites

### System dependencies

Tauri requires several system-level packages. On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

For other platforms, see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### Rust

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Node.js

Node.js (v18+) and npm are required for the frontend.
You can install them from [nodejs.org](https://nodejs.org/) or via [nvm](https://github.com/nvm-sh/nvm).

## Getting started

```bash
cd tst
npm install
npm start
```

This will:

1. Install frontend dependencies
2. Start the Rspack dev server on `http://localhost:14920`
3. Compile the Rust backend and open the Tauri window

## Troubleshooting

### `Could not create GBM EGL display: EGL_NOT_INITIALIZED`

This happens when WebKitGTK fails to initialize the GPU under Wayland (or in VMs/WSL). Force the X11 rendering backend:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev
```

If that's not enough, also force GDK to use X11:

```bash
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev
```
