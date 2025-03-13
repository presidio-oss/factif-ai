import { PreviewHeaderProps } from "./PreviewTypes";
import { Checkbox, Button } from "@nextui-org/react";
import { useState, useRef, useEffect } from "react";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";

// FloatingGraphToggle component moved from ExploreMode
const FloatingGraphToggle: React.FC = () => {
  const { showGraph, setShowGraph } = useExploreModeContext();

  return (
    <Button
      size="sm"
      color="primary"
      variant="flat"
      isIconOnly
      onPress={() => setShowGraph(!showGraph)}
      className="h-8 w-8 min-w-0"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        viewBox="0 0 24 24"
      >
        <g>
          <path fill="none" d="M0 0H24V24H0z" />
          <path
            fill="currentColor"
            d="M10 2c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1H8v2h5V9c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1h-6c-.552 0-1-.448-1-1v-1H8v6h5v-1c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1h-6c-.552 0-1-.448-1-1v-1H7c-.552 0-1-.448-1-1V8H4c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6zm9 16h-4v2h4v-2zm0-8h-4v2h4v-2zM9 4H5v2h4V4z"
          />
        </g>
      </svg>
    </Button>
  );
};

export const PreviewHeader = ({
  streamingSource,
  interactiveMode,
  status,
  onSourceChange,
  onInteractiveModeChange,
}: PreviewHeaderProps) => {
  const { isExploreMode } = useExploreModeContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const options = [
    { value: "chrome-puppeteer", label: "Chrome - Puppeteer" },
    { value: "ubuntu-docker-vnc", label: "Ubuntu Docker - VNC" },
  ];

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) =>
            prev < options.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          if (focusedIndex >= 0) {
            handleOptionClick(options[focusedIndex].value);
          }
          break;
        case "Escape":
          setIsOpen(false);
          break;
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, focusedIndex, options]);

  const handleOptionClick = (value: string) => {
    onSourceChange({ target: { value } } as any);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center justify-between px-5 min-h-[72px] bg-background border-b border-content3">
      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="true"
            aria-expanded={isOpen}
            aria-controls="preview-type-menu"
            className="flex items-center gap-2 w-48 px-3 py-2 text-sm rounded-lg bg-content2/50 hover:bg-content2 text-warning transition-all duration-200 focus:outline-none outline-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span className="flex-1 truncate text-left">
              {streamingSource === "chrome-puppeteer"
                ? "Preview - Chrome"
                : "Preview - Ubuntu"}
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {isOpen && (
            <div
              id="preview-type-menu"
              role="menu"
              aria-orientation="vertical"
              className={`absolute z-50 w-full mt-2 bg-background/95 backdrop-blur-sm border border-content3 rounded-lg shadow-lg ring-1 ring-black/5 transform transition-all duration-200 origin-top
                ${isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2"}`}
            >
              <div>
                {options.map((option, index) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick(option.value)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    role="menuitem"
                    tabIndex={focusedIndex === index ? 0 : -1}
                    className={`flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground transition-colors duration-150 justify-between
                      ${
                        streamingSource === option.value
                          ? "bg-content2/60 hover:bg-content2/70"
                          : focusedIndex === index
                            ? "bg-content2/40"
                            : "hover:bg-content2/40"
                      }
                      ${index === 0 ? "rounded-t-lg" : ""}
                      ${index === options.length - 1 ? "rounded-b-lg" : ""}
                      focus:outline-none focus:bg-content2/50`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          option.value === "chrome-puppeteer"
                            ? "M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                            : "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        }
                      />
                    </svg>
                    <span className="flex-1 truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-foreground/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
            />
          </svg>
          <Checkbox
            isSelected={interactiveMode}
            onValueChange={(isSelected) => {
              const syntheticEvent = {
                target: { checked: isSelected },
              } as React.ChangeEvent<HTMLInputElement>;
              onInteractiveModeChange(syntheticEvent);
            }}
            color="primary"
            size="sm"
            classNames={{
              label: "text-foreground/90",
            }}
          >
            Interactive Mode
          </Checkbox>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              status === "VNC Connected" ||
              status === "Browser initialized" ||
              status === "Streaming..."
                ? "bg-success"
                : status === "VNC Error" ||
                    status === "Browser error" ||
                    status === "Connection error" ||
                    status === "Browser stopped" ||
                    status === "Disconnected from server"
                  ? "bg-danger"
                  : "bg-warning"
            }`}
          ></div>
          <p className="text-foreground/60 text-sm">
            {status === "Browser initialized" ? "Connected to server" : status}
          </p>
        </div>
        {/* Only show FloatingGraphToggle when in explore mode */}
        {isExploreMode && <FloatingGraphToggle />}
      </div>
    </div>
  );
};
