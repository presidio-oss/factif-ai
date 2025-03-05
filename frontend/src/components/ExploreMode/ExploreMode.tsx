import React from "react";
import { ExploreChat } from "./ExploreChat";
import { Preview } from "../Preview/Preview";
import { Console } from "../Console/Console";
import { Explorer } from "../Explorer/Explorer";
import { ExploreGraph } from "@/components/ExploreMode/ExploreGraph.tsx";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import ErrorBoundary from "../ErrorBoundary/ErrorBoundary";
import { ReactFlowProvider } from "@xyflow/react";

const ExploreMode: React.FC = () => {
  const { showGraph } = useExploreModeContext();
  return (
    <ErrorBoundary>
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Chat */}
        <div className="w-[450px] flex-shrink-0 border-r border-[#2d2d2d]">
          <ExploreChat />
        </div>

        {/* Middle panel - Preview and Console */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {showGraph && (
            <div className="flex-1 min-h-0 overflow-hidden absolute inset-0 bg-white z-20">
              <ReactFlowProvider>
                <ExploreGraph />
              </ReactFlowProvider>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <Preview />
          </div>

          <Console />
        </div>

        {/* Right panel - Explorer */}
        <Explorer />
      </div>
    </ErrorBoundary>
  );
};

export default ExploreMode;
