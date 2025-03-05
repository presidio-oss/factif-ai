import darkLogo from "../../assets/hai-build-dark-logo.png";
import { Link, useLocation } from "react-router-dom";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import { useAppContext } from "@/contexts/AppContext.tsx";
import { useEffect } from "react";
import { Tooltip } from "@nextui-org/react";

export const Header = () => {
  const location = useLocation();
  const { showGraph, setShowGraph, setIsExploreMode, isExploreMode } =
    useExploreModeContext();
  const { isChatStreaming } = useAppContext();

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
              FACTIF AI
            </h2>
          </Link>
        </div>
        <div className="flex-1 flex justify-end items-center gap-6">
          <nav className="flex items-center gap-6">
            {isChatStreaming ? (
              <Tooltip 
                content="Navigation is disabled during active chat" 
                placement="bottom"
                color="warning"
              >
                <span
                  className={`text-sm font-medium text-gray-500 opacity-60 cursor-not-allowed`}
                >
                  Home
                </span>
              </Tooltip>
            ) : (
              <Link
                to="/"
                className={`text-sm font-medium transition-colors hover:text-white ${
                  location.pathname === "/" ? "text-white" : "text-gray-400"
                }`}
              >
                Home
              </Link>
            )}
            
            {isChatStreaming ? (
              <Tooltip 
                content="Navigation is disabled during active chat" 
                placement="bottom"
                color="warning"
              >
                <span
                  className={`text-sm font-medium text-gray-500 opacity-60 cursor-not-allowed`}
                >
                  Explore Mode
                </span>
              </Tooltip>
            ) : (
              <Link
                to="/explore-mode"
                className={`text-sm font-medium transition-colors hover:text-white ${
                  location.pathname === "/explore-mode"
                    ? "text-white"
                    : "text-gray-400"
                }`}
              >
                Explore Mode
              </Link>
            )}
            
            {isExploreMode && (
              <span
                className={`text-sm cursor-pointer font-medium transition-colors hover:text-white ${
                  showGraph ? "text-white" : "text-gray-400"
                }`}
                onClick={() => setShowGraph(!showGraph)}
              >
                {showGraph ? "Show browser" : "Show graph"}
              </span>
            )}
          </nav>
          <img
            src={darkLogo}
            alt="HAI Build Logo"
            className="h-6 w-auto ml-6"
          />
        </div>
      </div>
    </header>
  );
};
