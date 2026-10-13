import { useEffect, useRef, useState } from 'react';
import { COLOR_PROFILES, type ColorProfile } from './colorProfile';

export default function ColorSettingsDialog({ value, close, apply }: { value: ColorProfile; close: () => void; apply: (value: ColorProfile) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState<ColorProfile>(value);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog color-settings-dialog" aria-labelledby="color-settings-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(profile); }}>
        <h2 id="color-settings-title">Color Settings</h2>
        <p>Store a working color-profile label in the editable project. PixelForge keeps pixels source-safe and does not silently convert or embed browser-specific profiles.</p>
        <label className="select-row"><span>Working profile</span><select aria-label="Working color profile" value={profile} onChange={(event) => setProfile(event.target.value as ColorProfile)}>
          {COLOR_PROFILES.map((item) => <option key={item} value={item}>{item === 'srgb' ? 'sRGB IEC 61966-2.1' : 'Display P3'}</option>)}
        </select></label>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Apply</button></div>
      </form>
    </dialog>
  );
}
