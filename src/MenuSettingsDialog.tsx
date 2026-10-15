import { useEffect, useRef, useState } from 'react';

type Props = {
  showDisabled: boolean;
  close: () => void;
  apply: (showDisabled: boolean) => void;
};

export default function MenuSettingsDialog({
  showDisabled,
  close,
  apply,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [nextShowDisabled, setNextShowDisabled] = useState(showDisabled);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="editor-dialog menu-settings-dialog"
      aria-labelledby="menu-settings-title"
      onCancel={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(nextShowDisabled);
        }}
      >
        <h2 id="menu-settings-title">Menus</h2>
        <p>
          Keep disabled roadmap commands visible as a capability map, or hide
          them to keep the working menus compact. This workspace preference is
          stored only in this browser and does not change document data.
        </p>
        <label className="menu-settings-option">
          <input
            type="checkbox"
            aria-label="Show disabled roadmap commands"
            checked={nextShowDisabled}
            onChange={(event) => setNextShowDisabled(event.target.checked)}
          />
          <span>Show disabled roadmap commands</span>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit">Apply menu settings</button>
        </div>
      </form>
    </dialog>
  );
}
