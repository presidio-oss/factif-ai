import darkLogo from "../../assets/hai-build-dark-logo.png";
import { Link, useLocation } from "react-router-dom";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import { useEffect } from "react";

export const Header = () => {
  const location = useLocation();
  const { showGraph, setShowGraph, setIsExploreMode } = useExploreModeContext();

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

  return (
    <header className="fixed top-0 left-0 right-0 w-full bg-background/95 backdrop-blur-md py-3 shadow-md z-50 transition-all duration-200 border-b border-border/40">
      <div className="px-6 flex items-center">
        <div className="flex items-center gap-3">
          <Link to="/">
            <h2 className="text-xl md:text-2xl text-white font-normal">
              FACTIFAI
            </h2>
          </Link>
        </div>
        <div className="flex-1 flex justify-end items-center">
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
