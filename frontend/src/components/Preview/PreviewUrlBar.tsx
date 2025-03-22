import { PreviewUrlBarProps } from './PreviewTypes';
import { useEffect, useState } from 'react';

export const PreviewUrlBar = ({
  urlInput,
  urlHistory,
  onUrlSubmit,
  onUrlInputChange,
  onBackNavigation
}: PreviewUrlBarProps) => {
  // Track whether the input is currently focused to prevent overriding user edits
  const [isFocused, setIsFocused] = useState(false);

  // Use the most recent URL from urlHistory as display URL when not focused
  const displayUrl = urlHistory.length > 0 ? urlHistory[urlHistory.length - 1] : urlInput;

  return (
    <div className="flex items-center gap-2 px-2 py-2 bg-content1 border-b border-content3">
      <button
        onClick={onBackNavigation}
        disabled={urlHistory.length <= 1}
        className="w-8 h-8 flex items-center justify-center rounded-full text-foreground/60 hover:bg-content2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <form onSubmit={onUrlSubmit} className="flex-1 flex items-center">
        <div className="flex-1 relative flex items-center">
          <div className="absolute left-3 text-foreground/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={isFocused ? urlInput : displayUrl}
            onChange={(e) => onUrlInputChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="w-full bg-content2 text-foreground rounded-full pl-10 pr-4 py-1.5 text-sm outline-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            placeholder="Enter URL"
          />
        </div>
        <button
          type="submit"
          className="ml-2 w-8 h-8 flex items-center justify-center rounded-full text-foreground/60 hover:bg-content2 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 5l7 7m0 0l-7 7m7-7H3"
            />
          </svg>
        </button>
      </form>
    </div>
  );
};
