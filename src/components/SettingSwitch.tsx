export function SettingSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="setting-switch"
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
