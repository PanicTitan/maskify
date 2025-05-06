# Maskify ✨

**Effortlessly mask, clip, and composite images with AI, right in your browser.**

[![Maskify Screenshot](showcase.gif)](showcase.gif)

---

## About The Project

Maskify is an interactive, web-based image editing and composition tool built with React, TypeScript, and Konva. It leverages the power of Hugging Face Transformers.js to bring sophisticated AI capabilities like object segmentation (using SAM) and background removal directly into the browser, running locally on the user's machine.

Users can upload a base image, use simple point clicks to define an object for segmentation, and then upload additional overlay images. These overlays can be transformed (moved, scaled, rotated) and dynamically clipped to the AI-generated mask of the base image. This allows for creative compositions and effortless background swapping or object isolation without needing complex desktop software.

## Key Features

*   🖼️ **Base Image Upload:** Start with your main image.
*   🤖 **AI Segmentation (SAM):** Click positive/negative points on the base image to generate precise object masks using an in-browser Segment Anything Model.
*   👁️ **Visual Mask Overlay:** Toggle a visual overlay to see the generated mask area.
*    LAYER **Layer Management:** Upload multiple overlay images.
*   🔄 **Image Transformations:** Easily move, resize, and rotate overlay images using an interactive transformer tool.
*   💨 **AI Background Removal:** Remove the background from overlay images with a single click using an in-browser model.
*   🎨 **Color Tinting:** Apply color tints to overlay images.
*   ✂️ **Mask-Based Clipping:** Toggle global clipping to make overlay images visible only within the segmented mask area of the base image.
*   ↕️ **Reorder Image Layers:** Change the stacking order of overlay images via drag-and-drop in the sidebar.
*   💾 **Save Final Composition:** Export the final canvas view (base + overlays) as a high-quality image file (matching original base image resolution).
*   💻 **In-Browser AI:** All AI model inference runs directly in the user's browser (leveraging WebGPU, WebNN, or WASM when available).
*   📐 **Responsive Canvas:** The canvas adapts to the available space while maintaining the image aspect ratio.

## Technology Stack

*   **Frontend:** React, TypeScript
*   **Build Tool:** Vite
*   **Canvas Rendering:** Konva / react-konva
*   **AI Models:** Hugging Face Transformers.js (`@huggingface/transformers`)
    *   Segmentation: `Xenova/slimsam-77-uniform`
    *   Background Removal: `briaai/RMBG-1.4`
*   **Styling:** CSS
*   *(Deployment via Firebase Tools)*

## Getting Started

To run Maskify locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/PanicTitan/maskify.git 
    cd maskify
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    # or
    # yarn dev
    ```
    *Note: This project uses `@vitejs/plugin-basic-ssl`, so the development server will likely run on `https://localhost:xxxx` (check your terminal output for the exact address). You might need to accept a browser security warning.*

4.  Open the provided `https://localhost:xxxx` URL in your web browser.

## How to Use

1.  **Upload Base Image:** Click "Upload Base Image" and select your main picture. Wait for the AI status to indicate readiness and for embeddings to generate (a loading overlay will show).
2.  **Segment (Points Mode):**
    *   Ensure you are in "Points/Mask" mode (use the toggle button if needed).
    *   Click on the object you want to mask (Left-click = Positive point).
    *   Click on the background areas you want to exclude (Right-click = Negative point).
    *   A blue mask overlay will appear, refining with each point added.
    *   Use "Hide/Show Mask Overlay" to toggle the blue visual.
3.  **Add Overlays (Images Mode):**
    *   Switch to "Images" mode.
    *   Click "Upload Image" to add overlay images. They will appear in the center and in the sidebar list.
4.  **Manipulate Overlays:**
    *   Click an overlay on the canvas or in the sidebar list to select it.
    *   Use the transformer controls to resize and rotate.
    *   Drag the overlay to move it.
    *   Use sidebar buttons for "BG Rem" (Background Removal) or the color picker to tint the image.
    *   Drag and drop images in the sidebar list to reorder layers.
5.  **Clipping:**
    *   If you have a mask generated, click "Clip All" in the Controls section. Overlay images will now only be visible inside the masked area. Click "Unclip All" to disable.
6.  **Save:**
    *   Click the "Save Image" button to download the final composition.

## License

Distributed under the MIT License. See `LICENSE.md` for more information.
*(You should add a `LICENSE.md` file with the MIT License text to your repository)*

## Acknowledgements

*   Hugging Face for Transformers.js
*   Konva.js Team
*   React Team
*   Vite Team

---

<p align="center">
  <img src="public/maskify-logo.png" alt="Maskify Logo" width="150"/>
</p>
