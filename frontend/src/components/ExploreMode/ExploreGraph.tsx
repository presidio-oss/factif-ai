import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
} from "@xyflow/react";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";
import PageNode from "@/components/ExploreMode/PageNode.tsx";

export function ExploreGraph() {
  const { graphData } = useExploreModeContext();
  const [nodes, setNodes] = useState(graphData.nodes);
  const [edges, setEdges] = useState(graphData.edges);
  const nodeTypes = {
    pageNode: PageNode,
  };

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );
  const onConnect = useCallback(
    (connection: any) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
