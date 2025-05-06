// src/types.ts
import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";

export type AppMode = "points" | "images";

export interface PointData {
    id: string;
    /** Relative coordinates (0-1) on original image */
    x: number; 
    /** Relative coordinates (0-1) on original image */
    y: number; 
    /** 0 for negative, 1 for positive */
    label: 0 | 1; 
}

export interface ImageData {
    isChangingColor?: boolean;
    id: string
    /** The initially uploaded source (Data URL) */
    originalSrc: string;
    /** Source after potential background removal (Data URL or Blob URL) */
    processedSrc: string;
    /** Preloaded image element for Konva */
    konvaImage?: HTMLImageElement;
    /** Relative X position (0-1) */
    relX: number;
    /** Relative Y position (0-1) */
    relY: number;
    /** Relative width (0-1, based on stage width) */
    relWidth: number;
    /** Relative height (0-1, based on stage height) */
    relHeight: number;
    rotation: number;
    // scaleX/scaleY might become less directly used for sizing, but Transformer uses them
    scaleX: number;
    scaleY: number
    /** Flag for BG removal loading indicator */
    isRemovingBg?: boolean;
    /** Flag for initial loading */
    isLoading?: boolean;
    /** Filename or generated name */
    name: string;

}

export interface BaseImageData {
    /** Data URL */
    src: string;
    /** Loaded HTML Image Element */
    element: HTMLImageElement;
    originalWidth: number;
    originalHeight: number;
    /** Store SAM embeddings here (specific type depends on library version) */
    embeddings?: any;
    /** Store SAM processor result here */
    processedResult?: any;

}

export interface SamOutput {
    pred_masks: any;
    iou_scores: any;

}

export interface MaskData {
    /** Blue overlay for visual feedback */
    maskCanvas: HTMLCanvasElement | null;
    /** Canvas with original image pixels for clipping */
    clippingOverlayCanvas: HTMLCanvasElement | null;
    /** Store raw mask tensor if needed later */
    rawMaskTensor?: any;
}

// Props for components
export interface SidebarProps {
    appMode: AppMode;
    points: PointData[];
    images: ImageData[];
    baseImage: BaseImageData | null;
    aiStatus: string;
    /** For blue overlay toggle */
    showMask: boolean;
    /** Pass readiness status */
    isSamReady: boolean;
    /** Pass readiness status */
    isBgRemovalReady: boolean;
    /** Pass mask data */
    maskData: MaskData | null;
    /** Global clip state */
    clipImagesGlobally: boolean;
    /** Embedding loading state prop */
    isGeneratingEmbeddings: boolean;
    /** Highlight selected image in list */
    selectedShapeIds: string[];
    onUploadBaseImage: (file: File) => void;
    onUploadImage: (file: File) => void;
    onRemoveImage: (id: string) => void;
    onRemovePoint: (id: string) => void;
    onToggleMode: () => void;
    /** Toggles blue overlay */
    onToggleMask: () => void;
    onRemoveBackground: (id: string) => Promise<void>;
    onAddColor: (id: string, color: string) => Promise<void>;
    /** Used for focusing image from list */
    onSelectShape: (id: string) => void;
    /** Handler for global clip toggle */
    onToggleGlobalImageClip: () => void;
    /** Reorder handler prop */
    onReorderImages: (draggedId: string, droppedOnId: string) => void;
    /** Save final image */
    onSaveImage: () => void;
}

// --- CanvasProps ---
export interface CanvasProps {
    appMode: AppMode;
    baseImage: BaseImageData | null;
    /** Order matters here for rendering */
    images: ImageData[];
    points: PointData[];
    maskData: MaskData | null;
    /** For blue overlay */
    showMask: boolean;
    /** Global clip state */
    clipImagesGlobally: boolean;
    selectedShapeIds: string[];
    stageSize: { width: number; height: number };
    /** Ref for selection rectangle */
    selectionRectRef: React.RefObject<Konva.Rect>;
    onAddPoint: (x: number, y: number, label: 0 | 1) => void;
    onUpdateImageTransform: (
        id: string,
        /** Expect relative attrs now */
        attrs: Partial<
            Pick<
                ImageData,
                "relX" | "relY" | "relWidth" | "relHeight" | "rotation"
            >
        >
    ) => void;
    onLoadImageImage: (
        id: string,
        img: HTMLImageElement,
        width: number,
        height: number
    ) => void;
    onStageClick: (e: KonvaEventObject<MouseEvent>) => void;
    onStageMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
    onStageMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
    onStageMouseUp: (e: KonvaEventObject<MouseEvent>) => void;
}

/** Prop type for Loading Overlay */
export interface LoadingOverlayProps {
    message?: string;
}
