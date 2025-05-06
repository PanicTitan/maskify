// src/hooks/useTransformers.ts
import { useState, useEffect, useCallback, useRef } from "react";
import {
    SamModel,
    AutoProcessor,
    RawImage,
    Tensor,
    env,
    AutoModel,
    PreTrainedModel,
    Processor,
} from "@huggingface/transformers";
import type { BaseImageData, PointData, MaskData, SamOutput } from "../types";

// --- Config ---
env.allowRemoteModels = true;
env.allowLocalModels = false;

// --- Model IDs ---
const SAM_MODEL_ID = "Xenova/slimsam-77-uniform";
const BG_REMOVAL_MODEL_ID = "briaai/RMBG-1.4";

// --- Helper Function ---
const isValidNumber = (num: any): num is number =>
    typeof num === "number" && !isNaN(num);

// --- loadImage Helper ---
export const loadImage = (
    fileOrUrl: File | string
): Promise<{ element: HTMLImageElement; src: string }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve({ element: img, src: img.src });
        img.onerror = (err) => {
            console.error("Image load error:", err);
            reject(
                `Failed to load image: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        };
        if (typeof fileOrUrl === "string") {
            img.src = fileOrUrl;
        } else if (fileOrUrl instanceof File) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) img.src = e.target.result as string;
                else reject("FileReader error: No result");
            };
            reader.onerror = (err) => {
                console.error("FileReader error:", err);
                reject(
                    `FileReader failed: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            };
            reader.readAsDataURL(fileOrUrl);
        } else {
            reject("Invalid input for loadImage: Must be File or string URL.");
        }
    });
};

// --- Placeholders ---
const generateEmbeddingsPlaceholder = async (): Promise<null> => {
    console.warn("generateEmbeddings called before SAM model ready.");
    return null;
};
const segmentWithPointsPlaceholder = async (): Promise<null> => {
    console.warn("segmentWithPoints called before SAM model ready.");
    return null;
};
const removeBackgroundPlaceholder = async (): Promise<null> => {
    console.warn("removeBackground called before BG removal model ready.");
    return null;
};

