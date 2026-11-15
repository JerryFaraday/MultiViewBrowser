import { useState } from "react";
import { favoriteSchema, normalizeUrl, type Config } from "../core/model";
import { roomFromUrl, favoriteLiveUrl } from "../core/LiveStatus";
export type Favorite = Config["favorites"][number];
export function FavoriteEditor({
  initial,
  groups,
  onSave,
  onCancel,
  editing,
}: {
  editing: boolean;
  initial: Favorite;
  groups: string[];
  onSave: (f: Favorite) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [creatingGroup, setCreatingGroup] = useState(false),
    [newGroup, setNewGroup] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="modal favorite-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (creatingGroup && !newGroup.trim()) {
            setError("请输入新分组名称。");
            return;
          }
          onSave(
            favoriteSchema.parse({
              ...draft,
              name: draft.name.trim(),
              group: (creatingGroup ? newGroup : draft.group).trim() || "常用",
              url:
                draft.category === "bilibili-live"
                  ? favoriteLiveUrl(draft.roomId, draft.url)
                  : normalizeUrl(draft.url.trim()),
            }),
          );
        } catch {
          setError("请填写名称和有效地址；直播间仅接受有效的纯数字房号。");
        }
      }}
    >
      <div className="modal-title">
        <h2>{editing ? "编辑收藏" : "添加收藏"}</h2>
        <button type="button" aria-label="关闭收藏编辑" onClick={onCancel}>
          ×
        </button>
      </div>
      <label>
        名称
        <input
          autoFocus
          required
          maxLength={200}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        类别
        <select
          aria-label="标签类别"
          value={draft.category}
          onChange={(e) => {
            const category = e.target.value as Favorite["category"];
            try {
              if (category === "bilibili-live") {
                let id = "";
                if (editing) id = roomFromUrl(draft.url);
                else
                  try {
                    id = roomFromUrl(draft.url);
                  } catch {}
                setDraft({
                  ...draft,
                  category,
                  roomId: id,
                  url: editing && id ? draft.url : "",
                });
              } else
                setDraft({
                  ...draft,
                  category,
                  roomId: "",
                  url: (() => {
                    try {
                      return favoriteLiveUrl(draft.roomId, draft.url);
                    } catch {
                      return draft.url;
                    }
                  })(),
                });
              setError("");
            } catch {
              setError(
                "原网址必须是 live.bilibili.com 的数字房号路径，才能转换为B站直播间。",
              );
            }
          }}
        >
          <option value="web">普通网页</option>
          <option value="bilibili-live">B站直播间</option>
        </select>
      </label>
      <label>
        {draft.category === "bilibili-live" ? "直播间号" : "网址"}
        <input
          required
          aria-label={draft.category === "bilibili-live" ? "直播间号" : "网址"}
          inputMode={draft.category === "bilibili-live" ? "numeric" : "url"}
          pattern={draft.category === "bilibili-live" ? "[0-9]+" : undefined}
          placeholder={
            draft.category === "bilibili-live"
              ? "纯数字直播间号"
              : "https://live.bilibili.com/…"
          }
          value={draft.category === "bilibili-live" ? draft.roomId : draft.url}
          onChange={(e) =>
            setDraft({
              ...draft,
              ...(draft.category === "bilibili-live"
                ? { roomId: e.target.value.replace(/^0+(?=\d)/, "") }
                : { url: e.target.value }),
            })
          }
        />
      </label>
      <label>
        分组
        <select
          aria-label="收藏分组"
          disabled={creatingGroup}
          value={draft.group}
          onChange={(e) => setDraft({ ...draft, group: e.target.value })}
        >
          {[...new Set([...groups, draft.group].filter(Boolean))].map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <div className="favorite-group-actions">
        <button
          type="button"
          onClick={() => {
            setCreatingGroup(!creatingGroup);
            setError("");
          }}
        >
          {creatingGroup ? "使用已有分组" : "新建分组"}
        </button>
      </div>
      {creatingGroup && (
        <label>
          新分组名称
          <input
            autoFocus
            aria-label="新分组名称"
            required
            maxLength={100}
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
          />
        </label>
      )}
      <label>
        备注
        <textarea
          rows={3}
          maxLength={2000}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="primary">
          保存收藏
        </button>
      </div>
    </form>
  );
}
