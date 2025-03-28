import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Chip,
  Divider,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tooltip,
} from "@nextui-org/react";
import { useExploreModeContext } from "@/contexts/ExploreModeContext";
import { useAppContext } from "@/contexts/AppContext";
import { IExploreSessionMeta } from "@/types/message.types";

// Icons
const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-default-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const CloseIcon = () => (
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
);

const PlusIcon = () => (
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
);

const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 mr-1 text-default-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const GlobeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 mr-1 text-primary-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const EmptyStateIllustration = () => (
  <svg
    width="120"
    height="120"
    viewBox="0 0 400 300"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      opacity="0.2"
      d="M138.5 136.83C147.5 116.83 152 73.33 203.5 71.33C255 69.33 279.5 107.33 286.5 124.33C293.5 141.33 285.5 207.33 236 210.83C186.5 214.33 162.5 197.83 152.5 179.83C142.5 161.83 129.5 156.83 138.5 136.83Z"
      fill="#6366f1"
    />
    <path
      d="M217.641 111.234H133.359C131.252 111.234 129.547 112.94 129.547 115.047V184.953C129.547 187.06 131.252 188.766 133.359 188.766H217.641C219.748 188.766 221.453 187.06 221.453 184.953V115.047C221.453 112.94 219.748 111.234 217.641 111.234Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M217.641 111.234H133.359C131.252 111.234 129.547 112.94 129.547 115.047V130.656H221.453V115.047C221.453 112.94 219.748 111.234 217.641 111.234Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M141.797 123.438C143.35 123.438 144.609 122.178 144.609 120.625C144.609 119.072 143.35 117.812 141.797 117.812C140.244 117.812 138.984 119.072 138.984 120.625C138.984 122.178 140.244 123.438 141.797 123.438Z"
      fill="#6366f1"
    />
    <path
      d="M151.328 123.438C152.881 123.438 154.141 122.178 154.141 120.625C154.141 119.072 152.881 117.812 151.328 117.812C149.775 117.812 148.516 119.072 148.516 120.625C148.516 122.178 149.775 123.438 151.328 123.438Z"
      fill="#6366f1"
    />
    <path
      d="M160.859 123.438C162.412 123.438 163.672 122.178 163.672 120.625C163.672 119.072 162.412 117.812 160.859 117.812C159.306 117.812 158.047 119.072 158.047 120.625C158.047 122.178 159.306 123.438 160.859 123.438Z"
      fill="#6366f1"
    />
    <path
      d="M160.859 138.094H147.516V142H160.859V138.094Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M196.766 138.094H169.297V142H196.766V138.094Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M160.859 152.75H147.516V156.656H160.859V152.75Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M196.766 152.75H169.297V156.656H196.766V152.75Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M160.859 167.406H147.516V171.312H160.859V167.406Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
    <path
      d="M196.766 167.406H169.297V171.312H196.766V167.406Z"
      stroke="#1F2937"
      strokeWidth="2"
    />
  </svg>
);

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
 * Groups sessions by date category
 */
