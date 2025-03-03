import { memo, useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { INodeData } from "@/types/message.types.ts";

export default memo(
  ({ data, isConnectable }: { data: INodeData; isConnectable: boolean }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    
    // Default values for potentially missing data
    const safeData = {
      label: data?.label || "",
      edges: Array.isArray(data?.edges) ? data.edges : [],
      imageData: data?.imageData,
    };

    useEffect(() => {
      console.log("PageNode data:", data);
      
      // Reset image states when data changes
      setImageLoaded(false);
      setImageError(false);
      
      // Validate image data
      if (safeData.imageData) {
        // Preload image to check if it's valid
        const img = new Image();
        img.onload = () => setImageLoaded(true);
        img.onerror = () => setImageError(true);
        img.src = safeData.imageData;
      }
    }, [data, safeData.imageData]);

    return (
      <>
        <Handle
          type="target"
          position={Position.Left}
          onConnect={(params) => console.log("handle onConnect", params)}
          isConnectable={!!isConnectable}
        />
        <div className="w-36 p-2 rounded border border-content3 bg-background/95 text-white">
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
                className={`w-full ${imageLoaded ? 'block' : 'hidden'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            <div className="w-full aspect-video bg-gray-800 flex items-center justify-center">
              <span className="text-xs text-gray-400">No image</span>
            </div>
          )}
          <p className="break-words overflow-hidden">
            <a
              href={safeData.label}
              className="block text-[7px] pt-2"
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
