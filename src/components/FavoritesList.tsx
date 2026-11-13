import { useState } from "react";
import type { DragEvent } from "react";
import type { Config } from "../core/model";
import {
  moveItem,
  moveFavorite,
  searchFavorites,
} from "../core/FavoritesManager";
type Props = {
  config: Config;
  query?: string;
  bar?: boolean;
  onEdit: (fn: (c: Config) => void) => void;
  onOpen: (url: string) => void;
  onFavorite: (id: string) => void;
  onGroupRename: (group: string) => void;
  onGroupDelete: (group: string) => void;
  onDrag: (value: boolean) => void;
};
const groupType = "application/x-mvb-group",
  favoriteType = "application/x-mvb-favorite";
export function FavoritesList({
  config: c,
  query = "",
  bar = false,
  onEdit,
  onOpen,
  onFavorite,
  onGroupRename,
  onGroupDelete,
  onDrag,
}: Props) {
  const [over, setOver] = useState("");
  const finish = () => {
    setOver("");
    onDrag(false);
  };
  const allow = (e: DragEvent, key: string) => {
    if (
      !e.dataTransfer.types.some((t) => t === groupType || t === favoriteType)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    setOver(key);
  };
  const dropGroup = (e: DragEvent, group: string) => {
    e.preventDefault();
    e.stopPropagation();
    const from = e.dataTransfer.getData(groupType),
      id = e.dataTransfer.getData(favoriteType);
    const rect = e.currentTarget.getBoundingClientRect();
    const after = bar
      ? e.clientX > rect.x + rect.width / 2
      : e.clientY > rect.y + rect.height / 2;
    if (from)
      onEdit((d) => {
        d.groups = moveItem(
          d.groups,
          d.groups.indexOf(from),
          d.groups.indexOf(group),
          after,
        );
      });
    else if (id)
      onEdit((d) => {
        d.favorites = moveFavorite(d.favorites, id, group);
      });
    finish();
  };
  const visibleFavorites = searchFavorites(c.favorites, query);
  const groups = c.groups.filter(
    (g) => !bar || c.favorites.some((f) => f.group === g),
  );
  return (
    <>
      {groups.map((group, i) => (
        <section
          key={group}
          className={
            "favorite-group " + (over === "g:" + group ? "drag-over" : "")
          }
          onDragOver={(e) => allow(e, "g:" + group)}
          onDrop={(e) => dropGroup(e, group)}
        >
          {bar ? (
            i > 0 && (
              <span className="bookmark-separator" aria-hidden="true">
                |
              </span>
            )
          ) : (
            <h4
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(groupType, group);
                e.dataTransfer.effectAllowed = "move";
                onDrag(true);
              }}
              onDragEnd={finish}
              title="拖动分组标题调整顺序"
            >
              <span className="group-grip">⠿</span>
              {group}
              <button title="重命名分组" onClick={() => onGroupRename(group)}>
                ✎
              </button>
              <button
                title="删除分组，收藏移至未分组"
                onClick={() => onGroupDelete(group)}
              >
                ×
              </button>
            </h4>
          )}
          {bar && c.preferences.showGroupNames && (
            <span className="bookmark-group-name">{group}</span>
          )}
          {visibleFavorites
            .filter((f) => f.group === group)
            .map((f) => (
              <div
                key={f.id}
                className={
                  (bar ? "bookmark" : "favorite") +
                  (over === "f:" + f.id ? " drag-over" : "")
                }
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData(favoriteType, f.id);
                  e.dataTransfer.setData("favorite", f.url);
                  e.dataTransfer.effectAllowed = "copyMove";
                  onDrag(true);
                }}
                onDragEnd={finish}
                onDragOver={(e) => allow(e, "f:" + f.id)}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(favoriteType);
                  if (!id) {
                    dropGroup(e, group);
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect(),
                    after = bar
                      ? e.clientX > r.x + r.width / 2
                      : e.clientY > r.y + r.height / 2;
                  onEdit((d) => {
                    d.favorites = moveFavorite(
                      d.favorites,
                      id,
                      group,
                      f.id,
                      after,
                    );
                  });
                  finish();
                }}
              >
                <button
                  title={f.url + "\n" + f.note}
                  onClick={() => onOpen(f.url)}
                >
                  {f.name}
                </button>
                {!bar && (
                  <>
                    <button title="编辑收藏" onClick={() => onFavorite(f.id)}>
                      ✎
                    </button>
                    <button
                      title="删除收藏"
                      onClick={() =>
                        onEdit((d) => {
                          d.favorites = d.favorites.filter(
                            (x) => x.id !== f.id,
                          );
                        })
                      }
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
        </section>
      ))}
    </>
  );
}
