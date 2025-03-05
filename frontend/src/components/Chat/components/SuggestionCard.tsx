import { TestTypeIcon } from "./TestTypeIcon";
import { SuggestionType } from "./Suggestions"; // Import the SuggestionType from our refactored Suggestions

interface SuggestionCardProps {
  title: string;
  description: string;
  onClick: () => void;
  type: SuggestionType;
}

export const SuggestionCard = ({
  title,
  description,
  onClick,
  type,
}: SuggestionCardProps) => (
  <button
    onClick={onClick}
    className="w-full text-left px-4 py-3 bg-content1 hover:bg-content2 rounded-lg transition-colors border border-content3 group"
  >
    <div className="flex items-center gap-3">
      <TestTypeIcon type={type} />
      <div className="flex-1 min-w-0">
        <h4 className="text-foreground font-medium text-sm mb-0.5 group-hover:text-primary transition-colors">
          {title}
        </h4>
        <p className="text-xs text-foreground-500 line-clamp-2">
          {description}
        </p>
      </div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-foreground-500 group-hover:text-primary transition-colors flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </div>
  </button>
);
