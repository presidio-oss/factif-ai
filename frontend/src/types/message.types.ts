import { OmniParserResult } from "@/types/chat.types.ts";

export interface FollowupQuestion {
  type: "followup_question";
  question: string;
  additionalInfo?: string;
}

export interface CompleteTask {
  type: "complete_task";
  result: string;
  command?: string;
}

export interface PerformAction {
  type: "perform_action";
  action: string;
  url?: string;
  coordinate?: string;
  text?: string;
  key?: string;
}

export interface ActionResult {
  type: "action_result";
  status: "success" | "error";
  message: string;
  screenshot?: string;
  omniParserResult: OmniParserResult;
}

export interface ExploreOutput {
  type: "explore_output";
  clickableElements: IExploredClickableElement[];
}

export interface IExploredClickableElement {
  text: string;
  coordinates: string;
  aboutThisElement: string;
}

export type MessagePart =
  | FollowupQuestion
  | CompleteTask
  | PerformAction
  | ActionResult
  | ExploreOutput
  | { type: "text"; content: string };

export interface IProcessedMessagePart {
  length: number;
  part: MessagePart;
}

export interface IExploredNode {
  id: string;
  position: { x: number; y: number };
  data: INodeData;
  type: string;
}

export interface IExploredEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  type: string;
  label: string;
}

export interface INodeData {
  label: string;
  edges: string[];
  imageData?: string;
  imageRef?: string;  // Reference ID for image in ImageStorageService
  imageTimestamp?: number;  // Timestamp when the image was captured
  category?: string;
  categoryDescription?: string;
  categoryColor?: string;
}

export interface IExploreGraphData {
  nodes: IExploredNode[];
  edges: IExploredEdge[];
}

export interface IExploreQueueItem {
  text: string;
  coordinates: string;
  aboutThisElement: string;
  source: string;
  url: string;
  id: string;
  nodeId: string;
  screenshot?: string; // Screenshot of the feature/element for documentation
  parent: {
    id: string;
    url: string;
    nodeId: string;
  };
}

export interface IExploreSessionMeta {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
}

export interface IExploreSession extends IExploreSessionMeta {
  messages: any[];
  graphData: IExploreGraphData;
}
