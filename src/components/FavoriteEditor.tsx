import { useState } from "react";
import { favoriteSchema, normalizeUrl, type Config } from "../core/model";
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
              url: normalizeUrl(draft.url.trim()),
            }),
          );
        } catch {
          setError(
            "请填写收藏名称和有效的 HTTP / HTTPS 地址，并检查字段长度。",
          );
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
        网址
        <input
          required
          placeholder="https://live.bilibili.com/…"
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
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
