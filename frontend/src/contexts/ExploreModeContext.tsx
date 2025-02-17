import React, { createContext, useContext, useState } from "react";
import { IExploreGraphData } from "@/types/message.types.ts";

interface ExploreModeContextProps {
  showGraph: boolean;
  setShowGraph: (showGraph: boolean) => void;
  isExploreMode: boolean;
  setIsExploreMode: (isExploreMode: boolean) => void;
  graphData: IExploreGraphData;
  setGraphData: (graphData: IExploreGraphData) => void;
}

const ExploreModeContext = createContext<ExploreModeContextProps | undefined>(
  undefined,
);

export const useExploreModeContext = () => {
  const context = useContext(ExploreModeContext);
  if (!context) {
    throw new Error(
      "useExploreModeContext must be used within a ExploreModeProvider",
    );
  }
  return context;
};

export const ExploreModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [showGraph, setShowGraph] = useState(false);
  const [isExploreMode, setIsExploreMode] = useState(false);
  const [graphData, setGraphData] = useState<IExploreGraphData>({
    nodes: [],
    edges: [],
  });

  const value = {
    showGraph,
    setShowGraph,
    isExploreMode,
    setIsExploreMode,
    graphData,
    setGraphData,
  };
  return (
    <ExploreModeContext.Provider value={value}>
      {children}
    </ExploreModeContext.Provider>
  );
};
