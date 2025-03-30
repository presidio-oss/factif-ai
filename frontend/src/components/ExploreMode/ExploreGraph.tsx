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
  MarkerType,
  Panel,
} from "@xyflow/react";
import { Button } from "@nextui-org/react";
import { IExploredNode } from "@/types/message.types.ts";
import { useExploreModeContext } from "@/contexts/ExploreModeContext.tsx";
import "@xyflow/react/dist/style.css";
import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import PageNode from "@/components/ExploreMode/PageNode.tsx";
import {
  RouteClassifierService,
  RouteCategory,
} from "@/services/routeClassifierService";

// Get appropriate icon for category
const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case "product":
      return "🛒";
    case "landing":
      return "🏠";
    case "auth":
      return "🔒";
    case "dashboard":
      return "📊";
    case "profile":
      return "👤";
    case "content":
      return "📄";
    case "settings":
      return "⚙️";
    case "admin":
      return "🔑";
    case "checkout":
      return "💰";
    case "search":
      return "🔍";
    case "category":
      return "📂";
    case "cart":
      return "🛒";
    case "about":
      return "ℹ️";
    case "support":
      return "🆘";
    default:
      return "📁";
  }
};

// Get custom styles based on category
const getHeaderStyle = (category: string) => {
  const baseStyle =
    "font-bold text-lg p-1.5 flex items-center justify-between rounded-t-[8px]";

  switch (category.toLowerCase()) {
    case "product":
      return `${baseStyle} bg-purple-900 text-purple-100`;
    case "landing":
      return `${baseStyle} bg-green-900 text-green-100`;
    case "auth":
      return `${baseStyle} bg-orange-900 text-orange-100`;
    case "dashboard":
      return `${baseStyle} bg-blue-900 text-blue-100`;
    case "profile":
      return `${baseStyle} bg-pink-900 text-pink-100`;
    case "content":
      return `${baseStyle} bg-indigo-900 text-indigo-100`;
    case "settings":
      return `${baseStyle} bg-amber-900 text-amber-100`;
    case "admin":
      return `${baseStyle} bg-red-900 text-red-100`;
    case "checkout":
      return `${baseStyle} bg-teal-900 text-teal-100`;
    case "search":
      return `${baseStyle} bg-blue-900 text-blue-100`;
    case "category":
      return `${baseStyle} bg-yellow-900 text-yellow-100`;
    case "cart":
      return `${baseStyle} bg-cyan-900 text-cyan-100`;
    case "about":
      return `${baseStyle} bg-gray-900 text-gray-100`;
    case "support":
      return `${baseStyle} bg-violet-900 text-violet-100`;
    default:
      return `${baseStyle} bg-gray-900 text-gray-100`;
  }
};

// Container border style based on category
const getContainerStyle = (category: string) => {
  const baseStyle = "flex-1 border-3 border-t-0 rounded-b-lg bg-opacity-20 p-3";

  switch (category.toLowerCase()) {
    case "product":
      return `${baseStyle} border-purple-900 bg-purple-900`;
    case "landing":
      return `${baseStyle} border-green-900 bg-green-900`;
    case "auth":
      return `${baseStyle} border-orange-900 bg-orange-900`;
    case "dashboard":
      return `${baseStyle} border-blue-900 bg-blue-900`;
    case "profile":
      return `${baseStyle} border-pink-900 bg-pink-900`;
    case "content":
      return `${baseStyle} border-indigo-900 bg-indigo-900`;
    case "settings":
      return `${baseStyle} border-amber-900 bg-amber-900`;
    case "admin":
      return `${baseStyle} border-red-900 bg-red-900`;
    case "checkout":
      return `${baseStyle} border-teal-900 bg-teal-900`;
    case "search":
      return `${baseStyle} border-blue-900 bg-blue-800`;
    case "category":
      return `${baseStyle} border-yellow-900 bg-yellow-800`;
    case "cart":
      return `${baseStyle} border-cyan-900 bg-cyan-900`;
    case "about":
      return `${baseStyle} border-gray-800 bg-gray-700`;
    case "support":
      return `${baseStyle} border-violet-900 bg-violet-900`;
    default:
      return `${baseStyle} border-gray-900 bg-gray-900`;
  }
};

