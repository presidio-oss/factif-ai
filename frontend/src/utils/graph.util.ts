import { IExploredNode } from "@/types/message.types.ts";

export const createEdgeOrNode = (
  nodes: IExploredNode[],
  url: string,
): { createNode: boolean; createEdge: boolean; node: IExploredNode | null } => {
  const index = nodes.findIndex((node) => node.data.label === url);
  return index === -1
    ? { createNode: true, createEdge: false, node: null }
    : {
        createNode: false,
        createEdge: true,
        node: nodes[index],
      };
};
