// src/components/Canvas.tsx
import React, { useRef, useEffect, useCallback, forwardRef } from "react";
import {
    Stage,
    Layer,
    Image as KonvaImage,
    Transformer,
    Circle,
    Rect as KonvaRect,
} from "react-konva";
import Konva from "konva";
import type { CanvasProps, ImageData, PointData } from "../types"; // Use modified CanvasProps type
import { KonvaEventObject } from "konva/lib/Node";

// --- Constants ---
const POINT_RADIUS = 5;
const POSITIVE_COLOR = "#3498db"; // Blue for positive points
const NEGATIVE_COLOR = "#e74c3c"; // Red for negative points
const STROKE_COLOR = "#ffffff"; // White outline for points
const STROKE_WIDTH = 1.5;
const MIN_RENDER_PIXEL_SIZE = 5; // Minimum width/height for rendering images

// --- Helper Function ---
const isValidNumber = (num: any): num is number =>
    typeof num === "number" && !isNaN(num);
// --- End Helper ---

// --- Canvas Component using forwardRef ---
const CanvasComponent = forwardRef<Konva.Stage, CanvasProps>( // Use standard CanvasProps
    (
        {
            appMode,
            baseImage,
            images,
            points,
            maskData,
            showMask,
            clipImagesGlobally,
            selectedShapeIds,
            stageSize, // Needed for relative <-> absolute conversions
            selectionRectRef,
            onAddPoint,
            onUpdateImageTransform, // Expects relative updates
            onLoadImageImage,
            onStageClick,
            onStageMouseDown,
            onStageMouseMove,
            onStageMouseUp,
        },
        stageRef // Receive stageRef from parent (App.tsx)
    ) => {
        // Internal refs for layers and transformer
        const baseLayerRef = useRef<Konva.Layer>(null);
        const clippingLayerRef = useRef<Konva.Layer>(null); // Ref for clipping layer
        const feedbackLayerRef = useRef<Konva.Layer>(null); // Ref for mask overlay, points, transformer
        const transformerRef = useRef<Konva.Transformer>(null);
        const baseImageRef = useRef<Konva.Image>(null); // Ref for the base Konva Image node

        // Ref to track which image images are currently loading
        const loadingImages = useRef<Map<string, boolean>>(new Map());

        // --- Effects (Loading, Transformer, ContextMenu) ---

        // Effect to load image images when src changes or konvaImage is missing
        useEffect(() => {
            images.forEach((image) => {
                const imageSrc = image.processedSrc || image.originalSrc; // Use processed first, then original
                // Check if source exists, konvaImage is not set, and not already loading
                if (
                    imageSrc &&
                    !image.konvaImage &&
                    !loadingImages.current.get(image.id)
                ) {
                    console.log(
                        `Canvas: useEffect - Loading image for image ${image.id}`
                    );
                    loadingImages.current.set(image.id, true); // Mark as loading
                    const img = new Image();
                    img.crossOrigin = "anonymous"; // Allow loading from data URLs/other origins if needed
                    img.onload = () => {
                        console.log(
                            `Canvas: useEffect - Image loaded successfully for image ${image.id} (${img.naturalWidth}x${img.naturalHeight})`
                        );
                        // Call parent handler with loaded image element and its dimensions
                        onLoadImageImage(
                            image.id,
                            img,
                            img.naturalWidth,
                            img.naturalHeight
                        );
                        loadingImages.current.delete(image.id); // Unmark as loading
                    };
                    img.onerror = (err) => {
                        console.error(
                            `Canvas: useEffect - Failed to load image image src: ${imageSrc.substring(
                                0,
                                50
                            )}...`, // Log truncated src
                            err
                        );
                        loadingImages.current.delete(image.id); // Unmark as loading on error
                        // Optionally call onLoadImageImage with error indicator (e.g., null image or 0 dimensions)
                        onLoadImageImage(image.id, new Image(), 0, 0); // Indicate failure
                    };
                    img.src = imageSrc; // Start loading
                }
            });

            // Clean up loading status for images that might have been removed
            const currentImageIds = new Set(images.map((t) => t.id));
            loadingImages.current.forEach((_, id) => {
                if (!currentImageIds.has(id)) {
                    loadingImages.current.delete(id);
                }
            });
        }, [images, onLoadImageImage]); // Rerun when images array changes

        // Effect to manage the Konva Transformer's attached nodes
        useEffect(() => {
            if (transformerRef.current && feedbackLayerRef.current) {
                // Find the Konva nodes corresponding to the selected shape IDs
                // Ensure we only select nodes that are actual images and exist in the base layer
                const nodesToTransform = selectedShapeIds
                    .map((id) =>
                        // Find specifically within the baseLayer where images are rendered
                        baseLayerRef.current?.findOne<Konva.Image>(`#${id}`)
                    )
                    // Filter out undefined results and ensure they are Konva Images and we're in image mode
                    .filter(
                        (node): node is Konva.Image =>
                            node instanceof Konva.Image && appMode === "images"
                    );

                console.log(
                    `Canvas: useEffect[Transformer] - Attaching ${nodesToTransform.length} nodes to transformer. IDs:`,
                    nodesToTransform.map((n) => n.id())
                );

                // Attach the found nodes to the transformer
                transformerRef.current.nodes(nodesToTransform);

                // Add transformer to the feedback layer and make it visible if nodes are attached
                if (nodesToTransform.length > 0) {
                    // Ensure transformer is part of the layer's scene graph
                    if (
                        transformerRef.current.getLayer() !==
                        feedbackLayerRef.current
                    ) {
                        feedbackLayerRef.current.add(transformerRef.current);
                    }
                    transformerRef.current.show(); // Make transformer visible
                } else {
                    transformerRef.current.nodes([]); // Clear nodes if none selected
                    transformerRef.current.hide(); // Hide transformer if no nodes
                }

                // Redraw the layer containing the transformer
                feedbackLayerRef.current.batchDraw();
            }
        }, [selectedShapeIds, appMode, images]); // Rerun when selection, mode, or images change

        // Effect to prevent default context menu (right-click) in points mode
        useEffect(() => {
            const stageContainer =
                typeof stageRef === "function"
                    ? null // Cannot get container if ref is a function
                    : stageRef?.current?.container(); // Get the DOM container of the Konva Stage

            if (stageContainer) {
                const preventContextMenu = (e: MouseEvent) => {
                    // Prevent context menu only when in 'points' mode
                    if (appMode === "points") {
                        e.preventDefault();
                    }
                };
                // Add the event listener
                stageContainer.addEventListener(
                    "contextmenu",
                    preventContextMenu
                );
                // Cleanup function to remove the listener when component unmounts or mode changes
                return () => {
                    stageContainer.removeEventListener(
                        "contextmenu",
                        preventContextMenu
                    );
                };
            }
        }, [appMode, stageRef]); // Rerun when mode changes or stageRef becomes available

        // --- Event Handlers ---

        // Handles clicks on the stage, primarily for adding points in 'points' mode
        const handleInternalStageClick = useCallback(
            (e: KonvaEventObject<MouseEvent>) => {
                // First, call the parent's stage click handler (for deselection etc.)
                onStageClick(e);

                // Add point logic only if in 'points' mode, a base image exists,
                // and the click target was the base image itself.
                if (
                    appMode === "points" &&
                    baseImage && // Ensure base image is loaded
                    e.target === baseImageRef.current // Check if the click was directly on the base image Konva node
                ) {
                    const stage = e.target.getStage();
                    const pos = stage?.getPointerPosition(); // Get click position relative to the stage
                    const baseImgNode = baseImageRef.current; // Get the Konva base image node

                    // Exit if essential data is missing
                    if (
                        !pos ||
                        !baseImgNode ||
                        !stageSize.width ||
                        !stageSize.height ||
                        stageSize.width === 0 ||
                        stageSize.height === 0
                    ) {
                        console.warn(
                            "Canvas: Cannot add point - missing position, image node, or valid stage size."
                        );
                        return;
                    }

                    // Get the displayed rectangle of the base image within the stage
                    const imgRect = baseImgNode.getClientRect({
                        skipTransform: false,
                    });

                    // Optional: Check if click is within the image bounds (could be smaller than stage)
                    // This check might be redundant if the base image always fills the stage
                    if (
                        pos.x < imgRect.x ||
                        pos.x > imgRect.x + imgRect.width ||
                        pos.y < imgRect.y ||
                        pos.y > imgRect.y + imgRect.height
                    ) {
                        console.log(
                            "Canvas: Click outside displayed image bounds (imgRect), ignoring."
                        );
                        return;
                    }

                    // *** Calculate relative coords based on DISPLAYED size/position ***
                    // This assumes the baseImage Konva node perfectly fills the stageSize
                    // If the image could be positioned differently (e.g., centered with borders),
                    // you'd need to use imgRect.x, imgRect.y, imgRect.width, imgRect.height here.
                    const relativeX = pos.x / stageSize.width;
                    const relativeY = pos.y / stageSize.height;
                    // Clamp values to ensure they are between 0 and 1
                    const clampedX = Math.max(0, Math.min(1, relativeX));
                    const clampedY = Math.max(0, Math.min(1, relativeY));

                    // Determine point label: 0 for right-click (negative), 1 for left-click (positive)
                    const label = e.evt.button === 2 ? 0 : 1;

                    console.log(
                        `Canvas: Point Added. Stage Pos: (${pos.x.toFixed(
                            1
                        )}, ${pos.y.toFixed(1)}). ` +
                            `Relative Coords (Clamped): x=${clampedX.toFixed(
                                3
                            )}, y=${clampedY.toFixed(3)}. Label=${label}.`
                    );

                    // Call parent handler with the calculated relative coordinates and label
                    onAddPoint(clampedX, clampedY, label);
                }
            },
            [appMode, baseImage, onAddPoint, onStageClick, stageSize] // Dependencies
        );

        // --- handleTransformEnd ---
        // Called when a user finishes resizing or rotating a image using the Transformer
        const handleTransformEnd = useCallback(
            (e: KonvaEventObject<Event>) => {
                const node = e.target as Konva.Image; // The transformed Konva Image node

                // Ensure it's a Konva Image and stage size is valid
                if (
                    !(node instanceof Konva.Image) ||
                    !stageSize.width ||
                    !stageSize.height ||
                    stageSize.width === 0 ||
                    stageSize.height === 0
                ) {
                    console.warn(
                        "Canvas: TransformEnd event on non-image or invalid stage size."
                    );
                    return;
                }

                // Calculate the final ABSOLUTE width and height after scaling
                // Use node.width() * node.scaleX() as Transformer modifies scale during interaction
                const finalAbsWidth = Math.max(
                    MIN_RENDER_PIXEL_SIZE,
                    node.width() * node.scaleX()
                );
                const finalAbsHeight = Math.max(
                    MIN_RENDER_PIXEL_SIZE,
                    node.height() * node.scaleY()
                );
                // Get final ABSOLUTE position and rotation directly from the node
                const finalAbsX = node.x();
                const finalAbsY = node.y();
                const finalRotation = node.rotation();

                // *** Convert absolute results back to relative for storage ***
                const newRelX = finalAbsX / stageSize.width;
                const newRelY = finalAbsY / stageSize.height;
                const newRelWidth = finalAbsWidth / stageSize.width;
                const newRelHeight = finalAbsHeight / stageSize.height;

                // Reset scale on the node itself - size changes are now stored via relWidth/relHeight
                // The Transformer automatically resets scale visually, but do it programmatically too.
                node.scaleX(1);
                node.scaleY(1);

                console.log(
                    `Canvas: TransformEnd for ${node.id()}. ` +
                        `Abs: x=${finalAbsX.toFixed(1)}, y=${finalAbsY.toFixed(
                            1
                        )}, w=${finalAbsWidth.toFixed(
                            1
                        )}, h=${finalAbsHeight.toFixed(
                            1
                        )}, r=${finalRotation.toFixed(1)}. ` +
                        `Rel: x=${newRelX.toFixed(3)}, y=${newRelY.toFixed(
                            3
                        )}, w=${newRelWidth.toFixed(
                            3
                        )}, h=${newRelHeight.toFixed(3)}`
                );

                // Call parent handler with the calculated RELATIVE attributes
                onUpdateImageTransform(node.id(), {
                    relX: newRelX,
                    relY: newRelY,
                    relWidth: newRelWidth,
                    relHeight: newRelHeight,
                    rotation: finalRotation,
                });
            },
            [onUpdateImageTransform, stageSize] // <<< ADD stageSize dependency
        );

        // --- handleDragEnd ---
        // Called when a user finishes dragging a image
        const handleDragEnd = useCallback(
            (e: KonvaEventObject<DragEvent>) => {
                // Process only in 'images' mode and if the target is a Konva Image
                if (
                    appMode === "images" &&
                    e.target instanceof Konva.Image &&
                    stageSize.width &&
                    stageSize.height && // Ensure stage size is valid
                    stageSize.width !== 0 &&
                    stageSize.height !== 0
                ) {
                    const node = e.target as Konva.Image;
                    // Get final ABSOLUTE position
                    const finalAbsX = node.x();
                    const finalAbsY = node.y();

                    // *** Convert absolute position back to relative ***
                    const newRelX = finalAbsX / stageSize.width;
                    const newRelY = finalAbsY / stageSize.height;

                    console.log(
                        `Canvas: DragEnd for ${node.id()}. ` +
                            `Abs: x=${finalAbsX.toFixed(
                                1
                            )}, y=${finalAbsY.toFixed(1)}. ` +
                            `Rel: x=${newRelX.toFixed(3)}, y=${newRelY.toFixed(
                                3
                            )}`
                    );

                    // Call parent handler with only the updated RELATIVE position
                    onUpdateImageTransform(node.id(), {
                        relX: newRelX,
                        relY: newRelY,
                        // Only position changes on drag, size/rotation remain the same
                    });
                }
            },
            [appMode, onUpdateImageTransform, stageSize] // <<< ADD stageSize dependency
        );

        // --- Rendering Calculations ---

        // Calculates attributes for the base image Konva node
        const getBaseImageAttrs = useCallback(() => {
            // Requires base image data and valid stage dimensions
            if (
                !baseImage?.element ||
                !stageSize.width ||
                !stageSize.height ||
                stageSize.width === 0 ||
                stageSize.height === 0
            ) {
                return null; // Not ready to render
            }
            // Base image fills the stage perfectly
            return {
                x: 0,
                y: 0,
                width: stageSize.width,
                height: stageSize.height,
                image: baseImage.element, // The loaded HTMLImageElement
            };
        }, [baseImage, stageSize]); // Depends on base image data and stage size
        const baseImageAttrs = getBaseImageAttrs(); // Calculate once per render

        // Converts relative point coordinates (0-1) to absolute stage coordinates
        const getPointCanvasCoords = useCallback(
            (point: PointData): { x: number; y: number } | null => {
                // Need base image attributes (implies valid stage size) and valid point coords
                if (
                    !baseImageAttrs || // Ensures stage size is valid via baseImageAttrs dependency
                    !isValidNumber(point.x) ||
                    !isValidNumber(point.y)
                ) {
                    return null; // Cannot calculate if data is invalid
                }
                // Scale the point's relative coordinate (0-1) by the stage dimensions
                const stageX = point.x * stageSize.width;
                const stageY = point.y * stageSize.height;

                // Double check calculation result
                if (!isValidNumber(stageX) || !isValidNumber(stageY)) {
                    console.warn(
                        "Canvas: Calculated point coords are invalid",
                        { point, stageX, stageY }
                    );
                    return null;
                }
                return { x: stageX, y: stageY };
            },
            [stageSize, baseImageAttrs] // Depends on stageSize and derived baseImageAttrs
        );

        // --- Render Functions ---

        // Renders the base image
        const renderBaseImage = () => {
            if (!baseImageAttrs) return null; // Don't render if attributes aren't ready
            return (
                <KonvaImage
                    ref={baseImageRef} // Assign ref to the Konva node
                    id="base-image" // Assign ID for potential selection/reference
                    {...baseImageAttrs} // Spread calculated attributes
                    // Listen for clicks only in 'points' mode for adding points
                    listening={appMode === "points"}
                />
            );
        };

        // Renders the blue visual mask overlay
        const renderMaskOverlay = () => {
            // Requires base image, mask data, and showMask toggle to be true
            if (!baseImageAttrs || !maskData?.maskCanvas || !showMask) {
                return null;
            }
            return (
                <KonvaImage
                    id="mask-overlay" // ID for potential reference (e.g., hiding during save)
                    image={maskData.maskCanvas} // The canvas containing the blue overlay
                    x={0} // Position at top-left of stage
                    y={0}
                    width={stageSize.width} // Fill stage width
                    height={stageSize.height} // Fill stage height
                    listening={false} // Does not interact with mouse events
                    opacity={0.6} // Semi-transparent
                />
            );
        };

        // Renders the segmentation points (circles)
        const renderPoints = () => {
            // Only render in 'points' mode and if base image exists
            if (appMode !== "points" || !baseImage) return [];

            return points
                .map((point) => {
                    // Calculate absolute coordinates for the point
                    const coords = getPointCanvasCoords(point);
                    if (coords) {
                        // Render a circle for each valid point
                        return (
                            <Circle
                                key={point.id} // Unique key for React list rendering
                                id={point.id} // ID for potential reference
                                name="point-marker" // Class name for potential group selection/hiding
                                x={coords.x} // Calculated absolute X
                                y={coords.y} // Calculated absolute Y
                                radius={POINT_RADIUS}
                                fill={
                                    point.label === 1 // Color based on label (positive/negative)
                                        ? POSITIVE_COLOR
                                        : NEGATIVE_COLOR
                                }
                                stroke={STROKE_COLOR} // Outline
                                strokeWidth={STROKE_WIDTH}
                                shadowColor="black" // Add shadow for better visibility
                                shadowBlur={3}
                                shadowOpacity={0.5}
                                listening={false} // Points don't react to clicks directly
                            />
                        );
                    } else {
                        console.warn(
                            "Canvas: Skipping point render due to invalid coords",
                            point
                        );
                        return null; // Skip rendering if coords are invalid
                    }
                })
                .filter(Boolean); // Remove any null results from the array
        };

        // Renders the selection rectangle used for multi-selecting images
        const renderSelectionRectangle = () => (
            <KonvaRect
                ref={selectionRectRef} // Assign ref passed from parent
                name="selection-rectangle" // Name for potential reference
                fill="rgba(0, 161, 255, 0.3)" // Semi-transparent blue fill
                visible={false} // Initially hidden
                listening={false} // Does not interact with mouse events
            />
        );

        // Renders the Transformer component for selected images
        const renderTransformer = () => {
            // Only render in 'images' mode
            if (appMode !== "images") return null;
            return (
                <Transformer
                    ref={transformerRef} // Assign ref
                    keepRatio={true} // Maintain aspect ratio during resize by default
                    // Prevent resizing below a minimum size
                    boundBoxFunc={
                        (oldBox, newBox) =>
                            newBox.width < MIN_RENDER_PIXEL_SIZE ||
                            newBox.height < MIN_RENDER_PIXEL_SIZE
                                ? oldBox // Keep old box if new size is too small
                                : newBox // Allow new size otherwise
                    }
                    // Customize transformer appearance (optional)
                    // anchorStroke="#007bff"
                    // borderStroke="#007bff"
                    // anchorSize={8}
                />
            );
        };

        // --- renderImages ---
        // Renders the image images
        const renderImages = () => {
            // Only render in 'images' mode and if stage size is valid
            if (
                appMode !== "images" ||
                !stageSize.width ||
                !stageSize.height ||
                stageSize.width === 0 ||
                stageSize.height === 0
            ) {
                return [];
            }

            return images
                .map((image) => {
                    // Check if the image element is loaded and ready
                    const isImageReady =
                        image.konvaImage &&
                        image.konvaImage.complete &&
                        image.konvaImage.naturalWidth > 0;

                    // Check if RELATIVE properties needed for calculation are valid numbers
                    const arePropsValid = [
                        image.relX,
                        image.relY,
                        image.relWidth,
                        image.relHeight,
                        image.rotation,
                        // Transformer still uses scale during interaction, so ensure it's valid
                        image.scaleX,
                        image.scaleY,
                    ].every(isValidNumber);

                    // Only proceed if image is ready and properties are valid
                    if (isImageReady && arePropsValid) {
                        // *** Convert relative properties to absolute for Konva rendering ***
                        const absoluteX = image.relX * stageSize.width;
                        const absoluteY = image.relY * stageSize.height;
                        const absoluteWidth = image.relWidth * stageSize.width;
                        const absoluteHeight =
                            image.relHeight * stageSize.height;

                        // Ensure minimum dimensions for rendering to prevent invisible elements
                        const finalWidth = Math.max(
                            MIN_RENDER_PIXEL_SIZE,
                            absoluteWidth
                        );
                        const finalHeight = Math.max(
                            MIN_RENDER_PIXEL_SIZE,
                            absoluteHeight
                        );

                        return (
                            <KonvaImage
                                key={image.id} // Unique key
                                id={image.id} // ID for selection/transformer
                                name={"image"} // Class name for group operations
                                image={image.konvaImage} // The loaded HTMLImageElement
                                // --- Use calculated absolute values ---
                                x={absoluteX}
                                y={absoluteY}
                                width={finalWidth}
                                height={finalHeight}
                                // --- END Use calculated absolute values ---

                                rotation={image.rotation} // Use stored rotation
                                // Keep scale at 1 unless actively being transformed
                                // The transformer will handle scale changes visually during interaction
                                scaleX={image.scaleX}
                                scaleY={image.scaleY}
                                draggable={appMode === "images"} // Draggable only in image mode
                                onDragEnd={handleDragEnd} // Use modified handler
                                onTransformEnd={handleTransformEnd} // Use modified handler
                            />
                        );
                    } else {
                        // Log if skipping render due to invalid state
                        if (!isImageReady)
                            console.warn(
                                `Canvas: Skipping image ${image.id} render - image not ready.`
                            );
                        if (!arePropsValid)
                            console.warn(
                                `Canvas: Skipping image ${image.id} render - invalid relative props.`
                            );
                        return null; // Skip rendering this image
                    }
                })
                .filter(Boolean); // Remove nulls from the array
        };

        // Renders the clipping overlay (shows original image pixels where mask is NOT applied)
        const renderClippingOverlay = () => {
            // Requires global clipping toggle, base image, and the clipping canvas data
            if (
                !clipImagesGlobally ||
                !baseImageAttrs || // Ensures stage size is valid
                !maskData?.clippingOverlayCanvas
            ) {
                return null;
            }
            // This overlay sits ON TOP of the images layer. It contains the original image pixels,
            // but made transparent *outside* the segmented area. This effectively "clips"
            // anything underneath (like images) to the segmented region.
            return (
                <KonvaImage
                    id="clipping-overlay" // ID for reference
                    image={maskData.clippingOverlayCanvas} // The canvas with selectively transparent pixels
                    x={0} // Position at top-left
                    y={0}
                    width={stageSize.width} // Fill stage
                    height={stageSize.height}
                    listening={false} // Non-interactive
                    // Opacity is usually 1 (handled by transparency in the canvas itself)
                />
            );
        };

        // --- Final Render ---
        return (
            <Stage
                ref={stageRef} // Forwarded ref from App.tsx
                width={stageSize.width} // Current stage width
                height={stageSize.height} // Current stage height
                style={{ backgroundColor: "#e0e0e0" }} // Background color for the stage area
                // Use pointer events for better compatibility across devices (touch/mouse)
                onPointerDown={onStageMouseDown} // Handle start of selection drag / potential shape click
                onPointerMove={onStageMouseMove} // Handle selection drag update
                onPointerUp={onStageMouseUp} // Handle end of selection drag
                onPointerClick={handleInternalStageClick} // Use this for distinct clicks (like adding points)
            >
                {/* Base Layer: Renders the main content (image, images) */}
                {/* --- Removed whitespace between function calls --- */}
                <Layer ref={baseLayerRef} name="baseLayer">
                    {renderBaseImage()}
                    {renderImages()}
                </Layer>

                {/* Clipping Layer: Renders the overlay that clips images when active */}
                {/* Ensure this layer is rendered *above* the baseLayer */}
                {/* --- Removed whitespace between function calls --- */}
                <Layer ref={clippingLayerRef} name="clippingOverlayLayer">
                    {renderClippingOverlay()}
                </Layer>

                {/* Feedback Layer: Renders non-content visuals (mask, points, selection, transformer) */}
                {/* Ensure this layer is rendered *above* the clipping layer */}
                {/* --- Removed whitespace between function calls --- */}
                <Layer ref={feedbackLayerRef} name="feedbackLayer">
                    {renderMaskOverlay()}
                    {renderPoints()}
                    {renderSelectionRectangle()}
                    {renderTransformer()}
                </Layer>
            </Stage>
        );
    }
); // End forwardRef

export default CanvasComponent;