const groupSessionsByDate = (sessions: IExploreSessionMeta[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return sessions.reduce(
    (groups, session) => {
      const sessionDate = new Date(session.timestamp);

      if (sessionDate >= today) {
        groups.today.push(session);
      } else if (sessionDate >= yesterday) {
        groups.yesterday.push(session);
      } else {
        groups.older.push(session);
      }

      return groups;
    },
    { today: [], yesterday: [], older: [] } as Record<
      string,
      IExploreSessionMeta[]
    >,
  );
};

/**
 * Session item component
 */
const SessionItem: React.FC<{
  session: IExploreSessionMeta;
  onSelect: (id: string) => void;
}> = ({ session, onSelect }) => {
  // Validate session ID
  const isValidId =
    session &&
    session.id &&
    typeof session.id === "string" &&
    session.id.trim() !== "";

  // Extract domain from title if it looks like a URL
  const extractedDomain =
    session.title.match(/([a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,})/i)?.[0] ||
    null;

  return (
    <Card
      className={`mb-2 cursor-pointer hover:bg-default-100 transition-all duration-150 ${!isValidId ? "opacity-50" : ""}`}
      onClick={() => {
        if (isValidId) {
          const sessionId = session.id.toString().trim();
          console.log("Selected session ID:", sessionId);
          onSelect(sessionId);
        } else {
          console.warn("Cannot load session with invalid ID:", session?.id);
        }
      }}
      isPressable={!!isValidId}
      shadow="sm"
    >
      <CardBody className="py-2 px-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center">
              {extractedDomain ? (
                <Tooltip content={`Domain: ${extractedDomain}`}>
                  <span className="mr-2">
                    <GlobeIcon />
                  </span>
                </Tooltip>
              ) : (
                <span className="mr-2">
                  <ClockIcon />
                </span>
              )}
              <h3 className="font-medium text-foreground line-clamp-1">
                {session.title}
              </h3>
            </div>
            <p className="text-sm text-foreground/70 line-clamp-1 ml-6">
              {session.preview}
            </p>
          </div>
          <Chip
            size="sm"
            color={isWithinHours(session.timestamp, 1) ? "success" : "default"}
            variant="flat"
            className="ml-2 px-1 h-6 min-w-[60px] text-center"
          >
            {formatTimestamp(session.timestamp)}
          </Chip>
        </div>
      </CardBody>
    </Card>
  );
};

// Helper to check if timestamp is within X hours
const isWithinHours = (timestamp: string, hours: number): boolean => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs < hours * 60 * 60 * 1000;
};

/**
 * RecentChats component displays a list of recent chat sessions
 */
interface RecentChatsProps {
  clearChat?: () => void;
}

