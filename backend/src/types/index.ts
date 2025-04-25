export interface ErrorResponse {
  status: string;
  message: string;
}

export interface ChatMessage {
  text: string;
  timestamp: Date;
  isUser: boolean;
  isPartial?: boolean;
}

export interface ChatResponse {
  message: string;
  timestamp: number;
}

export interface StreamResponse {
  message: string;
  timestamp: number;
  isPartial?: boolean;
  isComplete?: boolean;
  isError?: boolean;
  imageData?: string;
  totalCost?: number;
}

export enum Modes {
  EXPLORE = "explore",
  REGRESSION = "regression",
}

export enum ExploreActionTypes {
  ACTION = "action",
  EXPLORE = "explore",
}
