import darkLogo from "../../assets/hai-build-dark-logo.png";
import factifaiLogo from "../../assets/factifai-logo.svg";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@nextui-org/react";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import { useAppContext } from "@/contexts/AppContext.tsx";
import { useEffect } from "react";

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showGraph, setShowGraph, setIsExploreMode } = useExploreModeContext();
  const { switchMode, isChatStreaming, hasActiveAction } = useAppContext();

  useEffect(() => {
    // Update explore mode status when route changes
    if (location.pathname === "/explore-mode") {
      setIsExploreMode(true);
    } else {
      setIsExploreMode(false);
      // Reset graph view when navigating away from explore mode
      if (showGraph) {
        setShowGraph(false);
      }
    }
  }, [location.pathname, setIsExploreMode, showGraph, setShowGraph]);

  const handleModeSwitch = async (targetMode: "explore" | "regression") => {
    if (isChatStreaming || hasActiveAction) return;
    
    try {
      // Perform backend context reset via the mode service
      await switchMode(targetMode);
      
      // Navigate to appropriate route
      navigate(targetMode === "explore" ? "/explore-mode" : "/");
    } catch (error) {
      console.error("Failed to switch mode:", error);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 w-full bg-background/95 backdrop-blur-md py-3 shadow-md z-50 transition-all duration-200 border-b border-border/40">
      <div className="px-6 flex items-center">
        <div className="flex items-center gap-3">
          <Link to="/">
            <img
              src={factifaiLogo}
              alt="FACTIFAI Logo"
              className="h-8 w-auto"
            />
          </Link>
        </div>
        <div className="flex-1 flex justify-end items-center gap-4">
          {/* Mode switch button */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              color={location.pathname !== "/explore-mode" ? "primary" : "default"}
              variant="flat"
              isDisabled={isChatStreaming || hasActiveAction || location.pathname !== "/explore-mode"}
              onClick={() => handleModeSwitch("regression")}
              className="text-xs"
            >
              Normal
            </Button>
            <Button
              size="sm"
              color={location.pathname === "/explore-mode" ? "primary" : "default"}
              variant="flat"
              isDisabled={isChatStreaming || hasActiveAction || location.pathname === "/explore-mode"}
              onClick={() => handleModeSwitch("explore")}
              className="text-xs"
            >
              Explore
            </Button>
            {(isChatStreaming || hasActiveAction) && (
              <span className="text-xs text-warning ml-1">
                Wait...
              </span>
            )}
          </div>
          <img
            src={darkLogo}
            alt="HAI Build Logo"
            className="h-6 w-auto"
          />
        </div>
      </div>
    </header>
  );
};
