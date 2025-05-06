// src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";
import Sidebar from "./components/Sidebar";
import CanvasComponent from "./components/Canvas";
import LoadingOverlay from "./components/LoadingOverlay";
import {
    useTransformers,
    loadImage as loadImageHelper,
} from "./hooks/useTransformers";
import type {
    AppMode,
    PointData,
    ImageData,
    BaseImageData,
    MaskData,
} from "./types";
import "./App.css";

console.log("App.tsx executing");

const INITIAL_IMAGE_MAX_DIM = 150;
/** 
 * Define the target fraction of the stage the longest side should occupy initially 
 * e.g., 20% of the stage width or height
*/
const INITIAL_IMAGE_TARGET_FRACTION = 0.2; // 
/** Minimum pixel size for the calculated dimension */
const MIN_INITIAL_PIXEL_SIZE = 20;

const isValidNumber = (num: any): num is number =>
    typeof num === "number" && !isNaN(num);

const App: React.FC = () => {
    console.log("App component rendering/re-rendering...");

    const [appMode, setAppMode] = useState<AppMode>("points");
    const [baseImage, setBaseImage] = useState<BaseImageData | null>(null);
    const [segmentationPoints, setSegmentationPoints] = useState<PointData[]>(
        []
    );
    const [maskData, setMaskData] = useState<MaskData | null>(null);
    const [showMask, setShowMask] = useState<boolean>(true);
    const [clipImagesGlobally, setClipImagesGlobally] =
        useState<boolean>(false);
    const [images, setImages] = useState<ImageData[]>([]);
    const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
    // Stage size now determined by image fit OR container size
    const [stageSize, setStageSize] = useState({ width: 100, height: 100 }); // Default small size
    const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
    const [saving, setSaving] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null); 
    const selectionRectRef = useRef<Konva.Rect>(null);
    const selectionBox = useRef({ x1: 0, y1: 0, x2: 0, y2: 0, visible: false });

    const {
        status: aiStatus,
        isSamReady,
        isBgRemovalReady,
        generateEmbeddings,
        segmentWithPoints,
        removeBackground,
    } = useTransformers();

    const isProcessingAny =
        isGeneratingEmbeddings ||
        images.some((t) => t.isRemovingBg || t.isChangingColor) ||
        saving; // Added isChangingColor check

    console.log(
        `App Render: isSamReady=${isSamReady}, isBgRemovalReady=${isBgRemovalReady}, aiStatus="${aiStatus}"`,
        {
            hasBaseImage: !!baseImage,
            points: segmentationPoints.length,
            images: images.length,
            clipGlobal: clipImagesGlobally,
            generatingEmbeddings: isGeneratingEmbeddings,
            isProcessing: isProcessingAny,
            stageSize: stageSize,
        }
    );

    // --- Stage Resizing Effect ---
    useEffect(() => {
        const calculateStageSize = () => {
            if (!containerRef.current) return;

            const containerWidth = containerRef.current.offsetWidth;
            const containerHeight = containerRef.current.offsetHeight;

            if (!baseImage) {
                // No base image, use container size (or a default/placeholder)
                setStageSize({
                    width: containerWidth || 500,
                    height: containerHeight || 500,
                });
                return;
            }

            // Base image exists, calculate scaled size to fit container
            const imgW = baseImage.originalWidth;
            const imgH = baseImage.originalHeight;

            if (imgW === 0 || imgH === 0) {
                // Prevent division by zero
                setStageSize({
                    width: containerWidth || 500,
                    height: containerHeight || 500,
                });
                return;
            }

            const scaleW = containerWidth / imgW;
            const scaleH = containerHeight / imgH;
            const scale = Math.min(scaleW, scaleH); // Fit within container

            const newStageW = imgW * scale;
            const newStageH = imgH * scale;

            console.log(
                `App: Recalculating stage size to fit image: ${newStageW}x${newStageH}`
            );
            setStageSize({ width: newStageW, height: newStageH });
        };

        // Calculate initial size
        calculateStageSize();

        // Use ResizeObserver to recalculate on container resize
        const observer = new ResizeObserver(calculateStageSize);
        let currentRef = containerRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }
        return () => {
            console.log("App: Cleaning up resize observer");
            if (currentRef) {
                observer.unobserve(currentRef);
            }
            observer.disconnect();
        };
        // Recalculate when baseImage changes (its dimensions are needed)
    }, [baseImage]);

    // --- Generate Embeddings Effect ---
    useEffect(() => {
        const currentImageSrc = baseImage?.src;
        const shouldGenerate =
            isSamReady && baseImage && currentImageSrc && !baseImage.embeddings;
        if (shouldGenerate) {
            console.log("App: useEffect - Triggering embedding generation...");
            setIsGeneratingEmbeddings(true);
            generateEmbeddings(baseImage)
                .then((result) => {
                    console.log(
                        "App: useEffect - generateEmbeddings finished, result:",
                        !!result
                    );
                    setBaseImage((currentBaseImage) => {
                        if (
                            currentBaseImage &&
                            currentBaseImage.src === currentImageSrc &&
                            result
                        ) {
                            console.log(
                                "App: useEffect - Setting embeddings state."
                            );
                            return {
                                ...currentBaseImage,
                                embeddings: result.embeddings,
                                processedResult: result.processedResult,
                            };
                        }
                        console.log(
                            "App: useEffect - Skipping state update for embeddings."
                        );
                        return currentBaseImage;
                    });
                })
                .catch((error) => {
                    console.error(
                        "App: useEffect - Embedding generation failed:",
                        error
                    );
                    setBaseImage((currentBaseImage) => {
                        if (
                            currentBaseImage &&
                            currentBaseImage.src === currentImageSrc
                        ) {
                            return {
                                ...currentBaseImage,
                                embeddings: undefined,
                                processedResult: undefined,
                            };
                        }
                        return currentBaseImage;
                    });
                })
                .finally(() => {
                    console.log(
                        "App: useEffect - Embedding generation finished (finally block)."
                    );
                    setIsGeneratingEmbeddings(false);
                });
        }
    }, [isSamReady, baseImage?.src, generateEmbeddings]); // generateEmbeddings added

    // --- Segmentation Effect ---
    useEffect(() => {
        const hasEmbeddings = !!baseImage?.embeddings?.image_embeddings;
        const hasProcessedResult = !!baseImage?.processedResult;
        const hasPoints = segmentationPoints.length > 0;
        if (!hasPoints && maskData !== null) {
            console.log(
                "App: useEffect - Clearing mask data because points list is empty."
            );
            setMaskData(null);
            setClipImagesGlobally(false); // Also reset clipping if points are cleared
            return;
        }
        if (
            hasEmbeddings &&
            hasProcessedResult &&
            hasPoints &&
            isSamReady &&
            baseImage // Ensure baseImage exists
        ) {
            console.log(
                "App: useEffect - Triggering segmentation with points:",
                segmentationPoints.length
            );
            segmentWithPoints(baseImage, segmentationPoints)
                .then((newMask) => {
                    console.log(
                        "App: useEffect - Segmentation finished, newMask:",
                        !!newMask?.maskCanvas,
                        !!newMask?.clippingOverlayCanvas
                    );
                    // Only update state if the base image hasn't changed since calculation started
                    setBaseImage((currentBaseImage) => {
                        if (currentBaseImage?.src === baseImage.src) {
                            setMaskData(newMask);
                        } else {
                            console.log(
                                "App: useEffect - Base image changed during segmentation, discarding result."
                            );
                            setMaskData(null);
                            setClipImagesGlobally(false);
                        }
                        return currentBaseImage;
                    });
                })
                .catch((error) => {
                    console.error(
                        "App: useEffect - Segmentation failed:",
                        error
                    );
                    setMaskData(null);
                    setClipImagesGlobally(false); // Reset clipping on error
                });
        }
    }, [
        segmentationPoints,
        baseImage?.embeddings, // Depend on specific fields if possible
        baseImage?.processedResult,
        baseImage?.src, // Add src to re-run if image changes
        isSamReady,
        segmentWithPoints,
        // Remove baseImage object dependency, use specific fields instead
    ]);

    // --- Base Image Handling ---
    const handleUploadBaseImage = async (file: File) => {
        console.log("App: handleUploadBaseImage started");
        // Reset everything related to the previous image first
        setBaseImage(null);
        setSegmentationPoints([]);
        setMaskData(null);
        setSelectedShapeIds([]);
        setClipImagesGlobally(false);
        // Consider resetting images as well if they are tied to the base image context
        // setImages([]);
        try {
            const { element, src } = await loadImageHelper(file);
            console.log("App: Base image loaded", {
                width: element.naturalWidth,
                height: element.naturalHeight,
            });
            setBaseImage({
                src,
                element,
                originalWidth: element.naturalWidth,
                originalHeight: element.naturalHeight,
                embeddings: undefined,
                processedResult: undefined,
            });
            setAppMode("points"); // Switch to points mode for new image
        } catch (error) {
            console.error("App: Error loading base image:", error);
            // Handle the error, maybe show a message to the user
        }
    };

    // --- Point & Mask Handling ---
    const handleAddPoint = useCallback((x: number, y: number, label: 0 | 1) => {
        console.log("App: handleAddPoint (relative coords received):", {
            x,
            y,
            label,
        });
        // Ensure coordinates are within valid range (0-1)
        const validX = Math.max(0, Math.min(1, x));
        const validY = Math.max(0, Math.min(1, y));

        const newPoint: PointData = {
            id: crypto.randomUUID(),
            x: validX,
            y: validY,
            label,
        };
        setSegmentationPoints((prev) => [...prev, newPoint]);
        setShowMask(true); // Show mask visually when a point is added
    }, []);
    const handleRemovePoint = useCallback((id: string) => {
        console.log("App: handleRemovePoint", id);
        setSegmentationPoints((prev) => prev.filter((p) => p.id !== id));
    }, []);
    const handleToggleMask = useCallback(() => {
        console.log("App: handleToggleMask (Blue Overlay)");
        if (maskData?.maskCanvas) {
            setShowMask((prev) => !prev);
        } else {
            console.log("App: Toggle mask ignored - no mask data");
        }
    }, [maskData]); // Depend on maskData
    const handleToggleGlobalClip = useCallback(() => {
        console.log("App: handleToggleGlobalClip");
        if (maskData?.clippingOverlayCanvas) {
            setClipImagesGlobally((prev) => !prev);
        } else {
            console.log(
                "App: Toggle global clip ignored - no clipping mask data"
            );
        }
    }, [maskData]); // Depend on maskData

    // --- Image Handling ---
    const handleUploadImage = async (file: File) => {
        console.log("App: handleUploadImage", file.name);
        const tempId = crypto.randomUUID();

        // Use relative initial position ---
        const initialRelX = 0.5; // Center
        const initialRelY = 0.5; // Center
        // Placeholder relative size - will be updated by handleLoadImageImage
        const initialRelWidth = 0.1; // Placeholder, e.g., 10% of stage width
        const initialRelHeight = 0.1; // Placeholder, e.g., 10% of stage height

        const placeholderImage: ImageData = {
            id: tempId,
            originalSrc: "",
            processedSrc: "",
            konvaImage: undefined,
            // Store relative ---
            relX: initialRelX,
            relY: initialRelY,
            relWidth: initialRelWidth,
            relHeight: initialRelHeight,
            // 
            rotation: 0,
            scaleX: 1, // Keep scale for transformer interaction
            scaleY: 1,
            name: file.name,
            isLoading: true,
        };
        setImages((prev) => [...prev, placeholderImage]);
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const src = e.target?.result as string;
                if (src) {
                    setImages((prev) =>
                        prev.map((t) => {
                            if (t.id === tempId) {
                                setSelectedShapeIds([t.id]); // Select the newly added image
                                return {
                                    ...t,
                                    originalSrc: src,
                                    processedSrc: src, // Initially, processed is same as original
                                    isLoading: false, // Loading finished
                                };
                            }
                            return t;
                        })
                    );
                    setAppMode("images"); // Switch to image mode
                } else {
                    throw new Error("FileReader failed to read file.");
                }
            };
            reader.onerror = (err) => {
                throw err; // Propagate error
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("App: Error reading/loading image image:", error);
            // Remove the placeholder if loading failed
            setImages((prev) => prev.filter((t) => t.id !== tempId));
        }
    };

    const handleLoadImageImage = useCallback(
        (id: string, img: HTMLImageElement, width: number, height: number) => {
            setImages((prevImages) =>
                prevImages.map((image) => {
                    // Update only if the image ID matches and the konvaImage isn't already set
                    if (image.id === id && !image.konvaImage) {
                        const naturalWidth = img.naturalWidth; // Use the actual loaded image dimensions
                        const naturalHeight = img.naturalHeight;

                        let initialRelWidth = 0.1; // Default fallback relative width
                        let initialRelHeight = 0.1; // Default fallback relative height
                        let calculatedAbsWidth = 50; // Default fallback absolute width
                        let calculatedAbsHeight = 50; // Default fallback absolute height

                        // Ensure we have valid natural dimensions and stage dimensions to calculate scaling
                        if (
                            naturalWidth > 0 &&
                            naturalHeight > 0 &&
                            stageSize.width > 0 &&
                            stageSize.height > 0
                        ) {
                            const aspectRatio = naturalWidth / naturalHeight;

                            let targetAbsWidth: number;
                            let targetAbsHeight: number;

                            // Determine initial absolute size based on fitting the LONGEST side
                            // to the INITIAL_IMAGE_TARGET_FRACTION of the corresponding stage dimension
                            if (naturalWidth >= naturalHeight) {
                                // Wider or square image: Base size on stage width
                                targetAbsWidth =
                                    stageSize.width *
                                    INITIAL_IMAGE_TARGET_FRACTION;
                                targetAbsHeight = targetAbsWidth / aspectRatio;
                            } else {
                                // Taller image: Base size on stage height
                                targetAbsHeight =
                                    stageSize.height *
                                    INITIAL_IMAGE_TARGET_FRACTION;
                                targetAbsWidth = targetAbsHeight * aspectRatio;
                            }

                            // Ensure the calculated size isn't excessively small
                            calculatedAbsWidth = Math.max(
                                MIN_INITIAL_PIXEL_SIZE,
                                targetAbsWidth
                            );
                            calculatedAbsHeight = Math.max(
                                MIN_INITIAL_PIXEL_SIZE,
                                targetAbsHeight
                            );

                            // Convert the calculated absolute size to relative dimensions for storage
                            initialRelWidth =
                                calculatedAbsWidth / stageSize.width;
                            initialRelHeight =
                                calculatedAbsHeight / stageSize.height;

                            // Clamp relative values to prevent potential issues (e.g., if calculated size > stage size)
                            initialRelWidth = Math.max(
                                0.01,
                                Math.min(1, initialRelWidth)
                            );
                            initialRelHeight = Math.max(
                                0.01,
                                Math.min(1, initialRelHeight)
                            );
                        } else {
                            console.warn(
                                `App: Cannot calculate dynamic initial size for image ${id}. Using defaults. ` +
                                    `Natural: ${naturalWidth}x${naturalHeight}, Stage: ${stageSize.width}x${stageSize.height}`
                            );
                            // Use default fallbacks if dimensions are invalid
                            calculatedAbsWidth =
                                stageSize.width * initialRelWidth;
                            calculatedAbsHeight =
                                stageSize.height * initialRelHeight;
                        }

                        console.log(
                            `App: Updating image ${id} with konvaImage. ` +
                                `Initial Calculated Abs Size: ${calculatedAbsWidth.toFixed(
                                    1
                                )}x${calculatedAbsHeight.toFixed(1)}. ` +
                                `Stored Rel Size: ${initialRelWidth.toFixed(
                                    3
                                )}x${initialRelHeight.toFixed(3)} ` +
                                `(Centered at Rel: ${image.relX.toFixed(
                                    3
                                )}, ${image.relY.toFixed(3)})`
                        );

                        return {
                            ...image, // Keep existing properties (like relX: 0.5, relY: 0.5)
                            konvaImage: img, // Set the loaded image element
                            // Store the newly calculated relative dimensions
                            relWidth: initialRelWidth,
                            relHeight: initialRelHeight,
                        };
                    }
                    // If ID doesn't match or image already loaded, return the image unchanged
                    return image;
                })
            );
        },
        [stageSize] // Depends on stageSize to calculate relative dimensions
    );

    const handleRemoveImage = useCallback((id: string) => {
        console.log("App: handleRemoveImage", id);
        setImages((prev) => prev.filter((t) => t.id !== id));
        // Also remove from selection if it was selected
        setSelectedShapeIds((prev) =>
            prev.filter((selectedId) => selectedId !== id)
        );
    }, []);

    // Accept relative attrs ---
    const handleUpdateImageTransform = useCallback(
        (
            id: string,
            attrs: Partial<
                Pick<
                    ImageData,
                    "relX" | "relY" | "relWidth" | "relHeight" | "rotation"
                >
            >
        ) => {
            console.log(
                `App: Updating image ${id} relative transform:`,
                attrs
            );
            // Add validation for incoming relative values
            const validatedAttrs = { ...attrs };
            if (
                validatedAttrs.relX !== undefined &&
                !isValidNumber(validatedAttrs.relX)
            )
                delete validatedAttrs.relX;
            if (
                validatedAttrs.relY !== undefined &&
                !isValidNumber(validatedAttrs.relY)
            )
                delete validatedAttrs.relY;
            if (
                validatedAttrs.relWidth !== undefined &&
                (!isValidNumber(validatedAttrs.relWidth) ||
                    validatedAttrs.relWidth <= 0)
            )
                delete validatedAttrs.relWidth;
            if (
                validatedAttrs.relHeight !== undefined &&
                (!isValidNumber(validatedAttrs.relHeight) ||
                    validatedAttrs.relHeight <= 0)
            )
                delete validatedAttrs.relHeight;
            if (
                validatedAttrs.rotation !== undefined &&
                !isValidNumber(validatedAttrs.rotation)
            )
                delete validatedAttrs.rotation;

            setImages(
                (prev) =>
                    prev.map((t) =>
                        t.id === id ? { ...t, ...validatedAttrs } : t
                    ) // Use validated attrs
            );
        },
        [] // No dependencies needed here as it only uses its arguments and setImages
    );

    const handleRemoveBackground = useCallback(
        async (id: string) => {
            console.log("App: handleRemoveBackground triggered for ID:", id);
            const image = images.find((t) => t.id === id);
            if (
                !image ||
                image.isRemovingBg ||
                !isBgRemovalReady ||
                image.processedSrc !== image.originalSrc
            ) {
                console.warn("App: BG removal skipped for image:", id, {
                    /* ... */
                });
                return;
            }
            console.log("App: Starting BG removal for image:", id);
            setImages((prev) =>
                prev.map((t) =>
                    t.id === id ? { ...t, isRemovingBg: true } : t
                )
            );
            try {
                const resultSrc = await removeBackground(image.originalSrc);
                console.log(
                    "App: BG removal finished AI call for image:",
                    id,
                    "result:",
                    !!resultSrc
                );

                if (resultSrc) {
                    // Load the new image in memory before updating state
                    const img = new Image();
                    img.onload = () => {
                        console.log(
                            `App: New BG-removed image loaded in memory for ${id}. Updating state, preserving transforms.`
                        );
                        setImages((prev) =>
                            prev.map((t) => {
                                if (t.id === id) {
                                    // *** Preserve existing transform, update src and konvaImage ***
                                    return {
                                        ...t, // Keep relX, relY, relWidth, relHeight, rotation, scaleX, scaleY
                                        processedSrc: resultSrc,
                                        konvaImage: img, // Set the newly loaded image directly
                                        isRemovingBg: false,
                                    };
                                }
                                return t;
                            })
                        );
                    };
                    img.onerror = () => {
                        console.error(
                            `App: Failed to load the new BG-removed image src for ${id} into memory after AI processing.`
                        );
                        // Revert loading state without changing the image if the new src fails to load
                        setImages((prev) =>
                            prev.map((t) =>
                                t.id === id ? { ...t, isRemovingBg: false } : t
                            )
                        );
                    };
                    img.src = resultSrc; // Start loading the new image src
                } else {
                    // Handle case where removeBackground returned null/empty
                    console.warn(
                        `App: Background removal for ${id} did not return a valid source.`
                    );
                    setImages((prev) =>
                        prev.map(
                            (t) =>
                                t.id === id ? { ...t, isRemovingBg: false } : t // Just reset loading state
                        )
                    );
                }
            } catch (error) {
                console.error(
                    `App: Background removal failed for image ${id}:`,
                    error
                );
                setImages((prev) =>
                    prev.map((t) =>
                        t.id === id ? { ...t, isRemovingBg: false } : t
                    )
                );
            }
        },
        [images, removeBackground, isBgRemovalReady] // Dependencies remain the same
    );

    const handleAddColor = useCallback(
        async (id: string, color: string) => {
            console.log(
                "App: handleAddColor triggered for ID:",
                id,
                "Color:",
                color
            );
            const image = images.find((t) => t.id === id);
            if (
                !image ||
                image.isRemovingBg ||
                image.isChangingColor ||
                !image.konvaImage // Also check if konvaImage is loaded
            ) {
                console.warn("App: Add Color skipped for image:", id, {
                    
                });
                return;
            }
            console.log("App: Starting Add Color for image:", id);
            setImages((prev) =>
                prev.map((t) =>
                    t.id === id ? { ...t, isChangingColor: true } : t
                )
            );

            try {
                const addColorToImage = (): Promise<string> => {
                    return new Promise((resolve, reject) => {
                        try {
                            const originalImage = image.konvaImage!;
                            let tempCanvas = document.createElement("canvas");
                            tempCanvas.width = originalImage.naturalWidth;
                            tempCanvas.height = originalImage.naturalHeight;
                            const tempCtx = tempCanvas.getContext("2d");
                            if (!tempCtx) {
                                throw new Error(
                                    "Could not get 2D context for color change"
                                );
                            }
                            tempCtx.drawImage(
                                originalImage,
                                0,
                                0,
                                tempCanvas.width,
                                tempCanvas.height
                            );
                            tempCtx.globalCompositeOperation = "source-in";
                            tempCtx.fillStyle = color;
                            tempCtx.fillRect(
                                0,
                                0,
                                tempCanvas.width,
                                tempCanvas.height
                            );
                            tempCtx.globalCompositeOperation = "source-over";
                            resolve(tempCanvas.toDataURL());
                        } catch (err) {
                            reject(err);
                        }
                    });
                };

                const resultSrc = await addColorToImage();
                console.log(
                    "App: Add Color finished processing for image:",
                    id,
                    "result:",
                    !!resultSrc
                );

                if (resultSrc) {
                    // Load the new colored image in memory before updating state
                    const img = new Image();
                    img.onload = () => {
                        console.log(
                            `App: New colored image loaded in memory for ${id}. Updating state, preserving transforms.`
                        );
                        setImages((prev) =>
                            prev.map((t) => {
                                if (t.id === id) {
                                    // *** Preserve existing transform, update src and konvaImage ***
                                    return {
                                        ...t, // Keep relX, relY, relWidth, relHeight, rotation, scaleX, scaleY
                                        processedSrc: resultSrc,
                                        konvaImage: img, // Set the newly loaded image directly
                                        isChangingColor: false,
                                    };
                                }
                                return t;
                            })
                        );
                    };
                    img.onerror = () => {
                        console.error(
                            `App: Failed to load the new colored image src for ${id} into memory after processing.`
                        );
                        // Revert loading state without changing the image if the new src fails to load
                        setImages((prev) =>
                            prev.map((t) =>
                                t.id === id
                                    ? { ...t, isChangingColor: false }
                                    : t
                            )
                        );
                    };
                    img.src = resultSrc; // Start loading the new image src
                } else {
                    // Handle case where color change didn't return a valid source (shouldn't happen with canvas)
                    console.warn(
                        `App: Color change for ${id} did not return a valid source.`
                    );
                    setImages((prev) =>
                        prev.map(
                            (t) =>
                                t.id === id
                                    ? { ...t, isChangingColor: false }
                                    : t // Just reset loading state
                        )
                    );
                }
            } catch (error) {
                console.error(`App: Add Color failed for image ${id}:`, error);
                setImages((prev) =>
                    prev.map((t) =>
                        t.id === id ? { ...t, isChangingColor: false } : t
                    )
                );
            }
        },
        [images] // Dependency remains images
    );

    const handleReorderImages = useCallback(
        (draggedId: string, droppedOnId: string) => {
            console.log(
                `App: Reordering - Dragged ${draggedId} onto ${droppedOnId}`
            );
            setImages((prevImages) => {
                const draggedIndex = prevImages.findIndex(
                    (t) => t.id === draggedId
                );
                const droppedOnIndex = prevImages.findIndex(
                    (t) => t.id === droppedOnId
                );
                // Ensure both images are found and indices are different
                if (
                    draggedIndex === -1 ||
                    droppedOnIndex === -1 ||
                    draggedIndex === droppedOnIndex
                ) {
                    console.warn(
                        "App: Reorder skipped - invalid indices or same image."
                    );
                    return prevImages;
                }

                // Create a mutable copy of the array
                const newImages = [...prevImages];
                // Remove the dragged item
                const [itemToMove] = newImages.splice(draggedIndex, 1);
                // Insert the dragged item at the drop position
                // Adjust index if the dragged item was before the drop target
                const finalDropIndex =
                    draggedIndex < droppedOnIndex
                        ? droppedOnIndex - 1
                        : droppedOnIndex;
                newImages.splice(finalDropIndex, 0, itemToMove);

                console.log(
                    "App: Reordered images:",
                    newImages.map((t) => t.id)
                );
                return newImages; // Return the reordered array
            });
        },
        [] // No dependencies needed
    );

    // --- Mode & Selection ---
    const handleToggleMode = useCallback(() => {
        console.log("App: handleToggleMode");
        setSelectedShapeIds([]); // Clear selection when changing modes
        setAppMode((prev) => (prev === "points" ? "images" : "points"));
    }, []);
    const handleSelectShapeFromSidebar = useCallback(
        (id: string) => {
            console.log("App: handleSelectShapeFromSidebar (Focus Image)", id);
            // Only allow selection if in 'images' mode
            if (appMode === "images") {
                setSelectedShapeIds([id]); // Select only the clicked image
            }
        },
        [appMode] // Depend on appMode
    );

    // --- Canvas Interaction ---
    const handleStageMouseDown = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            // Start selection rectangle only in 'images' mode and if clicking on the stage itself
            if (appMode === "images" && e.target === e.target.getStage()) {
                e.evt.preventDefault(); // Prevent default browser actions like text selection
                const pos = e.target.getStage()?.getPointerPosition();
                if (!pos) return; // Exit if no pointer position

                // Initialize selection box state
                selectionBox.current = {
                    x1: pos.x,
                    y1: pos.y,
                    x2: pos.x,
                    y2: pos.y,
                    visible: true,
                };

                // Make the visual selection rectangle visible and set its initial position/size
                if (selectionRectRef.current) {
                    selectionRectRef.current
                        .visible(true)
                        .width(0)
                        .height(0)
                        .x(pos.x)
                        .y(pos.y);
                    // Batch draw for performance
                    selectionRectRef.current.getLayer()?.batchDraw();
                }
                console.log(
                    "App: Stage MouseDown - Start Selection Rect at",
                    pos
                );
            } else {
                // If not starting a selection, ensure the selection box state is inactive
                selectionBox.current.visible = false;
                // If the visual rectangle was visible, hide it
                if (selectionRectRef.current?.visible()) {
                    selectionRectRef.current.visible(false);
                    selectionRectRef.current.getLayer()?.batchDraw();
                    console.log("App: Stage MouseDown - Hide Selection Rect");
                }
            }
        },
        [appMode] // Depend on appMode
    );

    const handleStageMouseMove = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            // Update selection rectangle only if in 'images' mode and selection is active
            if (appMode === "images" && selectionBox.current.visible) {
                e.evt.preventDefault(); // Prevent default actions during drag selection
                const pos = e.target.getStage()?.getPointerPosition();
                if (!pos) return;

                // Update the end coordinates of the selection box
                selectionBox.current.x2 = pos.x;
                selectionBox.current.y2 = pos.y;

                // Update the visual selection rectangle's position and dimensions
                if (selectionRectRef.current) {
                    selectionRectRef.current.x(
                        Math.min(
                            selectionBox.current.x1,
                            selectionBox.current.x2
                        )
                    );
                    selectionRectRef.current.y(
                        Math.min(
                            selectionBox.current.y1,
                            selectionBox.current.y2
                        )
                    );
                    selectionRectRef.current.width(
                        Math.abs(
                            selectionBox.current.x2 - selectionBox.current.x1
                        )
                    );
                    selectionRectRef.current.height(
                        Math.abs(
                            selectionBox.current.y2 - selectionBox.current.y1
                        )
                    );
                    // Batch draw for performance
                    selectionRectRef.current.getLayer()?.batchDraw();
                }
            }
        },
        [appMode] // Depend on appMode
    );

    const handleStageMouseUp = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            // Finalize selection rectangle only if in 'images' mode and selection was active
            if (appMode === "images" && selectionBox.current.visible) {
                e.evt.preventDefault();
                // Mark selection as inactive
                selectionBox.current.visible = false;

                // Hide the visual selection rectangle
                if (selectionRectRef.current) {
                    selectionRectRef.current.visible(false);
                    selectionRectRef.current.getLayer()?.batchDraw();
                }

                // Get the bounds of the selection box
                const box = selectionBox.current;
                const selBox = {
                    x: Math.min(box.x1, box.x2),
                    y: Math.min(box.y1, box.y2),
                    width: Math.abs(box.x2 - box.x1),
                    height: Math.abs(box.y2 - box.y1),
                };

                // Ignore clicks or tiny drags (less than 5x5 pixels)
                if (selBox.width < 5 && selBox.height < 5) {
                    console.log(
                        "App: Stage MouseUp - Selection too small, ignoring."
                    );
                    return;
                }

                const stage = e.target.getStage();
                if (!stage) return; // Exit if no stage

                // Find all image nodes within the stage
                const imageNodes = stage.find<Konva.Image>(".image"); // Use class selector

                // Filter images that intersect with the selection box
                const selectedNodes = imageNodes.filter((shape) =>
                    Konva.Util.haveIntersection(
                        selBox,
                        // Use getClientRect to account for rotation and scaling
                        shape.getClientRect({ skipTransform: false })
                    )
                );

                // Update the selected shape IDs state
                const newSelectedIds = selectedNodes.map((shape) => shape.id());
                setSelectedShapeIds(newSelectedIds);
                console.log(
                    "App: Stage MouseUp - Selected Images:",
                    newSelectedIds
                );
            }
            // If selection wasn't visible, this mouse up might be the end of a click on a shape/stage (handled by handleStageClick)
        },
        [appMode] // Depend on appMode
    );

    const handleStageClick = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            // If a selection drag just finished (selectionBox was visible), don't process this click.
            // The selection logic is handled in handleStageMouseUp.
            if (selectionBox.current.visible) {
                console.log(
                    "App: Stage Click ignored (selection box was visible)."
                );
                setSelectedShapeIds([]);
                return;
            }

            if (appMode === "images") {
                // Click on the empty stage background
                if (e.target === e.target.getStage()) {
                    console.log("App: Click on empty stage - deselecting.");
                    setSelectedShapeIds([]); // Clear selection
                }
                // Click directly on a image shape
                else if (e.target.hasName("image")) {
                    const clickedId = e.target.id();
                    console.log("App: Click on image -", clickedId);
                    // Check if Shift or Ctrl/Cmd key is pressed for multi-select
                    const metaPressed =
                        e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;

                    setSelectedShapeIds((prev) => {
                        const isSelected = prev.includes(clickedId);

                        // If meta key is NOT pressed:
                        if (!metaPressed) {
                            // If it's already selected, keep it selected (allows dragging without deselecting).
                            // If it's not selected, select only this one.
                            return isSelected ? prev : [clickedId];
                        }
                        // If meta key IS pressed:
                        else {
                            // If it's already selected, remove it from selection.
                            if (isSelected) {
                                return prev.filter((id) => id !== clickedId);
                            }
                            // If it's not selected, add it to the existing selection.
                            else {
                                return [...prev, clickedId];
                            }
                        }
                    });
                }
                // Click on the transformer - do nothing, let transformer handle it
                else if (e.target.getParent() instanceof Konva.Transformer) {
                    console.log("App: Click on Transformer - doing nothing.");
                    // Transformer handles its own clicks/drags
                }
                // Clicked on something else (e.g., base image if it was listening) - deselect images
                else {
                    console.log(
                        "App: Click on non-stage, non-image - deselecting."
                    );
                    setSelectedShapeIds([]);
                }
            }
            // If in 'points' mode, this click might be handled by the CanvasComponent's internal handler for adding points.
            // No specific image selection logic needed here for 'points' mode.
        },
        [appMode] // Depend on appMode
    );

    // --- Save Handler ---
    const handleTriggerSave = useCallback(() => {
        console.log("App: Save triggered");
        // Pass the stage ref directly to the save function
        if (stageRef.current) {
            saveStageImage(stageRef.current);
        } else {
            console.error("App: Stage ref not available for saving.");
        }
    }, [baseImage]); // No dependency needed as it reads the ref directly

    // --- Save Image Function ---
    const saveStageImage = (stage: Konva.Stage) => {
        console.log("Canvas: saveStageImage function called");
        if (!baseImage) {
            console.error("Save failed: No base image loaded.");
            return;
        }

        setSaving(true); // Indicate saving process started

        // --- Temporarily hide non-content elements ---
        const transformer = stage.findOne("Transformer"); // Find the transformer node
        const selectionRect = selectionRectRef.current; // Get selection rect from ref
        const pointsToHide = stage.find(".point-marker"); // Find all point markers by class name
        const maskOverlayVisual = stage.findOne("#mask-overlay"); // Find the blue visual mask overlay by ID
        // Note: We DON'T hide the clipping overlay (#clipping-overlay) because if it's active,
        // it's part of the desired visual output (clipping the images).

        const nodesToTemporarilyHide: Konva.Node[] = [];

        // Hide transformer if present and visible
        if (transformer && transformer.isVisible()) {
            nodesToTemporarilyHide.push(transformer);
            transformer.hide();
            // Detach nodes from transformer to ensure anchors disappear fully
            // @ts-ignore
            transformer.nodes([]); // 
        }
        // Hide selection rect if present and visible
        if (selectionRect && selectionRect.isVisible()) {
            nodesToTemporarilyHide.push(selectionRect);
            selectionRect.hide();
        }
        // Hide point markers
        pointsToHide.forEach((p) => {
            if (p.isVisible()) {
                nodesToTemporarilyHide.push(p);
                p.hide();
            }
        });
        // Hide blue visual mask overlay (we want the clipping effect, not the blue overlay)
        if (maskOverlayVisual && maskOverlayVisual.isVisible()) {
            nodesToTemporarilyHide.push(maskOverlayVisual);
            maskOverlayVisual.hide();
        }

        // Ensure all visibility changes are drawn to the canvas before exporting
        stage.batchDraw();
        // --- End hiding elements ---

        // Use a short timeout to allow the batchDraw to complete visually before exporting
        setTimeout(() => {
            try {
                console.log("Saving image...");

                // Calculate the desired output pixel ratio based on the original image dimensions
                // vs the current stage display dimensions.
                let pixelRatio = 1;
                const currentStageSize = stage.getSize(); // Get current rendered size
                if (baseImage.originalWidth > 0 && currentStageSize.width > 0) {
                    // Calculate ratio based on width, assuming aspect ratio is maintained
                    pixelRatio =
                        baseImage.originalWidth / currentStageSize.width;
                } else if (
                    baseImage.originalHeight > 0 &&
                    currentStageSize.height > 0
                ) {
                    // Fallback to height if width calculation isn't possible
                    pixelRatio =
                        baseImage.originalHeight / currentStageSize.height;
                }
                // Add a tiny epsilon to potentially avoid floating point issues causing 1px off
                pixelRatio += 0.000001;

                console.log(
                    `Stage Size: ${currentStageSize.width}x${currentStageSize.height}`
                );
                console.log(
                    `Original Size: ${baseImage.originalWidth}x${baseImage.originalHeight}`
                );
                console.log(`Calculated Pixel Ratio for save: ${pixelRatio}`);

                // Determine MIME type (e.g., 'png', 'jpeg') from original image source if possible
                let mime = "png"; // Default to png
                try {
                    const mimeMatch = baseImage.src.match(
                        /data:image\/(.+);base64,/
                    );
                    if (mimeMatch && mimeMatch[1]) {
                        mime = mimeMatch[1];
                        if (mime === "jpeg") mime = "jpg"; // Use common 'jpg' extension
                    }
                } catch (error) {
                    console.warn(
                        "Could not determine original MIME type, defaulting to png.",
                        error
                    );
                }
                console.log(`Using MIME type: image/${mime}`);

                // Export the stage content to a data URL
                const dataURL = stage.toDataURL({
                    mimeType: `image/${mime}`, // Use determined MIME type
                    quality: 1, // Use max quality for jpg
                    pixelRatio: pixelRatio, // Export at original resolution
                });

                // Create a temporary link element to trigger the download
                const link = document.createElement("a");
                link.download = `image_preview.${mime}`; // Set filename with correct extension
                link.href = dataURL; // Set the generated image data as the link target

                // Append, click, and remove the link to initiate download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                console.log("Canvas: Image saved successfully.");
            } catch (error) {
                console.error("Canvas: Failed to save image", error);
                // Potentially show an error message to the user here
            } finally {
                console.log(
                    "Canvas: Restoring visibility after save attempt..."
                );
                // --- Restore visibility of hidden elements ---
                nodesToTemporarilyHide.forEach((node) => node.show());

                // Special handling for transformer: Re-attach selected nodes if any were selected
                if (transformer) {
                    const currentlySelectedNodes = stage.find<Konva.Image>(
                        (node: { id: () => string; hasName: (arg0: string) => any; }) =>
                            selectedShapeIds.includes(node.id()) &&
                            node.hasName("image")
                    );
                    // @ts-ignore
                    transformer.nodes(currentlySelectedNodes);
                    if (currentlySelectedNodes.length === 0) {
                        transformer.hide(); // Ensure transformer stays hidden if nothing is selected
                    } else {
                        transformer.show(); // Ensure it's shown if nodes were reattached
                    }
                }
                // Ensure selection rect remains hidden unless actively selecting
                if (selectionRect) selectionRect.visible(false);

                // Batch draw again to apply visibility changes
                stage.batchDraw();
                // --- End restoring elements ---

                setSaving(false); // Indicate saving process finished
            }
        }, 100); // Short delay (e.g., 100ms)
    };

    return (
        <div className="app-container">
            <Sidebar
                appMode={appMode}
                points={segmentationPoints}
                images={images}
                baseImage={baseImage}
                aiStatus={aiStatus}
                showMask={showMask}
                isSamReady={isSamReady}
                isBgRemovalReady={isBgRemovalReady}
                maskData={maskData}
                clipImagesGlobally={clipImagesGlobally}
                isGeneratingEmbeddings={isGeneratingEmbeddings}
                selectedShapeIds={selectedShapeIds}
                onUploadBaseImage={handleUploadBaseImage}
                onUploadImage={handleUploadImage}
                onRemoveImage={handleRemoveImage}
                onRemovePoint={handleRemovePoint}
                onToggleMode={handleToggleMode}
                onToggleMask={handleToggleMask}
                onRemoveBackground={handleRemoveBackground}
                onAddColor={handleAddColor} // Pass color handler
                onSelectShape={handleSelectShapeFromSidebar}
                onToggleGlobalImageClip={handleToggleGlobalClip}
                onReorderImages={handleReorderImages}
                onSaveImage={handleTriggerSave} // Pass save trigger handler
            />
            <div className="canvas-container" ref={containerRef}>
                {/* Loading Overlay Logic */}
                {(isProcessingAny || !isSamReady || !isBgRemovalReady) && (
                    <LoadingOverlay
                        message={
                            isGeneratingEmbeddings
                                ? "Generating Embeddings..."
                                : saving
                                ? "Saving Image..."
                                : !isSamReady || !isBgRemovalReady
                                ? "Loading AI Models..."
                                : images.some((t) => t.isRemovingBg)
                                ? "Removing Background..."
                                : images.some((t) => t.isChangingColor)
                                ? "Applying Color..." // Specific message for color change
                                : "Processing..." // Generic fallback
                        }
                    />
                )}
                {/* Canvas Rendering Logic */}
                {stageSize.width > 0 && stageSize.height > 0 ? (
                    <CanvasComponent
                        ref={stageRef} // Pass the stageRef to CanvasComponent
                        appMode={appMode}
                        baseImage={baseImage}
                        images={images}
                        points={segmentationPoints}
                        maskData={maskData}
                        showMask={showMask}
                        clipImagesGlobally={clipImagesGlobally}
                        selectedShapeIds={selectedShapeIds}
                        stageSize={stageSize} // Pass stageSize down
                        // @ts-ignore
                        selectionRectRef={selectionRectRef} // Pass selection rect ref
                        onAddPoint={handleAddPoint}
                        onUpdateImageTransform={handleUpdateImageTransform} // Pass relative update handler
                        onLoadImageImage={handleLoadImageImage} // Pass image image load handler
                        // Pass stage interaction handlers
                        onStageClick={handleStageClick}
                        onStageMouseDown={handleStageMouseDown}
                        onStageMouseMove={handleStageMouseMove}
                        onStageMouseUp={handleStageMouseUp}
                    />
                ) : (
                    <div className="loading-placeholder">
                        Initializing Canvas...
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
