import darkLogo from "../../assets/hai-build-dark-logo.png";
import factifaiLogo from "../../assets/factifai-logo.svg";
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
            <img
              src={factifaiLogo}
              alt="FACTIFAI Logo"
              className="h-5 my-1.5 w-auto translate-y-[1px]"
            />
          </Link>
        </div>
        <div className="flex-1 flex justify-end items-center gap-4">
          <Link 
            to="/secrets" 
            className="text-foreground/70 hover:text-foreground transition-colors px-3 py-1 rounded hover:bg-content2 flex items-center gap-1"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4" 
              viewBox="0 0 20 20" 
              fill="currentColor"
            >
              <path 
                fillRule="evenodd" 
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" 
                clipRule="evenodd" 
              />
            </svg>
            Secrets Manager
          </Link>
          <img src={darkLogo} alt="HAI Build Logo" className="h-6 w-auto" />
        </div>
      </div>
    </header>
  );
};
