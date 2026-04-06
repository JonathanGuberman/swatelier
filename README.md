# Swatelier

A browser-based tool that turns any image into a 3D-printable flyswatter. Upload a photo and Swatelier maps it onto the perforated head of a flyswatter inspired by Philippe Starck's iconic Dr. Skud design, varying the size of each perforation to reproduce the image as a halftone dot pattern.

**Try it live:** [jonathanguberman.github.io/swatelier](https://jonathanguberman.github.io/swatelier/)

## How it works

1. Upload an image and position it within the flyswatter head shape using the crop tool
2. The app samples brightness across the image and maps it to perforation sizes — brighter areas get larger holes, darker areas get smaller or no holes
3. A 3D preview renders the result in real time using Three.js
4. Download the generated STL file and send it to your 3D printer

## Features

- **Image crop modal** with flyswatter-shaped mask, pan/zoom, and live dot-pattern preview
- **Adjustable density** controls how many perforations are generated
- **Adjustable thickness** for the swatter head plate
- **Invert mode** to swap light/dark mapping
- **Mesh and background color pickers** for the 3D preview
- **Binary STL export** ready for slicing and 3D printing
- Smooth geometry using earcut triangulation for the perforated head and superellipse lofting for the head-to-handle transition

## Tech stack

- TypeScript + Vite
- Three.js for 3D preview with OrbitControls
- [earcut](https://github.com/mapbox/earcut) for polygon triangulation
- All geometry generation and STL writing done from scratch in the browser — no server required

## Development

```
npm install
npm run dev
```

## Build

```
npm run build
```

Output goes to `dist/`.

## License

MIT
