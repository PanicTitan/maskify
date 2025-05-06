// src/components/Sidebar.tsx
import React, { useRef, useState } from "react";
import type { SidebarProps } from "../types";
import "./Sidebar.css";

const Sidebar: React.FC<SidebarProps> = ({
    appMode,
    points,
    images,
    baseImage,
    aiStatus,
    showMask,
    isSamReady,
    isBgRemovalReady,
    maskData,
    clipImagesGlobally,
    isGeneratingEmbeddings,
    selectedShapeIds,
    onUploadBaseImage,
    onUploadImage,
    onRemoveImage,
    onRemovePoint,
    onToggleMode,
    onToggleMask,
    onRemoveBackground,
    onAddColor,
    onSelectShape,
    onToggleGlobalImageClip,
    onReorderImages,
    onSaveImage, 
}) => {
    const baseImageInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [hidden, setHidden] = useState<boolean>(false);

    const handleBaseImageUpload = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        if (event.target.files && event.target.files[0]) {
            onUploadBaseImage(event.target.files[0]);
            event.target.value = "";
        }
    };
    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            onUploadImage(event.target.files[0]);
            event.target.value = "";
        }
    };
    const triggerBaseImageUpload = () => baseImageInputRef.current?.click();
    const triggerImageUpload = () => imageInputRef.current?.click();

    const canClip = !!maskData?.clippingOverlayCanvas;
    const isProcessingAny =
        isGeneratingEmbeddings || images.some((t) => t.isRemovingBg);

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, id: string) => {
        e.dataTransfer.setData("imageId", id);
        e.dataTransfer.effectAllowed = "move";
    };
    const handleDragOver = (e: React.DragEvent<HTMLLIElement>, id: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverId !== id) setDragOverId(id);
    };
    const handleDragLeave = () => {
        setDragOverId(null);
    };
    const handleDrop = (
        e: React.DragEvent<HTMLLIElement>,
        droppedOnId: string
    ) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("imageId");
        setDragOverId(null);
        if (draggedId && droppedOnId && draggedId !== droppedOnId)
            onReorderImages(draggedId, droppedOnId);
    };
    const handleDragEnd = () => {
        setDragOverId(null);
    };
    const handleItemClick = (
        e: React.MouseEvent<HTMLLIElement>,
        id: string
    ) => {
        if (
            e.defaultPrevented ||
            (e.target instanceof HTMLElement &&
                e.target.closest("button, span.processing-text"))
        )
            return;
        if (appMode === "images") {
            onSelectShape(id);
        }
    };

    return (
        <div className={`sidebar ${isProcessingAny ? "sidebar-disabled" : ""} ${hidden ? "sidebar-hidden" : ""}`}>
            {/* Hide Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setHidden(!hidden);
                }}
                className="remove-button normal-button close-button"
                title="Esconder"
                disabled={isProcessingAny}
            >
                ≡
            </button>
            <div className="sidebar-height-wrapper">
                {/* Status */}
                <div className="sidebar-section status-section">
                    {" "}
                    <h4>AI Status</h4> <p className="ai-status">{aiStatus}</p>{" "}
                    <p className="readiness-status">
                        {" "}
                        SAM: {isSamReady ? "✅" : "⏳"} | BG Rem:{" "}
                        {isBgRemovalReady ? "✅" : "⏳"}{" "}
                    </p>{" "}
                </div>

                {/* Base Image */}
                <div className="sidebar-section">
                    {" "}
                    <h4>Base Image</h4>{" "}
                    <button
                        onClick={triggerBaseImageUpload}
                        disabled={!isSamReady || isProcessingAny}
                    >
                        {" "}
                        {baseImage
                            ? "Replace Base Image"
                            : "Upload Base Image"}{" "}
                    </button>{" "}
                    {isGeneratingEmbeddings && (
                        <span className="warning-text">(Processing...)</span>
                    )}{" "}
                    {!isSamReady && !isGeneratingEmbeddings && (
                        <span className="warning-text">(Wait for SAM Ready)</span>
                    )}{" "}
                    <input
                        type="file"
                        ref={baseImageInputRef}
                        onChange={handleBaseImageUpload}
                        accept="image/*"
                        style={{ display: "none" }}
                    />{" "}
                    {baseImage && (
                        <div className="thumbnail-container base-image-thumb">
                            {" "}
                            <img
                                src={baseImage.src}
                                alt="Base"
                                className="thumbnail"
                            />{" "}
                        </div>
                    )}{" "}
                </div>

                {/* Controls */}
                <div className="sidebar-section controls-section">
                    {" "}
                    <h4>Controls</h4>{" "}
                    <button onClick={onToggleMode} disabled={isProcessingAny}>
                        {" "}
                        Mode: {appMode === "points"
                            ? "Points/Mask"
                            : "Images"}{" "}
                    </button>{" "}
                    {baseImage && (
                        <button
                            onClick={onToggleMask}
                            disabled={!maskData?.maskCanvas || isProcessingAny}
                            title={
                                !maskData?.maskCanvas ? "No mask generated yet" : ""
                            }
                        >
                            {" "}
                            {showMask
                                ? "Hide Mask Overlay"
                                : "Show Mask Overlay"}{" "}
                        </button>
                    )}{" "}
                    {appMode === "images" && (
                        <button
                            onClick={onToggleGlobalImageClip}
                            disabled={!canClip || isProcessingAny}
                            title={
                                !canClip
                                    ? "Generate mask first"
                                    : clipImagesGlobally
                                    ? "Unclip All Images"
                                    : "Clip All Images to Mask"
                            }
                            className={
                                clipImagesGlobally
                                    ? "clip-button active"
                                    : "clip-button"
                            }
                        >
                            {" "}
                            {clipImagesGlobally ? "Unclip All" : "Clip All"}{" "}
                        </button>
                    )}
                    {/* --- SAVE BUTTON --- */}
                    <button
                        onClick={onSaveImage}
                        disabled={!baseImage || isProcessingAny}
                        className="save-button"
                        title="Save current canvas view"
                    >
                        Save Image
                    </button>
                    {/* --- SAVE BUTTON --- */}
                </div>

                {/* Points List */}
                {appMode === "points" && baseImage && (
                    <div className="sidebar-section list-section">
                        {" "}
                        <h4>Segmentation Points ({points.length})</h4>{" "}
                        {isGeneratingEmbeddings && (
                            <p className="warning-text">Processing base image...</p>
                        )}{" "}
                        {!isSamReady && !isGeneratingEmbeddings && (
                            <p className="warning-text">Waiting for SAM model...</p>
                        )}{" "}
                        {isSamReady &&
                            !isGeneratingEmbeddings &&
                            points.length === 0 && (
                                <p>Click image to add points.</p>
                            )}{" "}
                        <ul>
                            {" "}
                            {points.reverse().map((point) => (
                                <li key={point.id} className="list-item point-item">
                                    {" "}
                                    <span>
                                        Point{" "}
                                        {point.label === 1 ? "(Pos)" : "(Neg)"}
                                    </span>{" "}
                                    <button
                                        onClick={() => onRemovePoint(point.id)}
                                        className="remove-button"
                                        title="Remove Point"
                                        disabled={isProcessingAny}
                                    >
                                        ✖
                                    </button>{" "}
                                </li>
                            ))}{" "}
                        </ul>{" "}
                    </div>
                )}

                {/* Images List */}
                {appMode === "images" && (
                    <div className="sidebar-section list-section">
                        <h4>Images ({images.length})</h4>{" "}
                        <button
                            onClick={triggerImageUpload}
                            disabled={isProcessingAny}
                        >
                            Upload Image
                        </button>{" "}
                        <input
                            type="file"
                            ref={imageInputRef}
                            onChange={handleImageUpload}
                            accept="image/*"
                            style={{ display: "none" }}
                        />{" "}
                        {images.length === 0 && <p>Upload image images.</p>}
                        <ul onDragOver={(e) => e.preventDefault()}>
                            {images.map((image) => (
                                <li
                                    key={image.id}
                                    id={image.id}
                                    className={`list-item image-item ${
                                        dragOverId === image.id
                                            ? "drag-over-visual"
                                            : ""
                                    } ${
                                        selectedShapeIds.includes(image.id)
                                            ? "selected"
                                            : ""
                                    }`}
                                    draggable={!isProcessingAny}
                                    onClick={(e) => handleItemClick(e, image.id)}
                                    onDragStart={(e) =>
                                        !isProcessingAny &&
                                        handleDragStart(e, image.id)
                                    }
                                    onDragOver={(e) => handleDragOver(e, image.id)}
                                    onDrop={(e) => handleDrop(e, image.id)}
                                    onDragLeave={handleDragLeave}
                                    onDragEnd={handleDragEnd}
                                >
                                    <div className="thumbnail-container">
                                        {" "}
                                        {image.isLoading ? (
                                            <span>⏳</span>
                                        ) : (
                                            <img
                                                src={
                                                    image.processedSrc ||
                                                    image.originalSrc
                                                }
                                                alt={image.name}
                                                className="thumbnail"
                                            />
                                        )}{" "}
                                    </div>
                                    <div className="item-details">
                                        <span>{image.name}</span>
                                        <div className="item-actions">
                                            {image.isRemovingBg ? (
                                                <span className="processing-text">
                                                    Processing BG...
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() =>
                                                        onRemoveBackground(
                                                            image.id
                                                        )
                                                    }
                                                    disabled={
                                                        !isBgRemovalReady ||
                                                        image.processedSrc !==
                                                            image.originalSrc ||
                                                        isProcessingAny
                                                    }
                                                    title={"Remove Background"}
                                                >
                                                    BG Rem
                                                </button>
                                            )}
                                            {/* onAddColor */}
                                            <input
                                                className="change-color"
                                                type="color"
                                                onChange={(event) =>
                                                    onAddColor(
                                                        image.id,
                                                        event.target.value
                                                    )
                                                }
                                                disabled={
                                                    isProcessingAny
                                                }
                                                title={"Remove Background"}
                                            />
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveImage(image.id);
                                                }}
                                                className="remove-button"
                                                title="Remove Image"
                                                disabled={isProcessingAny}
                                            >
                                                ✖
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
