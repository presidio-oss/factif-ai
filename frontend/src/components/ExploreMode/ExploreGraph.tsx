import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from "@xyflow/react";
import { IExploredNode } from "@/types/message.types.ts";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import "@xyflow/react/dist/style.css";
import { useCallback, useState, useEffect } from "react";
import dagre from "dagre";
import PageNode from "@/components/ExploreMode/PageNode.tsx";

export function ExploreGraph() {
  const { graphData } = useExploreModeContext();

  // Convert IExploredNode[] to Node[] with proper mapping and safety checks
  const convertToNodes = useCallback(
    (exploredNodes: IExploredNode[] | undefined): Node[] => {
      if (!exploredNodes || !Array.isArray(exploredNodes)) return [];

      return exploredNodes
        .map((node) => {
          if (!node) return null;

          return {
            id: node.id || `node-${Math.random().toString(36).substr(2, 9)}`,
            position: node.position || { x: 0, y: 0 },
            // Use type assertion with a spread to ensure it's treated as Record<string, unknown>
            data: { ...(node.data || { label: "", edges: [] }) } as Record<
              string,
              unknown
            >,
            // Default to pageNode if type is missing
            type: node.type || "pageNode",
          };
        })
        .filter(Boolean) as Node[];
    },
    [],
  );

  const [nodes, setNodes] = useState<Node[]>(() =>
    convertToNodes(graphData?.nodes),
  );
  // Also properly cast edges to ensure type compatibility
  const [edges, setEdges] = useState<Edge[]>(() =>
    graphData?.edges ? ([...graphData.edges] as unknown as Edge[]) : [],
  );

  const nodeTypes = {
    pageNode: PageNode,
  };

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [],
  );

  // Update nodes when graphData changes
  useEffect(() => {
    if (!graphData) return;

    setNodes(convertToNodes(graphData.nodes));
    setEdges(
      graphData.edges ? ([...graphData.edges] as unknown as Edge[]) : [],
    );
  }, [graphData, convertToNodes]);

  useEffect(() => {
    if (!nodes || !nodes.length) return;

    // Create a new directed graph
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: "TB",
      nodesep: 80, // Increase horizontal spacing between nodes
      ranksep: 120, // Increase vertical spacing between ranks
    });

    // Add nodes to the graph with dimensions that match your screenshots
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 200, height: 120 });
    });

    // Add edges to the graph with safety checks
    edges.forEach((edge) => {
      if (edge && edge.source && edge.target) {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    });

    // Calculate the layout
    dagre.layout(dagreGraph);

    // Apply the calculated positions to the nodes with safety checks
    const updatedNodes = nodes.map((node) => {
      const position = dagreGraph.node(node.id);
      // Protect against undefined position
      if (!position) {
        return node;
      }

      return {
        ...node,
        position: {
          x: typeof position.x === "number" ? position.x : 0,
          y: typeof position.y === "number" ? position.y : 0,
        },
      };
    });

    setNodes(updatedNodes);
  }, [graphData]);

  // Ensure we have valid data before rendering
  const validNodes = nodes?.filter(Boolean) || [];
  const validEdges =
    edges?.filter((edge) => edge && edge.source && edge.target) || [];

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={validNodes}
        edges={validEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        nodeTypes={nodeTypes}
        snapToGrid={true}
        colorMode="dark"
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}
