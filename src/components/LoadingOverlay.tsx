// src/components/LoadingOverlay.tsx
import React from "react";
import type { LoadingOverlayProps } from "../types";
import "./LoadingOverlay.css";

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    message = "Loading...",
}) => {
    return (
        <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>{message}</p>
        </div>
    );
};

export default LoadingOverlay;
