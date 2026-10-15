import { useEffect, useRef, useState } from 'react';
import { FONTS } from './document.ts';

export default function UpdateTextLayersDialog({
  initialFont,
  initialSize,
  count,
  close,
  apply,
}: {
  initialFont: (typeof FONTS)[number];
  initialSize: number;
  count: number;
  close: () => void;
  apply: (font: (typeof FONTS)[number], size: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [font, setFont] = useState<(typeof FONTS)[number]>(initialFont);
  const [size, setSize] = useState(String(initialSize));
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog update-text-layers-dialog" aria-labelledby="update-text-layers-title" onCancel={close}>
      <form onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number(size);
        if (Number.isFinite(parsed)) apply(font, Math.max(1, Math.min(1000, Math.round(parsed))));
      }}>
        <h2 id="update-text-layers-title">Update All Text Layers</h2>
        <p>Apply the selected font and size to {count} editable text layer{count === 1 ? '' : 's'}. Raster and vector layers are unchanged.</p>
        <label className="select-row"><span>Font</span><select aria-label="Text font" value={font} onChange={(event) => setFont(event.target.value as (typeof FONTS)[number])}>{FONTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="select-row"><span>Size</span><input aria-label="Text size" className="text-input" type="number" min="1" max="1000" value={size} onChange={(event) => setSize(event.target.value)} /></label>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Update text</button></div>
      </form>
    </dialog>
  );
}
