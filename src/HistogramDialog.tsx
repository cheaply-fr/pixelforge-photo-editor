import { useEffect, useMemo, useRef, useState } from 'react';
import { histogramPeak, type HistogramChannel, type HistogramData } from './histogram';

const CHANNELS: { id: HistogramChannel; label: string; colour: string }[] = [
  { id: 'luminance', label: 'Luminance', colour: '#f2f2f2' },
  { id: 'red', label: 'Red', colour: '#ff6b6b' },
  { id: 'green', label: 'Green', colour: '#70d889' },
  { id: 'blue', label: 'Blue', colour: '#70a7ff' },
];

export default function HistogramDialog({ data, close }: { data: HistogramData; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [channel, setChannel] = useState<HistogramChannel>('luminance');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const channelInfo = CHANNELS.find((item) => item.id === channel) || CHANNELS[0];
  const values = data[channel];
  const peak = histogramPeak(values);
  const bars = useMemo(() => values.map((value) => (peak ? Math.max(1, Math.round((value / peak) * 100)) : 1)), [peak, values]);
  return (
    <dialog ref={dialog} className="editor-dialog histogram-dialog" aria-labelledby="histogram-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="histogram-title">Histogram</h2>
        <p>Rendered composite analysis. The document, source assets and history remain unchanged.</p>
        <label className="select-row"><span>Channel</span><select aria-label="Histogram channel" value={channel} onChange={(event) => setChannel(event.target.value as HistogramChannel)}>
          {CHANNELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <figure className="histogram-chart" aria-label={`${channelInfo.label} histogram`}>
          {bars.map((height, index) => <i key={index} aria-hidden="true" style={{ height: `${height}%`, backgroundColor: channelInfo.colour }} />)}
        </figure>
        <dl className="histogram-stats">
          <div><dt>Visible pixels</dt><dd>{data.visiblePixels.toLocaleString()}</dd></div>
          <div><dt>Mean luminance</dt><dd>{data.mean.toFixed(1)}</dd></div>
          <div><dt>Range</dt><dd>{data.minimum}–{data.maximum}</dd></div>
          <div><dt>Alpha total</dt><dd>{data.alphaSum.toLocaleString()}</dd></div>
        </dl>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button></div>
      </form>
    </dialog>
  );
}

