import { useRef } from "react";
import type { ReactNode } from "react";
import type { Tree } from "../core/model";
import { resizePair } from "../core/LayoutManager";
export function LayoutView({
  tree,
  onChange,
  render,
  onDrag,
}: {
  tree: Tree;
  onChange: (t: Tree) => void;
  render: (slot: number) => ReactNode;
  onDrag: (v: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (tree.kind === "leaf")
    return <div className="leaf">{render(tree.slot)}</div>;
  return (
    <div ref={ref} className={"split " + tree.axis}>
      {tree.children.map((child, i) => (
        <div
          className="branch"
          key={i}
          style={{ flex: tree.ratios[i], minWidth: 0, minHeight: 0 }}
        >
          <LayoutView
            tree={child}
            onDrag={onDrag}
            onChange={(t) =>
              onChange({
                ...tree,
                children: tree.children.map((c, j) => (i === j ? t : c)),
              })
            }
            render={render}
          />
          {i < tree.children.length - 1 && (
            <div
              className="divider"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const box = ref.current!.getBoundingClientRect(),
                  start = tree.axis === "x" ? e.clientX : e.clientY;
                const length = tree.axis === "x" ? box.width : box.height,
                  ratios = [...tree.ratios];
                const target = e.currentTarget;
                onDrag(true);
                target.onpointermove = (move) =>
                  onChange({
                    ...tree,
                    ratios: resizePair(
                      ratios,
                      i,
                      ((tree.axis === "x" ? move.clientX : move.clientY) -
                        start) /
                        length,
                      Math.min(120 / length, 1 / tree.children.length),
                    ),
                  });
                const end = () => {
                  target.onpointermove = null;
                  onDrag(false);
                };
                target.onpointerup = end;
                target.onlostpointercapture = end;
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
export function Thumbnail({ tree }: { tree: Tree }) {
  if (tree.kind === "leaf")
    return <span className="thumb-leaf">{tree.slot + 1}</span>;
  return (
    <span className={"thumb-split " + tree.axis}>
      {tree.children.map((t, i) => (
        <span key={i} style={{ flex: tree.ratios[i] }}>
          <Thumbnail tree={t} />
        </span>
      ))}
    </span>
  );
}
