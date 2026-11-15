import { useRef } from "react";
import type { ReactNode } from "react";
import type { Tree } from "../core/model";
import { resizePair } from "../core/LayoutManager";
export function LayoutView({
  tree,
  onChange,
  render,
  onDrag,
  liveResize = true,
}: {
  tree: Tree;
  onChange: (t: Tree) => void;
  render: (slot: number) => ReactNode;
  onDrag: (v: boolean) => void;
  liveResize?: boolean;
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
            liveResize={liveResize}
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
                let frame = 0,
                  done = false,
                  next = tree;
                let preview: number | undefined;
                const commit = () => {
                  frame = 0;
                  if (liveResize) onChange(next);
                  else if (preview !== undefined) {
                    const r = target.getBoundingClientRect();
                    void window.browser.resizePreview(
                      tree.axis === "x"
                        ? {
                            x: Math.round(preview),
                            y: Math.round(r.y),
                            width: 3,
                            height: Math.round(r.height),
                          }
                        : {
                            x: Math.round(r.x),
                            y: Math.round(preview),
                            width: Math.round(r.width),
                            height: 3,
                          },
                    );
                  }
                };
                const move = (clientX: number, clientY: number) => {
                  next = {
                    ...tree,
                    ratios: resizePair(
                      ratios,
                      i,
                      ((tree.axis === "x" ? clientX : clientY) - start) /
                        length,
                      Math.min(120 / length, 1 / tree.children.length),
                    ),
                  };
                  if (!liveResize) {
                    const before = ratios
                        .slice(0, i + 1)
                        .reduce((sum, n) => sum + n, 0),
                      after = next.ratios
                        .slice(0, i + 1)
                        .reduce((sum, n) => sum + n, 0);
                    const r = target.getBoundingClientRect();
                    preview =
                      (tree.axis === "x" ? r.x : r.y) +
                      (after - before) * length;
                  }
                  if (!frame) frame = requestAnimationFrame(commit);
                };
                const end = () => {
                  if (done) return;
                  done = true;
                  cancelAnimationFrame(frame);
                  void window.browser.resizePreview(null);
                  target.onpointermove = null;
                  target.onpointerup = null;
                  target.onlostpointercapture = null;
                  window.removeEventListener("pointerup", end, true);
                  unsubscribe();
                  onChange(next);
                  onDrag(false);
                };
                const unsubscribe = window.browser.onResizePointer((event) => {
                  if (done) return;
                  if (!event.cancelled) move(event.x, event.y);
                  if (event.done) end();
                });
                target.onpointermove = (event) =>
                  move(event.clientX, event.clientY);
                target.onpointerup = end;
                window.addEventListener("pointerup", end, true);
                void window.browser.beginResize(tree.axis).catch(end);
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
