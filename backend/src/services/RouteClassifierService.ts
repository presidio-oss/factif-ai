import { AnthropicProvider } from "./llm/AnthropicProvider";
import Anthropic from "@anthropic-ai/sdk";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { config } from "../config";
import { routeClassifierPrompt } from "../prompts/route-classifier.prompt";

export interface RouteCategory {
  category: string;
  description: string;
}

export class RouteClassifierService {
  private anthropicProvider: AnthropicProvider;
  private client: Anthropic | AnthropicBedrock;

  // Cache to store classifications for faster response
  private classificationCache: Map<string, RouteCategory> = new Map();

  constructor() {
    this.anthropicProvider = new AnthropicProvider();

    // Initialize the appropriate client based on configuration
    if (config.llm.anthropic.useBedrock) {
      this.client = new AnthropicBedrock({
        awsRegion: config.llm.anthropic.bedrock.region,
        awsAccessKey: config.llm.anthropic.bedrock.credentials.accessKeyId,
        awsSecretKey: config.llm.anthropic.bedrock.credentials.secretAccessKey,
        awsSessionToken: config.llm.anthropic.bedrock.credentials.sessionToken,
      });
    } else {
      this.client = new Anthropic({
        apiKey: config.llm.anthropic.apiKey,
      });
    }
  }

  /**
   * Classify a route based on its URL and page content
   * Uses LLM to determine the category instead of URL pattern matching
   * @param url The URL of the route
   * @param pageTitle The title of the page (if available)
   * @param pageContent The textual content of the page
   * @returns A promise that resolves to a RouteCategory
   */
  async classifyRoute(
    url: string,
    pageTitle?: string,
    pageContent?: string
  ): Promise<RouteCategory> {
    // Check if the classification is already in the cache
    const cacheKey = url;
    if (this.classificationCache.has(cacheKey)) {
      return this.classificationCache.get(cacheKey)!;
    }

    try {
      // Skip API call if no API key is configured (for direct Anthropic)
      // or if no AWS credentials are configured (for Bedrock)
      if (
        (!config.llm.anthropic.apiKey && !config.llm.anthropic.useBedrock) ||
        (config.llm.anthropic.useBedrock &&
          (!config.llm.anthropic.bedrock.credentials.accessKeyId ||
            !config.llm.anthropic.bedrock.credentials.secretAccessKey))
      ) {
        console.log(
          "No Anthropic API key configured, using URL pattern matching as fallback"
        );
        const fallbackCategory = this.getCategoryFromUrl(url);
        return (
          fallbackCategory || {
            category: "uncategorized",
            description: "Classification skipped - no API key",
          }
        );
      }

      const prompt = routeClassifierPrompt(url, pageTitle, pageContent);

      // Get the appropriate model ID based on configuration
      const modelId = config.llm.anthropic.useBedrock
        ? config.llm.anthropic.bedrock.modelId
        : config.llm.anthropic.model;

      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      // Parse the response to extract JSON
      let responseText = "";
      // Handle different types of content blocks
      if (response.content[0].type === "text") {
        responseText = response.content[0].text;
      }
      const jsonMatch = responseText.match(/\{[\s\S]*?\}/);

      if (jsonMatch) {
        try {
          const classification = JSON.parse(jsonMatch[0]) as RouteCategory;

          // Store in cache
          this.classificationCache.set(cacheKey, classification);

          return classification;
        } catch (e) {
          console.error("Failed to parse route classification JSON:", e);
          return {
            category: "uncategorized",
            description: "Could not classify route: invalid JSON from LLM",
          };
        }
      } else {
        console.error("No JSON found in response:", responseText);
        return {
          category: "uncategorized",
          description: "Could not classify route: no JSON in LLM response",
        };
      }
    } catch (error) {
      console.error("Error classifying route:", error);
      return {
        category: "uncategorized",
        description: "Failed to classify: LLM API error",
      };
    }
  }

  /**
   * Determine category based on URL pattern analysis
   * Used as fallback when LLM classification fails or no API key is available
   * @param url The URL to analyze
   */
  private getCategoryFromUrl(url: string): RouteCategory | null {
    try {
      // Extract path from URL
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();

      // Check various patterns in the URL to determine category
      if (path === "/" || path === "/index.html" || path === "/home") {
        return { category: "landing", description: "Main landing/home page" };
      }

      if (
        path.includes("/product") ||
        path.includes("/item") ||
        path.match(/\/p\/|\/products\//i)
      ) {
        return {
          category: "product",
          description: "Product page or product listing",
        };
      }

      if (
        path.includes("/category") ||
        path.includes("/collection") ||
        path.includes("/shop") ||
        path.includes("/catalog")
      ) {
        return {
          category: "category",
          description: "Product category or collection page",
        };
      }

      if (path.includes("/cart") || path.includes("/basket")) {
        return { category: "cart", description: "Shopping cart page" };
      }

      if (
        path.includes("/checkout") ||
        path.includes("/payment") ||
        path.includes("/order")
      ) {
        return {
          category: "checkout",
          description: "Checkout or payment page",
        };
      }

      if (
        path.includes("/login") ||
        path.includes("/signin") ||
        path.includes("/signup") ||
        path.includes("/register") ||
        path.includes("/auth")
      ) {
        return { category: "auth", description: "Authentication page" };
      }

      if (
        path.includes("/account") ||
        path.includes("/profile") ||
        path.includes("/user")
      ) {
        return {
          category: "profile",
          description: "User account or profile page",
        };
      }

      if (
        path.includes("/blog") ||
        path.includes("/article") ||
        path.includes("/post") ||
        path.includes("/news")
      ) {
        return {
          category: "content",
          description: "Blog, article or content page",
        };
      }

      if (
        path.includes("/about") ||
        path.includes("/company") ||
        path.includes("/team")
      ) {
        return {
          category: "about",
          description: "About, company or team page",
        };
      }

      if (
        path.includes("/contact") ||
        path.includes("/support") ||
        path.includes("/help")
      ) {
        return {
          category: "support",
          description: "Contact, support or help page",
        };
      }

      if (path.includes("/search") || path.includes("/find")) {
        return { category: "search", description: "Search page" };
      }

      if (
        path.includes("/admin") ||
        path.includes("/dashboard") ||
        path.includes("/panel")
      ) {
        return { category: "admin", description: "Admin or dashboard page" };
      }

      // Finalmouse specific patterns
      if (path.includes("/mice") || path.includes("/mousepads")) {
        return {
          category: "product",
          description: "Mouse/mousepad product page",
        };
      }

      if (path.includes("/keyboard")) {
        return { category: "product", description: "Keyboard product page" };
      }

      if (path.includes("/innovations") || path.includes("/technology")) {
        return {
          category: "content",
          description: "Innovation/technology content page",
        };
      }

      return null;
    } catch (error) {
      console.error("Error analyzing URL:", error);
      return null;
    }
  }

  /**
   * Batch classify multiple routes
   * @param routes Array of objects containing URL and optional content
   * @returns A promise that resolves to a Map of URLs to RouteCategories
   */
  async batchClassifyRoutes(
    routes: { url: string; pageTitle?: string; pageContent?: string }[]
  ): Promise<Map<string, RouteCategory>> {
    const results = new Map<string, RouteCategory>();

    // Process routes in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < routes.length; i += batchSize) {
      const batch = routes.slice(i, i + batchSize);
      const promises = batch.map((route) =>
        this.classifyRoute(route.url, route.pageTitle, route.pageContent).then(
          (category) => {
            results.set(route.url, category);
          }
        )
      );

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Clear the classification cache
   */
  clearCache(): void {
    this.classificationCache.clear();
  }
}
