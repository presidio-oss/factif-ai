import { useState, useEffect, useRef } from 'react';
import UIInteractionService from '../../services/uiInteractionService';
import SocketService from '../../services/socketService';
import consoleService from '../../services/consoleService';
import { useAppContext } from '../../contexts/AppContext';
import { StreamingSource } from '@/types/api.types';

export const usePreview = () => {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [urlHistory, setUrlHistory] = useState<string[]>(['']);
  const [urlInput, setUrlInput] = useState<string>('');
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { streamingSource, setStreamingSource } = useAppContext();

  const handleSourceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSource = event.target.value as StreamingSource;
    setStreamingSource(newSource);
    SocketService.getInstance().setSource(newSource);
    consoleService.getInstance().emitConsoleEvent('info', `Streaming source changed to: ${newSource}`);
    setScreenshot(null);
    
    if (newSource === 'chrome-puppeteer') {
      // UIInteractionService.getInstance().handleSourceChange(newSource, currentUrl);
    } else {
      const socketService = SocketService.getInstance();
      socketService.connect();
      socketService.emit('start-stream', { source: 'ubuntu-docker-vnc' });
    }
  };

  const handleInteractiveModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setInteractiveMode(enabled);
    if (streamingSource === 'chrome-puppeteer') {
      UIInteractionService.getInstance().setInteractiveMode(enabled);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim() && streamingSource === 'chrome-puppeteer') {
      const formattedUrl = urlInput.startsWith('http') ? urlInput : `https://${urlInput}`;
      setCurrentUrl(formattedUrl);
      setUrlHistory(prev => [...prev, formattedUrl]);
      const browserService = UIInteractionService.getInstance();
      browserService.handleSourceChange(streamingSource, formattedUrl);
    }
  };

  const handleBackNavigation = async () => {
    if (urlHistory.length > 1 && streamingSource === 'chrome-puppeteer') {
      // Use the browser's native back functionality instead of restarting the browser
      try {
        const browserService = UIInteractionService.getInstance();
        
        // Call the new back navigation method
        await browserService.handleBackNavigation();
        
        // We'll update the URL and history from the URL change event, but prepare
        // our local state in case the event doesn't arrive
        const newHistory = [...urlHistory];
        newHistory.pop();
        const previousUrl = newHistory[newHistory.length - 1];
        
        // Set placeholder values in case the URL change event doesn't update them
        setCurrentUrl(previousUrl);
        setUrlInput(previousUrl);
        setUrlHistory(newHistory);
      } catch (error) {
        console.error("Failed to navigate back:", error);
        consoleService.getInstance().emitConsoleEvent('error', `Back navigation failed: ${error}`);
      }
    }
  };

  const handleInteraction = (event: React.MouseEvent | React.KeyboardEvent | WheelEvent) => {
    if (!interactiveMode || !previewRef.current || !imageRef.current || streamingSource !== 'chrome-puppeteer') return;

    if ('nativeEvent' in event && event.nativeEvent instanceof MouseEvent) {
      // For mousemove events, use handleHoverInteraction
      if (event.type === 'mousemove') {
        UIInteractionService.getInstance().handleHoverInteraction(
          event as React.MouseEvent,
          imageRef.current
        );
      } else {
        UIInteractionService.getInstance().handleMouseInteraction(
          event as React.MouseEvent,
          imageRef.current
        );
      }
    } else if ('nativeEvent' in event && event.nativeEvent instanceof KeyboardEvent) {
      UIInteractionService.getInstance().handleKeyboardInteraction(
        event as React.KeyboardEvent
      );
    } else if (event instanceof WheelEvent) {
      UIInteractionService.getInstance().handleScrollInteraction(event);
    }
  };

  // FIXME Clean up the useEffects

  useEffect(() => {
    if (streamingSource === 'chrome-puppeteer') {
      const browserService = UIInteractionService.getInstance();
      
      browserService.initialize(
        (base64Image: string) => {
          setScreenshot(base64Image ? `data:image/jpeg;base64,${base64Image}` : null);
        },
        (newStatus: string) => {
          setStatus(newStatus);
        },
        (newError: string | null) => {
          setError(newError);
        },
        streamingSource
      );

      browserService.setInteractiveMode(interactiveMode);

      return () => {
        browserService.cleanup();
      };
    } else {
      const socketService = SocketService.getInstance();
      const socket = socketService.connect();

      socket.on('browser-started', () => {
        setStatus('VNC Connected');
        setError(null);
      });

      socket.on('browser-error', ({ message }: { message: string }) => {
        setStatus('VNC Error');
        setError(message);
      });

      socket.on('screenshot-snapshot', (base64Image: string) => {
        setScreenshot(`data:image/jpeg;base64,${base64Image}`);
      });

      // socketService.emit('start-stream', { source: 'ubuntu-docker-vnc' });

      return () => {
        socket.off('browser-started');
        socket.off('browser-error');
        socket.off('screenshot-snapshot');
      };
    }
  }, [streamingSource]);

  useEffect(() => {
    if (streamingSource === 'chrome-puppeteer') {
      const browserService = UIInteractionService.getInstance();
      
      const unsubscribe = browserService.onUrlChange((newUrl: string) => {
        // Ensure we're getting the complete URL including path and query params
        setCurrentUrl(newUrl);
        setUrlInput(newUrl);
        
        // Only add to history if it's a new URL to avoid duplicates
        setUrlHistory(prev => {
          // Don't add duplicate URLs to history
          const lastUrl = prev[prev.length - 1];
          if (lastUrl !== newUrl) {
            return [...prev, newUrl];
          }
          return prev;
        });
      });

      return () => {
        unsubscribe();
      };
    }
  }, [streamingSource]);

  useEffect(() => {
    if (!previewRef.current || !interactiveMode || streamingSource !== 'chrome-puppeteer') return;

    const element = previewRef.current;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleInteraction(e);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [interactiveMode, streamingSource]);

  return {
    screenshot,
    error,
    status,
    streamingSource,
    interactiveMode,
    currentUrl,
    urlHistory,
    urlInput,
    previewRef,
    imageRef,
    handleSourceChange,
    handleInteractiveModeChange,
    handleUrlSubmit,
    handleBackNavigation,
    handleInteraction,
    setUrlInput
  };
};
