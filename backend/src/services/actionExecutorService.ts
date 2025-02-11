import { ActionRequest, ActionResponse } from '../types/action.types';
import { PuppeteerService } from './implementations/puppeteer/PuppeteerService';
import { DockerVNCService } from './implementations/docker/DockerVNCService';
import { BaseStreamingService } from './base/BaseStreamingService';
import { ServiceConfig } from '../types/stream.types';

class ActionExecutorService {
  private puppeteerService: BaseStreamingService;
  private dockerVNCService: BaseStreamingService;
  private initialized: { [key: string]: boolean } = {
    'chrome-puppeteer': false,
    'ubuntu-docker-vnc': false
  };

  constructor(serviceConfig: ServiceConfig) {
    this.puppeteerService = new PuppeteerService(serviceConfig);
    this.dockerVNCService = new DockerVNCService(serviceConfig);
    // Initialize Docker VNC service immediately since it doesn't need a URL
    this.initializeDockerVNC();
  }

  private async initializeDockerVNC() {
    try {
      // Initialize with empty URL since Docker VNC doesn't need it
      await this.dockerVNCService.initialize('');
      this.initialized['ubuntu-docker-vnc'] = true;
    } catch (error) {
      console.error('Failed to initialize Docker VNC:', error);
    }
  }

  async executeAction(request: ActionRequest): Promise<ActionResponse> {
    try {
      // Get the appropriate service first
      const service = this.getServiceForSource(request.source);

      // Validate source-specific actions
      if (request.source === 'ubuntu-docker-vnc') {
        if (request.action === 'launch' || request.action === 'back') {
          return {
            status: 'error',
            message: `Action '${request.action}' is not supported for Docker VNC source`,
            screenshot: '',
          };
        }
        // Ensure Docker service is initialized
        if (!this.initialized['ubuntu-docker-vnc']) {
          await this.initializeDockerVNC();
        }
      } else if (request.source === 'chrome-puppeteer') {
        if (request.action === 'doubleClick') {
          return {
            status: 'error',
            message: 'Double click action is only supported for Docker VNC source',
            screenshot: '',
          };
        }
        // Handle Puppeteer initialization
        if (request.action === 'launch') {
          if (!request.url) {
            return {
              status: 'error',
              message: 'URL is required for launch action',
              screenshot: '',
            };
          }
          const result = await service.initialize(request.url);
          this.initialized['chrome-puppeteer'] = true;
          return result;
        }
      }
      
      // Route action through the selected service
      return await service.performAction(request.action, {
        url: request.url,
        x: request.coordinate ? parseInt(request.coordinate.split(',')[0]) : undefined,
        y: request.coordinate ? parseInt(request.coordinate.split(',')[1]) : undefined,
        text: request.text,
        key: request.key
      });
    } catch (error) {
      console.error('Action execution error:', error);
      return {
        status: 'error',
        message: 'Action execution failed',
        screenshot: '',
        error: (error as Error).message,
      };
    }
  }

  private getServiceForSource(source: ActionRequest['source']): BaseStreamingService {
    switch (source) {
      case 'chrome-puppeteer':
        return this.puppeteerService;
      case 'ubuntu-docker-vnc':
        return this.dockerVNCService;
      default:
        throw new Error(`Unknown source: ${source}`);
    }
  }
}

// Export the class instead of an instance
export { ActionExecutorService };
