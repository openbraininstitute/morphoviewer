# @bbp/morphoviewer

<p align="center">
  <a href="https://www.epfl.ch/research/domains/bluebrain/">Blue Brain Project</a>
</p>

[See it in action](https://openbraininstitute.github.io/morphoviewer/).

## Usage

API documentation and exaples can be found [here](https://openbraininstitute.github.io/morphoviewer/).

```tsx
import React from "react"
import { MorphologyCanvas } from "@bbp/morphoviewer"

export default functon MyCellViewer({ swc }: { swc: string }) {
    const refPainter = React.useRef(new MorphologyCanvas())
    React.useEffect(
        () => {
            refPainter.current.swc = swc
        },
        [swc]
    )
    return <canvas ref={(canvas) => refPainter.canvas = canvas} />
}
```

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