// Enhanced group node component with customized styling for each category
const GroupNode = ({
  data,
}: {
  data: { label: string; nodeCount: number; customStyles?: any };
}) => {
  // Get category from data
  const category =
    data.customStyles?.category || data.label?.toLowerCase() || "uncategorized";

  return (
    <div className="flex flex-col h-full w-full">
      <div className={getHeaderStyle(category)}>
        <div className="flex items-center">
          <span className="mr-2 text-sm">{getCategoryIcon(category)}</span>
          <span className="lowercase first-letter:uppercase tracking-wide font-extralight text-xs">
            {data.label}
          </span>
        </div>
        <span className="text-[10px]/3 heig font-light bg-black bg-opacity-30 px-2 py-1 rounded-full">
          {data.nodeCount} pages
        </span>
      </div>
      <div className={getContainerStyle(category)}></div>
    </div>
  );
};

// FloatingGraphToggle component for toggling between graph and preview views
const FloatingGraphToggle: React.FC = () => {
  const { showGraph, setShowGraph } = useExploreModeContext();

  // In ExploreGraph, we're already in graph view, so show display/monitor icon to go back to preview
  return (
    <Button
      size="sm"
      color="primary"
      variant="flat"
      isIconOnly
      onPress={() => setShowGraph(!showGraph)}
      className="h-8 w-8 min-w-0 m-1.5"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    </Button>
  );
};

// Define node types outside the component to prevent re-creation on each render
const nodeTypes = {
  pageNode: PageNode,
  group: GroupNode,
};

