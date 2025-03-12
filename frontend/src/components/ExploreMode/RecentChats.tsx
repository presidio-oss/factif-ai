import React from "react";
import { Card, CardBody, Button } from "@nextui-org/react";
import { useExploreModeContext } from "@/contexts/ExploreModeContext";
import { useAppContext } from "@/contexts/AppContext";
import { IExploreSessionMeta } from "@/types/message.types";

/**
 * Formats a timestamp for display
 */
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHrs < 24) {
    return `${diffHrs}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

/**
 * Session item component
 */
const SessionItem: React.FC<{
  session: IExploreSessionMeta;
  onSelect: (id: string) => void;
}> = ({ session, onSelect }) => {
  // Validate session ID
  const isValidId = session && session.id && typeof session.id === 'string' && session.id.trim() !== '';
  
  return (
    <Card 
      className={`mb-2 cursor-pointer hover:bg-default-100 transition-colors ${!isValidId ? 'opacity-50' : ''}`}
      onClick={() => {
        if (isValidId) {
          // Ensure it's a string and properly formatted
          const sessionId = session.id.toString().trim();
          console.log("Selected session ID:", sessionId);
          onSelect(sessionId);
        } else {
          console.warn("Cannot load session with invalid ID:", session?.id);
        }
      }}
      isPressable={!!isValidId}
    >
      <CardBody className="py-2 px-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-medium text-foreground">{session.title}</h3>
            <p className="text-sm text-foreground/70 line-clamp-1">{session.preview}</p>
          </div>
          <span className="text-xs text-foreground/50 whitespace-nowrap ml-2">
            {formatTimestamp(session.timestamp)}
          </span>
        </div>
      </CardBody>
    </Card>
  );
};

/**
 * RecentChats component displays a list of recent chat sessions
 */
export const RecentChats: React.FC = () => {
  const { 
    recentSessions, 
    loadSession, 
    setShowRecentChats
  } = useExploreModeContext();
  
  const { setCurrentChatId } = useAppContext();

  const handleNewChat = () => {
    // Generate a new chat ID based on timestamp
    setCurrentChatId(`#${Date.now()}`);
    setShowRecentChats(false);
  };

  const handleSelectSession = (sessionId: string) => {
    // Make sure the sessionId is valid before loading
    if (sessionId && sessionId.trim() !== '') {
      loadSession(sessionId.trim());
    } else {
      console.warn("Attempted to load session with empty ID");
    }
  };

  return (
    <div className="recent-chats-panel bg-background border border-content3 rounded-md shadow-md w-full">
      <div className="p-3 border-b border-content3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-white">Recent Explorations</h2>
          <button
            onClick={() => setShowRecentChats(false)}
            className="text-foreground/50 hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-3 max-h-[300px] overflow-y-auto">
        {recentSessions.length > 0 ? (
          recentSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              onSelect={handleSelectSession}
            />
          ))
        ) : (
          <div className="text-center py-4 text-foreground/60">
            No recent conversations found
          </div>
        )}

        <Button
          color="primary"
          variant="flat"
          className="w-full mt-3"
          onPress={handleNewChat}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Exploration
        </Button>
      </div>
    </div>
  );
};

export default RecentChats;
