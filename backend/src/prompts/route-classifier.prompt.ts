export const routeClassifierPrompt = (
  url: string,
  pageTitle?: string,
  pageContent?: string
): string => `
You are analyzing a web page to classify it into a specific route category. Please analyze the following information and return a JSON object with two properties:
1. "category": The route category (e.g., "auth", "dashboard", "product", "landing", "profile", "settings", "admin", "checkout", "search", etc.)
2. "description": A brief description of what this route is used for

URL: ${url}
${pageTitle ? `Page Title: ${pageTitle}` : ""}
${pageContent ? `Page Content: ${pageContent?.substring(0, 500)}...` : ""}

Return ONLY a valid JSON object like this: {"category": "category-name", "description": "brief description"}
`;
