import React, { createContext, useContext, useState, useEffect } from "react";
import { StreamingSource } from "@/types/api.types.ts";
import ModeService from "@/services/modeService";

interface AppContextType {
  isChatStreaming: boolean;
  setIsChatStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  hasActiveAction: boolean;
  setHasActiveAction: React.Dispatch<React.SetStateAction<boolean>>;
  folderPath: string;
  setFolderPath: React.Dispatch<React.SetStateAction<string>>;
  currentChatId: string;
  setCurrentChatId: React.Dispatch<React.SetStateAction<string>>;
  streamingSource: StreamingSource;
  setStreamingSource: React.Dispatch<React.SetStateAction<StreamingSource>>;
  saveScreenshots: boolean;
  setSaveScreenshots: React.Dispatch<React.SetStateAction<boolean>>;
  stopCurrentStreaming: boolean;
  setStopCurrentStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  isExplorerCollapsed: boolean;
  setIsExplorerCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setMode: React.Dispatch<React.SetStateAction<string>>;
  setType: React.Dispatch<React.SetStateAction<string>>;
  mode: string;
  type: string;
  switchMode: (newMode: "explore" | "regression") => Promise<void>;
  cost: number;
  setCost: React.Dispatch<React.SetStateAction<number>>;
  secrets: {}
  setSecrets: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [hasActiveAction, setHasActiveAction] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [currentChatId, setCurrentChatId] = useState("");
  const [streamingSource, setStreamingSource] =
    useState<StreamingSource>("chrome-puppeteer");
  const [saveScreenshots, setSaveScreenshots] = useState(false);
  const [stopCurrentStreaming, setStopCurrentStreaming] = useState(false);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [mode, setMode] = useState<string>("explore");
  const [type, setType] = useState<string>("action");
  const [cost, setCost] = useState<number>(0);
  const [secrets, setSecrets] = useState<Record<string, string>>(loadSecretIfAny());


  // Initialize with proper backend mode
  useEffect(() => {
    const initializeMode = async () => {
      try {
        // Check if we need to reset the backend mode
        await ModeService.resetContext(mode as "explore" | "regression");
        console.log(`Mode initialized to: ${mode}`);
      } catch (error) {
        console.error("Failed to initialize mode:", error);
      }
    };
    
    initializeMode();
  }, []); // Only run once on component mount


  const switchMode = async (newMode: "explore" | "regression") => {
    if (isChatStreaming) {
      console.warn("Cannot switch mode while streaming is in progress");
      return;
    }
    
    try {
      setHasActiveAction(true);
      // Reset context to prevent contamination
      await ModeService.resetContext(newMode);
      
      // Update local state
      setMode(newMode);
      setType(newMode); // Also update type to match the mode
      console.log(`Successfully switched to ${newMode} mode`);
    } catch (error) {
      console.error("Failed to switch mode:", error);
    } finally {
      setHasActiveAction(false);
    }
  };

  const value = {
    isChatStreaming,
    setIsChatStreaming,
    hasActiveAction,
    setHasActiveAction,
    folderPath,
    setFolderPath,
    currentChatId,
    setCurrentChatId,
    streamingSource,
    setStreamingSource,
    saveScreenshots,
    setSaveScreenshots,
    stopCurrentStreaming,
    setStopCurrentStreaming,
    isExplorerCollapsed,
    setIsExplorerCollapsed,
    mode,
    setMode,
    type,
    setType,
    switchMode,
    setCost,
    cost,
    setSecrets,
    secrets,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

const loadSecretIfAny = () => {
  let secrets: Record<string, string> = {}
  try {
    const items = localStorage.getItem("APP_SECRET");
    if (items) {
      secrets = JSON.parse(atob(items)) as Record<string, string>;
    }
  } catch (e) {
  }
  return secrets;
}
