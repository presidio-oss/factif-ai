import { memo, useEffect, useState, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { INodeData } from "@/types/message.types.ts";

export default memo(
  ({
    id,
    data,
    selected = false,
    isConnectable,
  }: {
    id: string;
    data: INodeData;
    selected?: boolean;
    isConnectable?: boolean;
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Default values for potentially missing data
    const safeData = {
      label: data?.label || "",
      edges: Array.isArray(data?.edges) ? data.edges : [],
      imageData: data?.imageData || undefined, // Ensure this is explicitly undefined if missing
      category: data?.category || "uncategorized",
      categoryDescription: data?.categoryDescription || "",
      categoryColor: data?.categoryColor || "#607d8b", // Default gray color
    };

    // Use a ref to track if this is the first render
    const isFirstRender = useRef(true);

    useEffect(() => {
      if (isFirstRender.current) {
        console.log("PageNode initial render:", data?.label);
        isFirstRender.current = false;
      }

      // Only reload image if the imageData actually changed
      if (!safeData.imageData) {
        setImageLoaded(false);
        setImageError(true);
        return;
      }

      // Check if we've already tried to load this image
      const imageUrl = safeData.imageData;

      // Preload image to check if it's valid
      const img = new Image();
      img.onload = () => setImageLoaded(true);
      img.onerror = () => setImageError(true);

      // Set the source last to ensure event handlers are registered
      img.src = imageUrl;

      // Clean up the image object on unmount
      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }, [safeData.imageData]);

    return (
      <>
        <Handle
          type="target"
          position={Position.Left}
          onConnect={(params) => console.log("handle onConnect", params)}
          isConnectable={!!isConnectable}
        />
        <div
          className="w-36 p-2 backdrop-blur-md rounded text-white border-gray-600 border-1 flex flex-col items-center justify-between gap-2 transition-all duration-300"
          style={{
            backgroundColor: `${safeData.categoryColor}11`, // Very light background color
            boxShadow: selected
              ? `0 0 0px -10px ${safeData.categoryColor}80, 0 0 15px ${safeData.categoryColor}40` // Strong glow when selected
              : `0 2px 6px ${safeData.categoryColor}33`, // Subtle glow effect with category color
            transform: selected ? "scale(1.05)" : "scale(1)",
            zIndex: selected ? 10 : 1,
            filter: selected ? "brightness(1.3)" : "revert"
          }}
        >
          <div className="text-[10px] font-light px-1 rounded-sm text-white inline-block break-words truncate">
            {(() => {
              try {
                // Try to extract path from URL
                const url = new URL(safeData.label);
                return url.pathname; // Only return the path part
              } catch (e) {
                // If parsing fails, fall back to the original behavior
                return (
                  safeData.label.split("/").slice(3).join("/") ||
                  safeData.category
                );
              }
            })()}
          </div>
          {safeData.imageData && !imageError ? (
            <div className="relative w-full aspect-video">
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <span className="text-xs text-gray-400">Loading...</span>
                </div>
              )}
              <img
                src={safeData.imageData}
                alt="page-screenshot"
                className={`w-full ${imageLoaded ? "block" : "hidden"}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            <div className="w-full aspect-video bg-gray-800 flex items-center justify-center">
              <span className="text-xs text-gray-400">No image</span>
            </div>
          )}
          <p className="break-words overflow-hidden truncate w-24">
            <a
              href={safeData.label}
              className="block text-[8px] break-all"
              target="_blank"
            >
              {safeData.label || "No URL"}
            </a>
          </p>
        </div>
        {safeData.edges.map((edge) => (
          <Handle
            key={edge || `edge-${Math.random().toString(36).substring(7)}`}
            type="source"
            position={Position.Bottom}
            id={edge || `edge-${Math.random().toString(36).substring(7)}`}
            isConnectable={!!isConnectable}
          />
        ))}
      </>
    );
  },
);