export const RecentChats: React.FC<RecentChatsProps> = ({ clearChat }) => {
  const { recentSessions, loadSession, setShowRecentChats } =
    useExploreModeContext();

  const { setCurrentChatId } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "today" | "yesterday" | "older"
  >("all");
  const [isClosing, setIsClosing] = useState(false);

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery && filterType === "all") {
      return recentSessions;
    }

    let filtered = [...recentSessions];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (session) =>
          session.title.toLowerCase().includes(query) ||
          session.preview.toLowerCase().includes(query),
      );
    }

    // Apply type filter
    if (filterType === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter(
        (session) => new Date(session.timestamp) >= today,
      );
    } else if (filterType === "yesterday") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      filtered = filtered.filter((session) => {
        const sessionDate = new Date(session.timestamp);
        return sessionDate >= yesterday && sessionDate < today;
      });
    } else if (filterType === "older") {
      const yesterday = new Date();
      yesterday.setHours(0, 0, 0, 0);
      yesterday.setDate(yesterday.getDate() - 1);
      filtered = filtered.filter(
        (session) => new Date(session.timestamp) < yesterday,
      );
    }

    return filtered;
  }, [recentSessions, searchQuery, filterType]);

  // Group sessions by date
  const groupedSessions = useMemo(() => {
    return groupSessionsByDate(filteredSessions);
  }, [filteredSessions]);

  const handleNewChat = () => {
    // Generate a new chat ID based on timestamp
    setCurrentChatId(`#${Date.now()}`);

    // Clear the chat if the clearChat function is provided
    if (clearChat) {
      clearChat();
    }

    handleClose();
  };

  const handleSelectSession = (sessionId: string) => {
    // Make sure the sessionId is valid before loading
    if (sessionId && sessionId.trim() !== "") {
      loadSession(sessionId.trim());
    } else {
      console.warn("Attempted to load session with empty ID");
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    // Apply closing animation then hide
    setTimeout(() => {
      setShowRecentChats(false);
      setIsClosing(false);
    }, 200);
  };

  // Animation classes
  const animationClasses = isClosing
    ? "opacity-0 scale-95 translate-y-2"
    : "opacity-100 scale-100 translate-y-0";

  return (
    <>
      {/* Backdrop overlay for better separation */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={handleClose}
      />

      {/* Modal container with vertical and horizontal centering */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className={`recent-chats-panel bg-background border-2 border-content3/80 rounded-xl
            shadow-2xl max-w-[600px] w-full max-h-[90vh] transition-all duration-300
            ${animationClasses}`}
        >
          <div className="p-4 border-b border-content3">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold text-white flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Recent Explorations
              </h2>
              <button
                onClick={handleClose}
                className="text-foreground/50 hover:text-foreground rounded-full p-1 hover:bg-content2 transition-colors"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex gap-2 items-center">
              <Input
                classNames={{
                  base: "max-w-full h-9",
                  inputWrapper: "h-9",
                  input: "text-foreground",
                }}
                placeholder="Search explorations..."
                size="sm"
                startContent={<SearchIcon />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                variant="bordered"
                isClearable
                color="primary"
              />

              <Dropdown>
                <DropdownTrigger>
                  <Button
                    variant="flat"
                    size="sm"
                    className="min-w-0 px-3 h-9 text-white"
                  >
                    {filterType === "all" ? "All" : filterType}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu 
                  aria-label="Filter options"
                  onAction={(key) => setFilterType(key as any)}
                  selectedKeys={[filterType]}
                  selectionMode="single"
                  className="bg-background/90 backdrop-blur-md text-white"
                  variant="flat"
                >
                  <DropdownItem key="all" className="text-white">All</DropdownItem>
                  <DropdownItem key="today" className="text-white">Today</DropdownItem>
                  <DropdownItem key="yesterday" className="text-white">Yesterday</DropdownItem>
                  <DropdownItem key="older" className="text-white">Older than 2 days</DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>

          <div className="p-4 max-h-[400px] overflow-y-auto">
            {filteredSessions.length > 0 ? (
              <div className="space-y-4">
                {groupedSessions.today.length > 0 && (
                  <div>
                    <div className="flex items-center mb-2">
                      <Chip color="primary" variant="flat" size="sm">
                        Today
                      </Chip>
                      <div className="ml-2 h-[1px] flex-grow bg-content3"></div>
                    </div>
                    {groupedSessions.today.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        onSelect={handleSelectSession}
                      />
                    ))}
                  </div>
                )}

                {groupedSessions.yesterday.length > 0 && (
                  <div>
                    <div className="flex items-center mb-2">
                      <Chip color="secondary" variant="flat" size="sm">
                        Yesterday
                      </Chip>
                      <div className="ml-2 h-[1px] flex-grow bg-content3"></div>
                    </div>
                    {groupedSessions.yesterday.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        onSelect={handleSelectSession}
                      />
                    ))}
                  </div>
                )}

                {groupedSessions.older.length > 0 && (
                  <div>
                    <div className="flex items-center mb-2">
                      <Chip color="default" variant="flat" size="sm">
                        Older
                      </Chip>
                      <div className="ml-2 h-[1px] flex-grow bg-content3"></div>
                    </div>
                    {groupedSessions.older.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        onSelect={handleSelectSession}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : searchQuery ? (
              <div className="text-center py-6 text-foreground/60 flex flex-col items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 mb-2 text-default-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <p>No matching explorations found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            ) : (
              <div className="text-center py-6 text-foreground/60 flex flex-col items-center justify-center">
                <div className="mb-3">
                  <EmptyStateIllustration />
                </div>
                <p className="mb-1 text-foreground/80 font-medium">
                  No exploration history yet
                </p>
                <p className="text-sm mb-3">
                  Start a new exploration to see it here
                </p>
              </div>
            )}

            <Divider className="my-3" />

            <Button
              color="primary"
              className="w-full"
              startContent={<PlusIcon />}
              onPress={handleNewChat}
            >
              New Exploration
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default RecentChats;
