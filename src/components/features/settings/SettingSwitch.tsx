/**
 * An on/off switch (`role="switch"`). The visible track is 44 by 26; the button
 * around it is 44 tall so it is an easy touch target. The label and the helper
 * text live next to it and are linked by id.
 */
export default function SettingSwitch({
  id,
  checked,
  onChange,
  labelledBy,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="st-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="st-switch-track" aria-hidden="true">
        <span className="st-switch-knob" />
      </span>
    </button>
  );
}
