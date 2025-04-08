import { PreviewContentProps } from "./PreviewTypes";

export const PreviewContent = ({
  error,
  screenshot,
  streamingSource,
  interactiveMode,
  handleInteraction,
  previewRef,
  imageRef,
}: PreviewContentProps) => {
  return (
    <div
      ref={previewRef}
      className="h-full flex items-center justify-center overflow-auto"
      onClick={interactiveMode ? handleInteraction : undefined}
      onKeyDown={interactiveMode ? handleInteraction : undefined}
      onMouseMove={interactiveMode ? handleInteraction : undefined}
      onWheel={interactiveMode ? handleInteraction : undefined}
      tabIndex={interactiveMode ? 0 : undefined}
    >
      <div className="text-gray-300 h-full flex items-center justify-center p-4 max-w-full">
        {error ? (
          <div className="text-red-500 text-center">
            <p>Error: {error}</p>
          </div>
        ) : streamingSource === "ubuntu-docker-vnc" ? (
          <div
            className="relative w-[1366px] h-[768px]"
            style={{
              pointerEvents: interactiveMode ? "auto" : "none",
              maxWidth: "100%",
              transformOrigin: "center center",
              transition: "transform 0.3s ease-in-out",
            }}
          >
            <iframe
              src="http://localhost:6080/vnc.html?autoconnect=1&resize=scale&quality=9"
              className="w-full h-full border-0"
              allow="fullscreen"
            />
          </div>
        ) : screenshot ? (
          <div
            className="relative flex items-center justify-center"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            <img
              ref={imageRef}
              src={screenshot}
              alt="Preview"
              width={900}
              height={600}
              className={`object-contain w-full h-full ${interactiveMode ? 'interactive-mode-active' : ''}`}
              style={{
                pointerEvents: interactiveMode ? "auto" : "none",
                cursor: interactiveMode ? "pointer" : "default"
              }}
            />
          </div>
        ) : (
          <div className="text-center">
            <p>No preview available</p>
            <p className="text-sm text-gray-500 mt-2">
              Preview will be available once the streaming starts
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
