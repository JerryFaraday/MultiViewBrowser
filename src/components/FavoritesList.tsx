import { useState, useRef, useEffect } from "react";
import { SettingsIcon } from "./SettingsIcon";
import type { DragEvent } from "react";
import type { Config } from "../core/model";
import { liveKey, liveLabel, type LiveStates } from "../core/LiveStatus";
import {
  moveItem,
  moveFavorite,
  searchFavorites,
  renameFavoriteGroup,
} from "../core/FavoritesManager";
type Props = {
  config: Config;
  query?: string;
  bar?: boolean;
  liveStates?: LiveStates;
  onEdit: (fn: (c: Config) => void) => void;
  onOpen: (url: string) => void;
  onFavorite: (id: string) => void;
  onGroupRename: (group: string, name: string) => void;
  onGroupDelete: (group: string) => void;
  onDrag: (value: boolean) => void;
};
const groupType = "application/x-mvb-group",
  favoriteType = "application/x-mvb-favorite";
export function FavoritesList({
  config: c,
  query = "",
  bar = false,
  liveStates = {},
  onEdit,
  onOpen,
  onFavorite,
  onGroupRename,
  onGroupDelete,
  onDrag,
}: Props) {
  const [over, setOver] = useState("");
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  const saveGroup = (group: string) => {
    try {
      renameFavoriteGroup(structuredClone(c), group, name);
      onGroupRename(group, name.trim());
      setEditing(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "分组名称无效。");
    }
  };
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
            c.preferences.showBookmarkGroups &&
            i > 0 && (
              <span className="bookmark-separator" aria-hidden="true">
                |
              </span>
            )
          ) : (
            <h4
              draggable={editing !== group}
              onDragStart={(e) => {
                e.dataTransfer.setData(groupType, group);
                e.dataTransfer.effectAllowed = "move";
                onDrag(true);
              }}
              onDragEnd={finish}
              title="拖动分组标题调整顺序"
            >
              <span className="group-grip">⠿</span>
              {editing === group ? (
                <input
                  ref={inputRef}
                  className="group-name-input"
                  aria-label="分组名称"
                  maxLength={100}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      saveGroup(group);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditing(null);
                      setError("");
                    }
                  }}
                />
              ) : (
                <span className="group-name" title={group}>
                  {group}
                </span>
              )}
              <button
                className={
                  "favorite-action " + (editing === group ? "save-action" : "")
                }
                aria-label={editing === group ? "保存分组" : "编辑分组"}
                title={editing === group ? "保存分组" : "编辑分组"}
                onClick={() =>
                  editing === group
                    ? saveGroup(group)
                    : (setEditing(group), setName(group), setError(""))
                }
              >
                <SettingsIcon name={editing === group ? "check" : "pencil"} />
              </button>
              <button
                className={
                  "favorite-action " +
                  (editing === group ? "cancel-action" : "")
                }
                aria-label={editing === group ? "取消编辑分组" : "删除分组"}
                title={
                  editing === group
                    ? "取消编辑分组"
                    : "删除分组，收藏移至未分组"
                }
                onClick={() => {
                  if (editing === group) {
                    setEditing(null);
                    setError("");
                    return;
                  }
                  if (window.confirm("删除此分组？其中的收藏将移至未分组。"))
                    onGroupDelete(group);
                }}
              >
                <SettingsIcon name={editing === group ? "x" : "trash"} />
              </button>
            </h4>
          )}
          {!bar && editing === group && error && (
            <p className="group-error" role="alert">
              {error}
            </p>
          )}
          {bar &&
            c.preferences.showBookmarkGroups &&
            c.preferences.showGroupNames && (
              <span className="bookmark-group-name">{group}</span>
            )}
          {!bar && !visibleFavorites.some((f) => f.group === group) && (
            <p className="empty-state">
              此分组暂无收藏，可添加收藏或拖入已有收藏。
            </p>
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
                  title={f.name + "\n" + f.url + "\n" + f.note}
                  onClick={() => onOpen(f.url)}
                >
                  <span className={bar ? "bookmark-name" : undefined}>
                    {f.name}
                  </span>
                  {bar &&
                    c.bookmarksBar &&
                    c.preferences.liveDetection &&
                    f.category !== "web" && (
                      <span
                        role="img"
                        aria-label={liveLabel(liveStates[liveKey(f)])}
                        title={liveLabel(liveStates[liveKey(f)])}
                        className={
                          "live-dot " +
                          (liveStates[liveKey(f)]?.status ?? "unknown")
                        }
                      />
                    )}
                </button>
                {!bar && (
                  <>
                    <button
                      aria-label="编辑收藏"
                      className="favorite-action"
                      title="编辑收藏"
                      onClick={() => onFavorite(f.id)}
                    >
                      <SettingsIcon name="pencil" />
                    </button>
                    <button
                      aria-label="删除收藏"
                      className="favorite-action"
                      title="删除收藏"
                      onClick={() =>
                        window.confirm(
                          "删除此收藏？此操作不会关闭已打开的网页。",
                        ) &&
                        onEdit((d) => {
                          d.favorites = d.favorites.filter(
                            (x) => x.id !== f.id,
                          );
                        })
                      }
                    >
                      <SettingsIcon name="trash" />
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
