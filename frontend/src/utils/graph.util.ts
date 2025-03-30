import { IExploredNode } from "@/types/message.types.ts";

/**
 * Helper function to normalize URLs for consistent comparison
 */
const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname + urlObj.search;
  } catch (e) {
    // If we can't parse the URL, just return it as is
    return url;
  }
};

export const createEdgeOrNode = (
  nodes: IExploredNode[],
  url: string,
): { createNode: boolean; createEdge: boolean; node: IExploredNode | null } => {
  // First try an exact match
  let index = nodes.findIndex((node) => node.data.label === url);

  // If no exact match, check for URL structural similarities
  if (index === -1) {
    // For logging
    if (nodes.length > 0) {
      console.log(
        `No exact match found for URL: ${url}. Using normalized comparison.`,
      );
    }

    // Normalize the input URL
    const normalizedUrl = normalizeUrl(url);

    // Try to find a node with the same normalized URL
    index = nodes.findIndex((node) => {
      const nodeUrl = node.data.label;
      const normalizedNodeUrl = normalizeUrl(nodeUrl);
      return normalizedUrl === normalizedNodeUrl;
    });

    // If we found a match via normalized URL, log it for debugging
    if (index !== -1) {
      console.log(
        `Found normalized match for ${url}: ${nodes[index].data.label}`,
      );
    }
  }

  return index === -1
    ? { createNode: true, createEdge: false, node: null }
    : {
        createNode: false,
        createEdge: true,
        node: nodes[index],
      };
};