// --- The Custom Hook ---
export const useTransformers = () => {
    const [status, setStatus] = useState<string>("Initializing AI models...");
    const [isSamReady, setIsSamReady] = useState(false);
    const [isBgRemovalReady, setIsBgRemovalReady] = useState(false);
    const samModelRef = useRef<SamModel | null>(null);
    const samProcessorRef = useRef<Processor | null>(null);

    const bgRemovalModelRef = useRef<PreTrainedModel | null>(null);
    const bgRemovalProcessorRef = useRef<Processor | null>(null);

    const samLoadingRef = useRef(false);
    const bgLoadingRef = useRef(false);

    // --- Initialize SAM ---
    useEffect(() => {
        if (isSamReady || samModelRef.current || samLoadingRef.current) return;
        samLoadingRef.current = true;
        let mounted = true;
        console.log("useTransformers: useEffect - Attempting to load SAM...");
        setStatus("Loading SAM model & processor...");
        const loadSam = async () => {
            try {
                let model: SamModel;
                let processor: Processor;

                let backends = [undefined, "webgpu", "auto", "gpu", "cpu", "wasm", "cuda", "dml", "webnn", "webnn-npu", "webnn-gpu", "webnn-cpu"];
                let backendIndex = 0;

                while (true) {
                    if (backendIndex == backends.length) {
                        alert("No backend available!");
                        throw new Error("No backend available!");
                    }

                    try {
                        console.log(`SAM Trying ${backends[backendIndex]} backend`);

                        processor = await AutoProcessor.from_pretrained(
                            SAM_MODEL_ID,
                            {}
                        );
                        // @ts-ignore
                        model = await SamModel.from_pretrained(SAM_MODEL_ID, {
                            // @ts-ignore
                            device: backends[backendIndex] // getDevice()
                        });

                        console.log(`SAM ${backends[backendIndex]} backend worked`);

                        break;
                    } catch (error) {
                        console.log(`SAM ${backends[backendIndex]} backend failed`);
                        backendIndex++;
                    }
                }
                if (mounted) {
                    console.log(
                        "useTransformers: SAM loaded successfully. Storing in refs."
                    );
                    samProcessorRef.current = processor;
                    samModelRef.current = model;
                    setIsSamReady(true);
                    setStatus((prev) =>
                            (bgRemovalModelRef.current && bgRemovalProcessorRef.current)
                            ? "All AI models ready."
                            : "SAM ready. Loading BG Removal..."
                    );
                }
            } catch (error) {
                console.error("useTransformers: SAM loading failed:", error);
                if (mounted) {
                    setStatus(
                        `Error loading SAM: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`
                    );
                    setIsSamReady(false);
                }
            } finally {
                if (mounted) samLoadingRef.current = false;
            }
        };
        loadSam();
        return () => {
            mounted = false;
        };
    }, [isSamReady]);
    // --- Initialize BG Removal ---
    useEffect(() => {
        if (
            isBgRemovalReady ||
            (bgRemovalModelRef.current && bgRemovalProcessorRef.current) ||
            bgLoadingRef.current
        )
            return;
        bgLoadingRef.current = true;
        let mounted = true;
        console.log(
            "useTransformers: useEffect - Attempting to load BG Removal pipeline..."
        );
        setStatus((prev) =>
            samModelRef.current
                ? "SAM ready. Loading BG Removal..."
                : "Loading BG Removal pipeline..."
        );
        const loadBgRemoval = async () => {
            try {
                let model: PreTrainedModel;
                let processor: Processor;

                let backends = [undefined, "webgpu", "auto", "gpu", "cpu", "wasm", "cuda", "dml", "webnn", "webnn-npu", "webnn-gpu", "webnn-cpu"];
                let backendIndex = 0;

                while (true) {
                    if (backendIndex == backends.length) {
                        alert("No backend available!");
                        throw new Error("No backend available!");
                    }

                    try {
                        console.log(`BG Removal Trying ${backends[backendIndex]} backend`);

                        model = await AutoModel.from_pretrained(BG_REMOVAL_MODEL_ID, {
                            // @ts-ignore
                            device: backends[backendIndex], // getDevice(),
                            // @ts-ignore
                            config: {
                                model_type: "custom"
                            }
                        })
        
                        processor = await AutoProcessor.from_pretrained(BG_REMOVAL_MODEL_ID, {
                            config: {
                                do_normalize: !0,
                                do_pad: !1,
                                do_rescale: !0,
                                do_resize: !0,
                                image_mean: [.5, .5, .5],
                                feature_extractor_type: "ImageFeatureExtractor",
                                image_std: [1, 1, 1],
                                resample: 2,
                                rescale_factor: .00392156862745098,
                                size: {
                                    width: 1024,
                                    height: 1024
                                }
                            }
                        });

                        console.log(`BG Removal ${backends[backendIndex]} backend worked`);

                        break;
                    } catch (error) {
                        console.log(`BG Removal ${backends[backendIndex]} backend failed`);

                        backendIndex++;
                    }
                }

                if (mounted) {
                    console.log("mounted")
                    console.log(
                        "useTransformers: BG Removal pipeline loaded successfully. Storing in ref."
                    );
                    bgRemovalModelRef.current = model;
                    bgRemovalProcessorRef.current = processor;
                    setIsBgRemovalReady(true);
                    setStatus((prev) =>
                        samModelRef.current
                            ? "All AI models ready."
                            : "BG Removal ready. Waiting for SAM..."
                    );
                }
            } catch (error) {
                console.error(
                    "useTransformers: BG Removal loading failed:",
                    error
                );
                if (mounted) {
                    setStatus(
                        `Error loading BG Removal: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`
                    );
                    setIsBgRemovalReady(false);
                }
            } finally {
                if (mounted) bgLoadingRef.current = false;
            }
        };
        loadBgRemoval();
        return () => {
            mounted = false;
        };
    }, [isBgRemovalReady]);

    // --- AI Function Implementations ---
    const generateEmbeddingsImpl = useCallback(
        async (
            imageData: BaseImageData
        ): Promise<{ embeddings: any; processedResult: any } | null> => {
            console.log("generateEmbeddingsImpl called.");
            const processor = samProcessorRef.current;
            const model = samModelRef.current;
            if (!processor || !model || !imageData?.element?.src) {
                setStatus(
                    "Cannot generate embeddings: SAM refs not ready or invalid image."
                );
                console.warn("generateEmbeddingsImpl prerequisites FAIL:", {
                    processor: !!processor,
                    model: !!model,
                    imageSrc: imageData?.element?.src?.substring(0, 30),
                });
                return null;
            }
            setStatus("Generating image embeddings...");
            try {
                const imageSrc = imageData.element.src;
                const image = await RawImage.fromURL(imageSrc);
                if (!image?.data || !image.width || !image.height)
                    throw new Error("Failed to create valid RawImage.");
                console.log(
                    "About to call processor (from ref). Type:",
                    typeof processor
                );
                let processedResult: any;
                try {
                    processedResult = await processor(image);
                } catch (processorError) {
                    console.error(
                        "ERROR calling processor(image):",
                        processorError
                    );
                    setStatus(
                        `Error during image preprocessing: ${
                            processorError instanceof Error
                                ? processorError.message
                                : String(processorError)
                        }`
                    );
                    return null;
                }
                if (
                    !processedResult?.reshaped_input_sizes ||
                    !processedResult?.original_sizes
                )
                    throw new Error("Invalid result from processor");
                console.log("Image processed.");
                const embeddings = await model.get_image_embeddings(
                    processedResult
                );
                if (!embeddings?.image_embeddings)
                    throw new Error("Invalid embeddings object from model");
                console.log("Embeddings generated.");
                setStatus("Embeddings generated.");
                return { embeddings, processedResult };
            } catch (error) {
                console.error(
                    "Embedding generation failed within try block:",
                    error
                );
                setStatus(
                    `Embedding error: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                return null;
            }
        },
        []
    );

    const segmentWithPointsImpl = useCallback(
        async (
            baseImage: BaseImageData,
            points: PointData[]
        ): Promise<MaskData | null> => {
            console.log("segmentWithPointsImpl called.");
            const processor = samProcessorRef.current;
            const model = samModelRef.current;
            if (
                !processor ||
                !model ||
                !baseImage?.element ||
                !baseImage?.embeddings?.image_embeddings ||
                !baseImage?.processedResult?.reshaped_input_sizes
            ) {
                setStatus(
                    "Cannot segment: SAM refs/data not ready or baseImage missing."
                );
                console.warn("segmentWithPointsImpl prerequisites FAIL:", {
                    processor: !!processor,
                    model: !!model,
                    hasElement: !!baseImage?.element,
                    embeddingsExist: !!baseImage?.embeddings?.image_embeddings,
                    processedResultExist:
                        !!baseImage?.processedResult?.reshaped_input_sizes,
                    pointsLength: points.length,
                });
                return null;
            }
            if (points.length === 0) {
                setStatus("Add points to segment.");
                return {
                    maskCanvas: null,
                    clippingOverlayCanvas: null,
                    rawMaskTensor: undefined,
                };
            }
            setStatus("Segmenting image...");
            try {
                const originalImageElement = baseImage.element;
                const processed = baseImage.processedResult;
                const embeddings = baseImage.embeddings;

                // *** REVISED: Scale points by RESHAPED size (like original example) ***
                const reshaped = processed.reshaped_input_sizes[0]; // [height, width]
                const inputPoints = points.map((p) => [
                    p.x * reshaped[1], // Use reshaped width
                    p.y * reshaped[0], // Use reshaped height
                ]);
                console.log(
                    "Calculated Absolute Input Points (relative to RESHAPED):",
                    inputPoints
                );
                // *******************************************************************

                const inputLabels = points.map((p) => BigInt(p.label));
                const numPoints = points.length;
                const pointsTensor = new Tensor("float32", inputPoints.flat(), [
                    1,
                    1,
                    numPoints,
                    2,
                ]);
                const labelsTensor = new Tensor("int64", inputLabels.flat(), [
                    1,
                    1,
                    numPoints,
                ]);
                const { pred_masks, iou_scores }: SamOutput = await model({
                    ...embeddings,
                    input_points: pointsTensor,
                    input_labels: labelsTensor,
                });
                if (!pred_masks || !iou_scores)
                    throw new Error(
                        "Invalid output from segmentation model call."
                    );
                console.log("Post-processing masks...");
                // @ts-ignore
                const masks = await processor.post_process_masks(
                    pred_masks,
                    processed.original_sizes,
                    processed.reshaped_input_sizes
                );
                console.log("Masks post-processed.");
                const scores = iou_scores.data as Float32Array;
                let bestIndex = 0;
                if (scores.length > 1) {
                    let maxScore = scores[0];
                    for (let i = 1; i < scores.length; ++i)
                        if (scores[i] > maxScore) {
                            maxScore = scores[i];
                            bestIndex = i;
                        }
                }
                const bestScore = scores[bestIndex]?.toFixed(3) ?? "N/A";
                setStatus(`Segmentation done. Score: ${bestScore}`);
                const masksTensorPre = masks[0];
                if (
                    !masksTensorPre ||
                    typeof masksTensorPre.dims === "undefined"
                )
                    throw new Error(
                        `Invalid result from post_process_masks. Expected Tensor, got: ${typeof masksTensorPre}`
                    );
                console.log("Initial Masks Tensor Shape:", masksTensorPre.dims);
                console.log("Best Index:", bestIndex);
                let rawMaskData: Uint8Array | Float32Array;
                let maskHeight: number;
                let maskWidth: number;
                let masksTensor = masksTensorPre;
                if (
                    masksTensor.dims.length === 4 &&
                    masksTensor.dims[0] === 1
                ) {
                    console.log("Squeezing first dimension of 4D tensor...");
                    masksTensor = masksTensor.squeeze(0);
                    console.log(
                        "Squeezed Masks Tensor Shape:",
                        masksTensor.dims
                    );
                }
                if (masksTensor.dims.length !== 3)
                    throw new Error(
                        `Unexpected tensor shape after potential squeeze: ${masksTensor.dims}`
                    );
                const numMasksInTensor = masksTensor.dims[0];
                maskHeight = masksTensor.dims[1];
                maskWidth = masksTensor.dims[2];
                if (bestIndex < 0 || bestIndex >= numMasksInTensor) {
                    console.error(
                        `Invalid bestIndex ${bestIndex}. Defaulting to 0.`
                    );
                    bestIndex = 0;
                }
                if (!isValidNumber(maskHeight) || !isValidNumber(maskWidth))
                    throw new Error(
                        `Invalid dimensions extracted: H=${maskHeight}, W=${maskWidth}`
                    );
                const maskSize = maskHeight * maskWidth;
                const offset = bestIndex * maskSize;
                rawMaskData = new (
                    masksTensorPre.type === "float32"
                        ? Float32Array
                        : Uint8Array
                )(maskSize);
                rawMaskData.set(
                    masksTensorPre.data.slice(offset, offset + maskSize)
                );
                console.log(`Extracted mask ${bestIndex} manually.`);
                console.log("Creating blue overlay mask canvas...");
                const blueOverlayCanvas = document.createElement("canvas");
                blueOverlayCanvas.width = maskWidth;
                blueOverlayCanvas.height = maskHeight;
                const blueCtx = blueOverlayCanvas.getContext("2d");
                if (!blueCtx)
                    throw new Error(
                        "Could not get 2D context for blue overlay canvas"
                    );
                const blueImageData = blueCtx.createImageData(
                    maskWidth,
                    maskHeight
                );
                const blueRgbaData = blueImageData.data;
                for (let i = 0; i < rawMaskData.length; ++i) {
                    const rgbaOffset = 4 * i;
                    if (rawMaskData[i] === 1) {
                        blueRgbaData[rgbaOffset] = 0;
                        blueRgbaData[rgbaOffset + 1] = 114;
                        blueRgbaData[rgbaOffset + 2] = 189;
                        blueRgbaData[rgbaOffset + 3] = 150;
                    } else {
                        blueRgbaData[rgbaOffset + 3] = 0;
                    }
                }
                blueCtx.putImageData(blueImageData, 0, 0);
                console.log("Blue overlay mask canvas created.");
                console.log("Creating clipping overlay canvas (INVERTED)...");
                const clipOverlayCanvas = document.createElement("canvas");
                clipOverlayCanvas.width = maskWidth;
                clipOverlayCanvas.height = maskHeight;
                const clipCtx = clipOverlayCanvas.getContext("2d");
                if (!clipCtx)
                    throw new Error(
                        "Could not get 2D context for clipping overlay canvas"
                    );
                console.log(
                    `Drawing original image (${originalImageElement.naturalWidth}x${originalImageElement.naturalHeight}) onto clipping canvas (${maskWidth}x${maskHeight})`
                );
                clipCtx.drawImage(
                    originalImageElement,
                    0,
                    0,
                    maskWidth,
                    maskHeight
                );
                const clipImageData = clipCtx.getImageData(
                    0,
                    0,
                    maskWidth,
                    maskHeight
                );
                const clipRgbaData = clipImageData.data;
                console.log(
                    "Applying INVERTED mask to clipping canvas data..."
                );
                for (let i = 0; i < rawMaskData.length; ++i) {
                    if (rawMaskData[i] === 1) {
                        const rgbaOffset = 4 * i;
                        clipRgbaData[rgbaOffset + 3] = 0;
                    }
                }
                clipCtx.putImageData(clipImageData, 0, 0);
                console.log("Clipping overlay canvas created (INVERTED).");
                return {
                    maskCanvas: blueOverlayCanvas,
                    clippingOverlayCanvas: clipOverlayCanvas,
                    rawMaskTensor: undefined,
                };
            } catch (error) {
                console.error("Segmentation failed:", error);
                setStatus(
                    `Segmentation error: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                return null;
            }
        },
        []
    ); // Keep empty dependency array

    const removeBackgroundImpl = useCallback(
        async (imageUrl: string): Promise<string | null> => {
            console.log("removeBackgroundImpl called.");
            const model = bgRemovalModelRef.current;
            const processor = bgRemovalProcessorRef.current;
            console.log("model:", model)
            console.log("processor:", processor)
            if (!model && !processor) {
                setStatus("Cannot remove background: Model ref not ready.");
                console.warn("removeBackgroundImpl prerequisites FAIL:", {
                    model: !!model,
                    processor: !!processor,
                });
                return null;
            }
            if (
                typeof imageUrl !== "string" ||
                !imageUrl.startsWith("data:image")
            ) {
                setStatus(
                    "Invalid input for background removal (requires data URL)."
                );
                return null;
            }
            setStatus("Removing background...");
            try {
                const image = await RawImage.fromURL(imageUrl);
                const {pixel_values} = await processor!(image)

                const {output} = await model!({ input: pixel_values });
                console.log("BG Removal Pipeline Result (raw):", output);
                console.log(
                    "BG Removal Pipeline Result (type):",
                    typeof output
                );

                let rawImage = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(image.width, image.height)
                let tempCanvas = document.createElement("canvas");
                tempCanvas.width = image.width;
                tempCanvas.height = image.height;
                const tempCtx = tempCanvas.getContext("2d");
                tempCtx!.drawImage(image.toCanvas(), 0, 0);
                const tempImageData = tempCtx!.getImageData(0, 0, image.width, image.height);
                for (let t = 0; t < rawImage.data.length; ++t)
                    tempImageData.data[4 * t + 3] = rawImage.data[t];
                tempCtx!.putImageData(tempImageData, 0, 0);

                const result = tempCanvas.toDataURL();

                // @ts-ignore
                if (result instanceof Blob)
                    console.log(
                        "BG Removal Pipeline Result is Blob, size:",
                        result.size,
                        "type:",
                        result.type
                    );
                if (Array.isArray(result))
                    console.log(
                        "BG Removal Pipeline Result is Array, length:",
                        result.length
                    );
                let outputSrc: string | null = null;
                if (Array.isArray(result) && result.length > 0) {
                    const firstResult = result[0];
                    console.log(
                        "Handling Array result, first element:",
                        firstResult
                    );
                    if (firstResult?.mask instanceof RawImage) {
                        console.log(
                            "Handling RawImage mask in Array result..."
                        );
                        const maskImage = firstResult.mask;
                        console.log(
                            `Compositing original image with ${maskImage.channels}-channel mask...`
                        );
                        const originalImgElement = await loadImage(
                            imageUrl
                        ).then((res) => res.element);
                        if (
                            !originalImgElement ||
                            !originalImgElement.complete ||
                            !originalImgElement.naturalWidth
                        ) {
                            throw new Error(
                                "Failed to load original image for compositing during BG removal."
                            );
                        }
                        const canvas = document.createElement("canvas");
                        const width = maskImage.width;
                        const height = maskImage.height;
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx)
                            throw new Error(
                                "Could not get 2D context for BG removal canvas"
                            );
                        ctx.drawImage(originalImgElement, 0, 0, width, height);
                        const originalImageData = ctx.getImageData(
                            0,
                            0,
                            width,
                            height
                        );
                        const originalRgbaData = originalImageData.data;
                        if (
                            maskImage.channels === 1 &&
                            maskImage.data.length === width * height
                        ) {
                            for (let i = 0; i < maskImage.data.length; ++i) {
                                const alphaOffset = i * 4 + 3;
                                originalRgbaData[alphaOffset] =
                                    maskImage.data[i] * 255;
                            }
                            ctx.putImageData(originalImageData, 0, 0);
                            console.log(
                                "Applied single-channel mask as alpha."
                            );
                            outputSrc = canvas.toDataURL();
                        } else if (
                            maskImage.channels === 4 &&
                            maskImage.data.length === width * height * 4
                        ) {
                            console.warn(
                                "BG removal RawImage mask has 4 channels, attempting direct use."
                            );
                            ctx.clearRect(0, 0, width, height);
                            const maskAsImageData = ctx.createImageData(
                                width,
                                height
                            );
                            if (maskImage.data instanceof Uint8ClampedArray) {
                                maskAsImageData.data.set(maskImage.data);
                                ctx.putImageData(maskAsImageData, 0, 0);
                                outputSrc = canvas.toDataURL();
                            } else {
                                console.error(
                                    "Cannot directly use 4-channel mask data as it's not Uint8ClampedArray."
                                );
                            }
                        } else {
                            console.warn(
                                `Cannot handle RawImage mask with ${maskImage.channels} channels and data length ${maskImage.data.length}.`
                            );
                            outputSrc = imageUrl;
                        }
                    } else if (firstResult instanceof Blob) {
                        console.log("Handling Blob in Array result...");
                        outputSrc = await new Promise((res, rej) => {
                            const r = new FileReader();
                            r.onloadend = () => res(r.result as string);
                            r.onerror = rej;
                            r.readAsDataURL(firstResult);
                        });
                    } else if (
                        typeof firstResult === "string" &&
                        firstResult.startsWith("data:image")
                    ) {
                        console.log("Handling Data URL in Array result...");
                        outputSrc = firstResult;
                    } else {
                        console.warn(
                            "BG removal result array element format not recognized:",
                            firstResult
                        );
                    }
                    // @ts-ignore
                } else if (result instanceof Blob) {
                    console.log("Handling Blob result...");
                    outputSrc = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onloadend = () => res(r.result as string);
                        r.onerror = rej;
                        r.readAsDataURL(result);
                    });
                } else if (
                    typeof result === "string" &&
                    result.startsWith("data:image")
                ) {
                    console.log("Handling Data URL result...");
                    outputSrc = result;
                } else if (
                    typeof result === "object" &&
                    result !== null &&
                    // @ts-ignore
                    result.output
                ) {
                    console.log(
                        "Handling Object with 'output' property:",
                        // @ts-ignore
                        result.output
                    );
                    // @ts-ignore
                    const output = result.output;
                    if (output instanceof Blob) {
                        console.log("Handling Blob in object.output...");
                        outputSrc = await new Promise((res, rej) => {
                            const r = new FileReader();
                            r.onloadend = () => res(r.result as string);
                            r.onerror = rej;
                            r.readAsDataURL(output);
                        });
                    } else if (
                        typeof output === "string" &&
                        output.startsWith("data:image")
                    ) {
                        console.log("Handling Data URL in object.output...");
                        outputSrc = output;
                    } else {
                        console.warn(
                            "BG removal result.output format not recognized:",
                            output
                        );
                    }
                }
                if (!outputSrc) {
                    console.warn(
                        "Unexpected background removal output format:",
                        result
                    );
                    throw new Error(
                        "Background removal output format not recognized."
                    );
                }
                setStatus("Background removed.");
                return outputSrc;
            } catch (error) {
                console.error("Background removal failed:", error);
                setStatus(
                    `Background removal error: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                throw error;
            }
        },
        []
    );

    // --- Return Value ---
    return {
        status,
        isSamReady,
        isBgRemovalReady,
        loadImage,
        generateEmbeddings: isSamReady
            ? generateEmbeddingsImpl
            : generateEmbeddingsPlaceholder,
        segmentWithPoints: isSamReady
            ? segmentWithPointsImpl
            : segmentWithPointsPlaceholder,
        removeBackground: isBgRemovalReady
            ? removeBackgroundImpl
            : removeBackgroundPlaceholder,
    };
};
