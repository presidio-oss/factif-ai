import { ChildProcess } from 'child_process';

export interface ContainerStatus {
  exists: boolean;
  running: boolean;
  id: string | null;
}

export interface DockerCommandOptions {
  command: string[];
  successMessage?: string;
  errorMessage?: string;
}

export interface VNCActionParams {
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  direction?: 'up' | 'down';
  url?: string;  // Added URL parameter for launch action and error handling
}

export interface LogStreams {
  [key: string]: ChildProcess;
}

export interface KeyMap {
  [key: string]: string;
}

export interface DockerConfig {
  containerName: string;
  imageName: string;
  noVNCPort: number;
  vncPort: number;
}
