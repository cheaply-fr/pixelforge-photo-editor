import { useEffect, useRef, useState } from 'react';
import { COLOR_PROFILES, type ColorProfile } from './colorProfile';

type Operation = 'assign' | 'convert';

export default function ColorProfileDialog({
  current,
  operation,
  close,
  apply,
}: {
  current: ColorProfile;
  operation: Operation;
  close: () => void;
  apply: (profile: ColorProfile) => Promise<void> | void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState<ColorProfile>(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const assigning = operation === 'assign';
  return (
    <dialog
      ref={dialog}
      className="editor-dialog color-profile-dialog"
      aria-labelledby="color-profile-title"
      onCancel={busy ? (event) => event.preventDefault() : close}
    >
      <form onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try { await apply(profile); } finally { setBusy(false); }
      }}>
        <h2 id="color-profile-title">{assigning ? 'Assign Profile' : 'Convert to Profile'}</h2>
        <p>
          {assigning
            ? 'Change the document profile label without changing RGB bytes. This changes how the local working data is interpreted.'
            : 'Convert raster and embedded smart-object pixels with a bounded D65 matrix transform. Undo retains the original assets; ICC embedding and authored vector/text colour conversion remain separate contracts.'}
        </p>
        <label className="select-row">
          <span>Target profile</span>
          <select aria-label="Target color profile" value={profile} onChange={(event) => setProfile(event.target.value as ColorProfile)} disabled={busy}>
            {COLOR_PROFILES.map((item) => <option key={item} value={item}>{item === 'srgb' ? 'sRGB IEC 61966-2.1' : 'Display P3'}</option>)}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Converting…' : assigning ? 'Assign Profile' : 'Convert to Profile'}</button>
        </div>
      </form>
    </dialog>
  );
}
