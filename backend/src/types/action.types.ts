import { StreamingSource } from "./stream.types";
import { IClickableElement } from "../services/interfaces/BrowserService";

export interface ActionRequest {
  action: string;
  url?: string;
  coordinate?: string;
  text?: string;
  key?: string;
  source: StreamingSource;
  elements?: IClickableElement[];
  marker?: number;
  params?: Record<string, any>; // Additional parameters for actions
}

export interface OmniParserResult {
  image: string;
  parsed_content: string[];
  label_coordinates: {
    [key: string]: [number, number, number, number];
  };
}

export interface ActionResponse {
  status: "success" | "error";
  message: string;
  screenshot?: string; // Base64 encoded screenshot
  screenshotPath?: string; // Optional path if screenshot was saved
  error?: string;
  omniParserResult?: OmniParserResult;
}
