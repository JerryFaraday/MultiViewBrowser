import { useState } from "react";
import { useModalFocus } from "./useModalFocus";
export function NameEditor({
  title,
  initial,
  onDone,
}: {
  title: string;
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useModalFocus(() => onDone(null));
  return (
    <form
      ref={ref}
      className="modal name-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-editor-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onDone(value.trim());
      }}
    >
      <div className="modal-title">
        <h2 id="name-editor-title">{title}</h2>
        <button
          type="button"
          aria-label="关闭编辑"
          onClick={() => onDone(null)}
        >
          ×
        </button>
      </div>
      <label>
        {title.includes("分组") ? "分组名称" : "名称"}
        <input
          autoFocus
          required
          value={value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {!value.trim() && <p role="status">请输入名称，不能仅包含空格。</p>}
      <div className="form-actions">
        <button type="button" onClick={() => onDone(null)}>
          取消
        </button>
        <button className="primary" disabled={!value.trim()} type="submit">
          保存
        </button>
      </div>
    </form>
  );
}