export function ExploreGraph() {
  const { graphData, setShowGraph } = useExploreModeContext();

  // Add debug logging to track when graph data is received and if it's empty
  useEffect(() => {
    console.log("GraphData received in ExploreGraph:", graphData);
    console.log("Nodes length:", graphData?.nodes?.length || 0);

    // If we have no nodes, log a warning
    if (!graphData?.nodes?.length) {
      console.warn("Graph data is empty - no nodes to display");
    }
  }, [graphData]);
  const [routeCategories, setRouteCategories] = useState<
    Record<string, RouteCategory>
  >({});
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // State to store category containers that persists during updates
  const [categoryContainers, setCategoryContainers] = useState<Node[]>([]);

  // Use ref to track last update and prevent flicker during rapid updates
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // State declarations with layout-aware initialization
  const [nodes, setNodes] = useState<Node[]>(() => {
    const initialNodes = convertToNodes(graphData?.nodes);
    if (!initialNodes.length) return [];
    
    // Apply initial layout
    const categorizedNodes = initialNodes.reduce((acc, node) => {
      const category = (node.data?.category as string)?.toLowerCase() || "uncategorized";
      if (!acc[category]) acc[category] = [];
      acc[category].push(node);
      return acc;
    }, {} as Record<string, Node[]>);

    // Position nodes in grid layout
    const layoutedNodes: Node[] = [];
    let yOffset = 0;
    
    Object.entries(categorizedNodes).forEach(([category, nodes]) => {
      const nodesPerRow = 3;
      const nodeWidth = 170;
      const nodeHeight = 150;
      const horizontalPadding = 30;

      nodes.forEach((node, index) => {
        const row = Math.floor(index / nodesPerRow);
        const col = index % nodesPerRow;
        layoutedNodes.push({
          ...node,
          position: {
            x: col * (nodeWidth + horizontalPadding),
            y: yOffset + row * (nodeHeight + 20)
          }
        });
      });
      
      const rows = Math.ceil(nodes.length / nodesPerRow);
      yOffset += rows * (nodeHeight + 20) + 150;
    });

    return layoutedNodes;
  });

  const [edges, setEdges] = useState<Edge[]>(() =>
    graphData?.edges ? graphData.edges.map(edge => ({
      ...edge,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#555" },
      type: "default",
    })) as Edge[] : []
  );

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

  // Classify routes only when nodes are added/changed or nodes first load
  useEffect(() => {
    if (!graphData?.nodes || graphData.nodes.length === 0) return;

    // Get all nodes that need classification (either no category or showing as "uncategorized")
    const nodesToClassify = graphData.nodes.filter(
      (node) => !node.data?.category || node.data?.category === "uncategorized"
    );

    // Get all URLs from nodes, both classified and unclassified
    // We'll check for cached classifications for all of them
    const allUrls = graphData.nodes
      .map((node) => node.data?.label)
      .filter(Boolean) as string[];

    if (allUrls.length === 0) return;

    // Add a small delay to prevent flickering during rapid updates
    const classificationTimeout = setTimeout(() => {
      const classifyNodes = async () => {
        // Don't set loading state if we're using all cached data
        // This prevents nodes from briefly showing as unclassified during mode switches
        if (nodesToClassify.length > 0) {
          setIsClassifying(true);
        }

        try {
          // Default categories as fallback
          const defaultCategories: Record<string, RouteCategory> = {
            "/login": { category: "auth", description: "Login page" },
            "/register": { category: "auth", description: "Registration page" },
            "/dashboard": { category: "dashboard", description: "Main dashboard" },
            "/profile": { category: "profile", description: "User profile" },
            "/settings": { category: "settings", description: "User settings" },
            "/products": { category: "product", description: "Product listing" },
            "/": { category: "landing", description: "Homepage" },
          };

          // Try to classify URLs - this now uses cache with our improved service
          console.log("Getting classifications for URLs:", allUrls);
          const classifications = await RouteClassifierService.classifyRoutes(allUrls);
          
          // Store in local state
          setRouteCategories((prev) => ({ ...prev, ...classifications }));

          // Apply classifications to all nodes, preserving existing categories
          const updatedNodes = nodes.map((node) => {
            const url = node.data?.label as string;
            
            // If node already has a category and it's not "uncategorized", keep it
            if (node.data?.category && node.data?.category !== "uncategorized") {
              return node;
            }

            let category, description;

            // Check if we have a classification from cache/API
            if (url && classifications[url]) {
              category = classifications[url].category;
              description = classifications[url].description;
            } else {
              // Try to match with default categories
              for (const path in defaultCategories) {
                if (url && url.includes(path)) {
                  category = defaultCategories[path].category;
                  description = defaultCategories[path].description;
                  break;
                }
              }

              // Use uncategorized as fallback
              if (!category) {
                category = "uncategorized";
                description = "Uncategorized page";
              }
            }

            return {
              ...node,
              data: {
                ...node.data,
                category,
                categoryDescription: description,
              },
            };
          });

          setNodes(updatedNodes);
        } catch (error) {
          console.error("Error during classification process:", error);
          
          // Apply default categorization as fallback
          const updatedNodes = nodes.map((node) => {
            const url = node.data?.label as string;

            // Skip if node already has a non-uncategorized category
            if (node.data?.category && node.data?.category !== "uncategorized") {
              return node;
            }

            let category = "uncategorized";
            let description = "Uncategorized page";

            if (url) {
              if (url.includes("/login") || url.includes("/signin") || url.includes("/register")) {
                category = "auth";
                description = "Authentication page";
              } else if (url.includes("/dashboard")) {
                category = "dashboard";
                description = "Dashboard page";
              } else if (url.includes("/product")) {
                category = "product";
                description = "Product page";
              } else if (url.includes("/profile")) {
                category = "profile";
                description = "Profile page";
              } else if (url === "/" || url.endsWith(".html")) {
                category = "landing";
                description = "Landing page";
              }
            }

            return {
              ...node,
              data: {
                ...node.data,
                category,
                categoryDescription: description,
              },
            };
          });

          setNodes(updatedNodes);
        } finally {
          setIsClassifying(false);
        }
      };

      classifyNodes();
    }, 10); // Reduced delay since we're using cache

    return () => clearTimeout(classificationTimeout);
  }, [graphData?.nodes]);

  // Update nodes when graphData changes with immediate layout
  useEffect(() => {
    if (!graphData?.nodes?.length) return;

    // Track if we have new nodes
    const existingNodeIds = new Set(nodes.map(node => node.id));
    const hasNewNodes = graphData.nodes.some(node => !existingNodeIds.has(node.id));

    // Map existing categories
    const categoryMap = new Map();
    nodes.forEach((node) => {
      if (node.id && node.data?.category) {
        categoryMap.set(node.id, {
          category: node.data.category,
          categoryDescription: node.data.categoryDescription,
        });
      }
    });

    // Convert and categorize new nodes
    const newNodes = convertToNodes(graphData.nodes).map((node) => {
      if (node.id && categoryMap.has(node.id)) {
        // Preserve category info for existing nodes
        const categoryInfo = categoryMap.get(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            category: categoryInfo.category,
            categoryDescription: categoryInfo.categoryDescription,
          },
        };
      }
      return node;
    });

    // If we have new nodes, trigger immediate layout
    if (hasNewNodes) {
      // Group nodes by category for layout
      const categorizedNodes = newNodes.reduce((acc, node) => {
        const category = (node.data?.category as string)?.toLowerCase() || "uncategorized";
        if (!acc[category]) acc[category] = [];
        acc[category].push(node);
        return acc;
      }, {} as Record<string, Node[]>);

      // Position nodes in grid layout
      const layoutedNodes: Node[] = [];
      let yOffset = 0;
      
      Object.entries(categorizedNodes).forEach(([category, nodes]) => {
        const nodesPerRow = 3;
        const nodeWidth = 170;
        const nodeHeight = 150;
        const horizontalPadding = 30;

        nodes.forEach((node, index) => {
          const row = Math.floor(index / nodesPerRow);
          const col = index % nodesPerRow;
          layoutedNodes.push({
            ...node,
            position: {
              x: col * (nodeWidth + horizontalPadding),
              y: yOffset + row * (nodeHeight + 20)
            }
          });
        });
        
        const rows = Math.ceil(nodes.length / nodesPerRow);
        yOffset += rows * (nodeHeight + 20) + 150;
      });

      // Update edges with consistent styling
      const newEdges = graphData.edges
        ? graphData.edges.map(edge => ({
            ...edge,
            id: edge.id || `edge-${Math.random().toString(36).substr(2, 9)}`,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#555" },
            type: "default",
          })) as Edge[]
        : [];

      // Apply updates immediately
      setNodes(layoutedNodes);
      setEdges(newEdges);
    }

  }, [graphData, convertToNodes, nodes]);

  // Completely redesigned node layout by category
  useEffect(() => {
    if (!nodes || !nodes.length) return;

    // Step 1: Normalize all categories
    const normalizedNodes = nodes.map((node) => {
      let category = (
        (node.data?.category as string) || "uncategorized"
      ).toLowerCase();

      // Normalize different versions of unknown/uncategorized
      if (category === "unknown" || category === "") {
        category = "uncategorized";
      }

      return {
        ...node,
        data: {
          ...node.data,
          category,
        },
      };
    });

    // Step 2: Group nodes by category
    const categorizedNodes: Record<string, Node[]> = {};
    normalizedNodes.forEach((node) => {
      const category = node.data?.category as string;
      if (!categorizedNodes[category]) {
        categorizedNodes[category] = [];
      }
      categorizedNodes[category].push(node);
    });

    // Step 3: Define vertical offsets for each category
    const categoryOrder = [
      "landing",
      "product",
      "category",
      "cart",
      "checkout",
      "auth",
      "profile",
      "content",
      "search",
      "admin",
      "about",
      "support",
    ];

    // Calculate yOffset for each category
    const yOffsets: Record<string, number> = {};
    let currentYOffset = 0;

    // First assign y-offsets to categories in our preferred order
    categoryOrder.forEach((category) => {
      if (categorizedNodes[category]) {
        yOffsets[category] = currentYOffset;
        // Each category gets vertical space based on how many rows of nodes it will have
        const nodeCount = categorizedNodes[category].length;
        const rows = Math.ceil(nodeCount / 3); // At most 3 nodes per row
        currentYOffset += rows * 200 + 150; // 200px per row + 150px padding between categories
      }
    });

    // Then assign y-offsets to any remaining categories
    Object.keys(categorizedNodes).forEach((category) => {
      if (yOffsets[category] === undefined) {
        yOffsets[category] = currentYOffset;
        const nodeCount = categorizedNodes[category].length;
        const rows = Math.ceil(nodeCount / 3);
        currentYOffset += rows * 200 + 150;
      }
    });

    // Step 4: Position nodes in a compact grid by category
    const updatedNodes: Node[] = [];

    Object.entries(categorizedNodes).forEach(([category, nodesInCategory]) => {
      const nodesPerRow = 3; // Fixed width of 3 nodes per row
      const nodeWidth = 170;
      const nodeHeight = 150;
      const horizontalPadding = 30;
      const yOffset = yOffsets[category];

      // Position each node in a grid layout within its category
      nodesInCategory.forEach((node, index) => {
        const row = Math.floor(index / nodesPerRow);
        const col = index % nodesPerRow;

        const x = col * (nodeWidth + horizontalPadding);
        const y = yOffset + row * (nodeHeight + 20) + 12; // 12px extra padding to lower the nodes

        // Apply category-based styles
        const categoryColor = getCategoryColor(category);

        updatedNodes.push({
          ...node,
          position: { x, y },
          style: {
            ...node.style,
            // Remove the border from individual nodes to avoid duplication
          },
          data: {
            ...node.data,
            categoryColor,
          },
        });
      });
    });

    // Apply the updated nodes
    setNodes(updatedNodes);

    // Update edges with curved lines and better overlap handling
    const updatedEdges = edges.map((edge) => ({
      ...edge,
      type: "default", // Change to smoothstep for curved edges
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      style: { stroke: "#888", strokeWidth: 2 },
      curvature: 0.3, // Add curvature to make lines bend nicer
      // Add different offsets to edges with the same source/target to prevent overlapping
      sourceHandle: edge.sourceHandle || null,
      targetHandle: null,
      // Separate edges that share same source/target
      pathOptions: { offset: 15 },
    }));

    setEdges(updatedEdges as unknown as Edge[]);
  }, [graphData?.nodes, routeCategories]);

  // Helper function to get a consistent color for each category
  const getCategoryColor = (category: string): string => {
    const categoryColors: Record<string, string> = {
      auth: "#ff9800",
      dashboard: "#2196f3",
      landing: "#4caf50",
      product: "#9c27b0",
      profile: "#e91e63",
      settings: "#795548",
      admin: "#f44336",
      checkout: "#009688",
      search: "#3f51b5",
      uncategorized: "#607d8b",
    };

    return (
      categoryColors[category.toLowerCase()] || categoryColors.uncategorized
    );
  };

  // Ensure we have valid data before rendering
  const validNodes = nodes?.filter(Boolean) || [];
  const validEdges =
    edges?.filter((edge) => edge && edge.source && edge.target) || [];

  // Extract unique categories for the legend
  const categoryList = useMemo(() => {
    const categories = new Set<string>();

    nodes.forEach((node) => {
      const category = node.data?.category as string;
      if (category) {
        categories.add(category);
      }
    });

    return Array.from(categories);
  }, [nodes]);

  // Create category label nodes and store them in persistent state
  // This debounced implementation prevents flickering during rapid updates
  useEffect(() => {
    if (!validNodes.length) return;

    // Clear any pending updates
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    // Debounce the container updates to prevent flickering during typing
    updateTimerRef.current = setTimeout(() => {
      // Group nodes by normalized category
      const groupedNodes: Record<string, Node[]> = {};

      // Normalize all categories
      validNodes.forEach((node) => {
        let category = (
          (node.data?.category as string) || "uncategorized"
        ).toLowerCase();

        // Normalize different versions of unknown/uncategorized
        if (category === "unknown" || category === "") {
          category = "uncategorized";
        }

        if (!groupedNodes[category]) {
          groupedNodes[category] = [];
        }
        groupedNodes[category].push(node);
      });

      // Create one container per category
      const newCategoryNodes = Object.entries(groupedNodes)
        .map(([category, nodesInCategory]) => {
          if (nodesInCategory.length === 0) return null;

          // Calculate bounding box
          const allXCoordinates = nodesInCategory.map((n) => n.position.x);
          const allYCoordinates = nodesInCategory.map((n) => n.position.y);

          const minX = Math.min(...allXCoordinates) - 45;
          const minY = Math.min(...allYCoordinates) - 90;

          const maxX = Math.max(
            ...nodesInCategory.map((n) => n.position.x + 190),
          );
          const maxY =
            Math.max(...nodesInCategory.map((n) => n.position.y + 150)) + 30;

          const width = maxX - minX;
          const height = maxY - minY;

          // Create container node
          return {
            id: `category-${category}`,
            position: { x: minX, y: minY },
            style: {
              width,
              height,
              background: "transparent",
              zIndex: -1,
              borderRadius: "9px",
              cursor: "grab",
              padding: "0px",
            },
            data: {
              label: category.toUpperCase(),
              nodeCount: nodesInCategory.length,
              customStyles: {
                category: category,
                color: getCategoryColor(category),
              },
            },
            type: "group",
            parentNode: undefined,
            extent: undefined,
            expandParent: false,
            draggable: true,
          };
        })
        .filter(Boolean) as Node[];

      // Update category containers with new positions
      setCategoryContainers(newCategoryNodes);
    }, 10); // 200ms debounce

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, [validNodes, routeCategories]);

  // Update the edges when they change to ensure they remain curved and non-overlapping
  useEffect(() => {
    // Keep the edges curved and offset to prevent overlap
    setEdges((edges) =>
      edges.map((edge) => {
        const isConnectedToSelectedNode =
          selectedNode === edge.source || selectedNode === edge.target;

        return {
          ...edge,
          type: "default",
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: isConnectedToSelectedNode
            ? {
                stroke: "#00BFFF", // Bright cyan color for highlighting
                strokeWidth: 3,
                filter: "drop-shadow(0 0 5px #00BFFF)",
                transition: "all 0.3s ease",
              }
            : {
                stroke: "#555",
                strokeWidth: 2,
                transition: "all 0.3s ease",
              },
          pathOptions: { offset: 15 },
        };
      }),
    );
  }, [validNodes.length, edges.length, selectedNode]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {!graphData?.nodes || graphData.nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full bg-[#141414] text-gray-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 mb-4 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          <p className="text-xl font-light text-gray-300">
            No exploration data available
          </p>
          <p className="text-sm mt-2 text-gray-400">
            Start exploring a website to build the graph
          </p>
          <button
            onClick={() => setShowGraph(false)}
            className="mt-6 px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors shadow-lg"
          >
            Return to Preview
          </button>
        </div>
      ) : (
        <ReactFlow
          nodes={[...categoryContainers, ...validNodes]}
          edges={validEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            // Only set selectedNode for pageNode types, not containers
            if (node.type === "pageNode") {
              setSelectedNode((prev) => (prev === node.id ? null : node.id));
            }
          }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodeTypes={nodeTypes}
          snapToGrid={false}
          colorMode="dark"
          minZoom={0.1}
          maxZoom={1.5}
          nodesDraggable={true}
          elementsSelectable={true}
          zoomOnScroll={true}
          panOnScroll={true}
          nodesFocusable={true}
          edgesFocusable={true}
        >
          <Panel position="top-right" className="mr-4 mt-4">
            <FloatingGraphToggle />
          </Panel>

          <Panel
            position="top-left"
            className="bg-background/95 p-3 rounded shadow-lg border border-border/50"
          >
            <h3 className="text-white text-md font-light mb-2">
              Sitemap: Route Categories
            </h3>
            {isClassifying ? (
              <div className="text-white text-sm">Classifying routes...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categoryList.map((category) => (
                  <div
                    key={category}
                    className="flex items-center text-sm text-white font-light"
                  >
                    <span
                      className="inline-block w-3 h-3 mr-1 rounded-sm"
                      style={{ backgroundColor: getCategoryColor(category) }}
                    />
                    {category}
                  </div>
                ))}
                {categoryList.length === 0 && (
                  <div className="text-white text-sm">No categories found</div>
                )}
              </div>
            )}
          </Panel>
          <Controls />
          <Background />
        </ReactFlow>
      )}
    </div>
  );
}
