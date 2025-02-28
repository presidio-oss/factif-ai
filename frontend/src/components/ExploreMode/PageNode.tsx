import { memo, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import { INodeData } from "@/types/message.types.ts";

export default memo(
  ({ data, isConnectable }: { data: INodeData; isConnectable: boolean }) => {
    useEffect(() => {
      console.log("on data ===>", data, isConnectable);
    }, [data]);
    return (
      <>
        <Handle
          type="target"
          position={Position.Left}
          onConnect={(params) => console.log("handle onConnect", params)}
          isConnectable={isConnectable}
        />
        <div className="w-36 p-2 rounded border border-content3 bg-background/95 text-white">
          {data.imageData && (
            <img
              src={data.imageData}
              alt="page-screenshot"
              className="w-full"
            />
          )}
          <p className="break-words overflow-hidden">
            <a href={data.label} className="block text-[7px] pt-2" target="_blank">
              {data.label}
            </a>
          </p>
        </div>
        {data.edges.map((edge) => (
          <Handle
            key={edge}
            type="source"
            position={Position.Bottom}
            id={edge}
            isConnectable={isConnectable}
          />
        ))}
      </>
    );
  },
);
