import { Divider } from "@nextui-org/react";
import { SuggestionCard } from "./SuggestionCard";

// Define types for suggestion data
export type SuggestionType =
  | "explore"
  | "ecommerce"
  | "banking"
  | "content"
  | string;

export interface Suggestion {
  type: SuggestionType;
  title: string;
  description: string;
  prompt: string;
}

interface SuggestionsProps {
  onSendMessage: (message: string, sendToBackend?: boolean) => void;
  suggestions?: Suggestion[];
  title?: string;
  footerText?: string;
}

export const Suggestions = ({
  onSendMessage,
  suggestions = defaultSuggestions,
  title = "What would you like to test?",
  footerText = "or type your own test case",
}: SuggestionsProps) => {
  return (
    <div className="w-full max-w-xl">
      <h3 className="text-lg font-normal text-foreground mb-6 text-center">
        {title}
      </h3>
      <div className="flex flex-col gap-2 mb-6 px-4">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={index}
            type={suggestion.type}
            title={suggestion.title}
            description={suggestion.description}
            onClick={() => onSendMessage(suggestion.prompt)}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Divider className="flex-1 bg-gradient-to-r from-app-blue/20 to-app-blue/10" />
        <span className="text-sm text-foreground-500">{footerText}</span>
        <Divider className="flex-1 bg-gradient-to-r from-app-blue/10 to-app-blue/20" />
      </div>
    </div>
  );
};

export const defaultSuggestions: Suggestion[] = [
  {
    type: "ecommerce",
    title: "Product Checkout",
    description: "Test and validate a complete purchase flow on Saucedemo.com",
    prompt:
      "Test and validate a complete purchase flow on Saucedemo.com\n\n" +
      "* Step 1. Enter the Saucedemo.com website URL\n" +
      "* Step 2. Load Saucedemo.com website\n" +
      "* Step 3. Click the username input field\n" +
      "* Step 4. Enter standard_user username for login\n" +
      "* Step 5. Click the password input field\n" +
      "* Step 6. Enter the standard password for login \n" +
      "* Step 7. Click the Login button to submit credentials \n" +
      "* Step 8. Add multiple products to cart & Ensure cart has at least 2 items\n" +
      "* Step 9. Click the shopping cart icon to view cart and proceed to checkout\n" +
      "* Step 10. Click the Checkout button to begin checkout process\n" +
      "* Step 11. Click the First Name input field\n" +
      "* Step 12. Enter first name in checkout form\n" +
      "* Step 13. Click the Last Name input field\n" +
      "* Step 14. Enter last name in checkout form\n" +
      "* Step 15. Click the Zip/Postal Code input field\n" +
      "* Step 16. Enter zip code in checkout form\n" +
      "* Step 17. Scroll down to reveal the Continue button at bottom of checkout form\n" +
      "* Step 18. Scroll down to reveal the Finish button at bottom\n" +
      "* Step 19. Click the green Finish button to complete the purchase",
  },
  {
    type: "banking",
    title: "Banking Application",
    description:
      "Test user registration and login flow on ParaBank. Validate account creation, form submission, and secure authentication process.",
    prompt:
      "Test user registration and login flow on ParaBank demo site\n" +
      "* Step 1. Navigate to https://parabank.parasoft.com/\n" +
      "* Step 2. Click on the register link to create a new account\n" +
      "* Step 3. Scroll down to see the full registration form\n" +
      "* Step 4. Fill in the form with random data and submit the form\n" +
      "* Step 5. On successful account creation, login to the account using the same credentials\n" +
      "* Step 6. Check whether the login was successful or not",
  },
  {
    type: "content",
    title: "Content Navigation",
    description: "Test search and navigation functionality on Wikipedia.org",
    prompt:
      "Test search and navigation functionality on Wikipedia.org\n" +
      "* Step 1. Navigate to https://www.wikipedia.org/\n" +
      "* Step 2. Click on the search input field\n" +
      '* Step 3. Type "Artificial Intelligence" in the search box\n' +
      "* Step 4. Click the search button or press Enter\n" +
      "* Step 5. Verify the search results page loads\n" +
      '* Step 6. Click on the main "Artificial Intelligence" article link\n' +
      "* Step 7. Verify the article page loads\n" +
      "* Step 8. Scroll down to read through sections\n" +
      "* Step 9. Click on any internal link to navigate to another article\n" +
      "* Step 10. Verify the new article page loads successfully",
  },
];
