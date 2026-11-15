import { useModalFocus } from "./useModalFocus";
import { useState } from "react";
import { favoriteSchema, normalizeUrl, type Config } from "../core/model";
import {
  identifyLiveUrl,
  favoriteLiveUrl,
  type LiveCategory,
} from "../core/LiveStatus";
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
  const modalRef = useModalFocus(onCancel);
  const isLive = draft.category !== "web";
  const detected = (() => {
    try {
      return identifyLiveUrl(draft.url);
    } catch {
      return null;
    }
  })();
  return (
    <form
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="favorite-editor-title"
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
                draft.category !== "web"
                  ? favoriteLiveUrl(draft.roomId, draft.url, draft.category)
                  : normalizeUrl(draft.url.trim()),
            }),
          );
        } catch {
          setError("请填写名称和有效地址；直播间仅接受有效的纯数字房号。");
        }
      }}
    >
      <div className="modal-title">
        <h2 id="favorite-editor-title">{editing ? "编辑收藏" : "新建收藏"}</h2>
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
        类型
        <select
          aria-label="标签类别"
          value={isLive ? "live" : "web"}
          onChange={(e) => {
            try {
              if (e.target.value === "live") {
                if (editing && !detected) throw Error();
                setDraft({
                  ...draft,
                  category: detected?.category ?? "bilibili-live",
                  roomId: detected?.roomId ?? "",
                  liveCache: null,
                  url: detected ? draft.url : "",
                });
              } else
                setDraft({
                  ...draft,
                  category: "web",
                  roomId: "",
                  liveCache: null,
                  url: (() => {
                    try {
                      return draft.category === "web"
                        ? draft.url
                        : favoriteLiveUrl(
                            draft.roomId,
                            draft.url,
                            draft.category,
                          );
                    } catch {
                      return draft.url;
                    }
                  })(),
                });
              setError("");
            } catch {
              setError(
                "原网址必须是B站或斗鱼直播间的数字房号地址，才能转换为直播间网页。",
              );
            }
          }}
        >
          <option value="web">普通网页</option>
          <option value="live" disabled={editing && !isLive && !detected}>
            直播间网页
          </option>
        </select>
      </label>
      {editing && !isLive && !detected && (
        <small>
          当前网址不是支持的B站或斗鱼数字房号地址，无法转换为直播间网页。
        </small>
      )}
      <label>
        {isLive ? "直播间号" : "网址"}
        {isLive && (
          <select
            aria-label="直播平台"
            value={draft.category}
            onChange={(e) => {
              setDraft({
                ...draft,
                category: e.target.value as LiveCategory,
                roomId: "",
                url: "",
                liveCache: null,
              });
              setError("");
            }}
          >
            <option value="bilibili-live">https://live.bilibili.com/</option>
            <option value="douyu-live">https://www.douyu.com/</option>
          </select>
        )}
        <input
          required
          aria-label={isLive ? "直播间号" : "网址"}
          inputMode={isLive ? "numeric" : "url"}
          pattern={isLive ? "[0-9]+" : undefined}
          placeholder={
            isLive ? "纯数字直播间号" : "https://live.bilibili.com/…"
          }
          value={isLive ? draft.roomId : draft.url}
          onChange={(e) =>
            setDraft({
              ...draft,
              ...(isLive
                ? { roomId: e.target.value.replace(/^0+(?=\d)/, "") }
                : { url: e.target.value }),
            })
          }
        />
      </label>
      <label>
        所属分组
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
        备注（可选）
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
