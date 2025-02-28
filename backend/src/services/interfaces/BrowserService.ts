export interface ActionResult {
  success: boolean;
  screenshot: string;
  error?: string;
}

export interface BrowserService {
  launch(url: string): Promise<ActionResult>;

  click(x: number, y: number): Promise<ActionResult>;

  type(text: string): Promise<ActionResult>;

  scrollUp(): Promise<ActionResult>;

  scrollDown(): Promise<ActionResult>;

  close(): Promise<ActionResult>;
}

export type ActionType =
  | "click"
  | "type"
  | "scroll_up"
  | "scroll_down"
  | "launch"
  | "back"
  | "keyPress";

export interface IPlaywrightAction {
  actionType: ActionType;
  coordinate?: { x: number; y: number };
  text?: string;
  element: IClickableElement | null;
}

export interface IClickableElement {
  type: string;
  tagName: string;
  text?: string;
  placeholder?: string;
  coordinate: { x: number; y: number };
  attributes: { [key in string]: string };
  isVisibleInCurrentViewPort: boolean;
  isVisuallyVisible: boolean;
}

export interface ILLMSuggestedAction {
  actionType: ActionType;
  elementIndex: string;
  text: string;
  toolName: string;
  additionalInfo: string;
  task_status: string;
  question: string;
  genericText: string;
}

export interface IProcessedScreenshot {
  image: string;
  inference: IClickableElement[];
  totalScroll: number;
  scrollPosition: number;
  originalImage: string;
}
