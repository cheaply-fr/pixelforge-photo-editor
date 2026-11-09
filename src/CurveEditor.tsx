'use client';

import { useId, useMemo, useRef, useState } from 'react';
import {
  MAX_CURVE_POINTS,
  MAX_INTERIOR_CURVE_POINTS,
  addCurvePoint,
  evaluateCurve,
  identityCurve,
  moveCurvePointAt,
  normalizeCurvePoints,
  removeCurvePointAt,
  sampleCurve,
  setCurvePoint,
  type CurveInterpolation,
  type CurvePoints,
} from './curves';

export type CurveChangeOptions = {
  /**
   * True for the second and later updates of one pointer drag. Hosts may fold
   * these into the history entry created by the first update so a drag is one
   * undo step.
   */
  continuing?: boolean;
};

type Props = {
  label: string;
  points: CurvePoints;
  interpolation?: CurveInterpolation;
  onChange: (points: CurvePoints, options?: CurveChangeOptions) => void;
};

const WIDTH = 240;
const HEIGHT = 160;
/** Pointer hit radius around a control point, in CSS pixels. */
const MOUSE_HIT_RADIUS = 12;
const TOUCH_HIT_RADIUS = 24;
/** Dragging an interior point this far outside the graph removes it. */
const REMOVE_DISTANCE = 32;

type Drag = {
  pointerId: number;
  index: number;
  start: CurvePoints;
  last: CurvePoints;
  emitted: boolean;
  removed: boolean;
};

const samePoints = (left: CurvePoints, right: CurvePoints) =>
  left.length === right.length &&
  left.every(
    (point, index) =>
      point[0] === right[index][0] && point[1] === right[index][1],
  );

export default function CurveEditor({
  label,
  points,
  interpolation = 'linear',
  onChange,
}: Props) {
  const normalized = useMemo(() => normalizeCurvePoints(points), [points]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const drag = useRef<Drag | null>(null);
  const graph = useRef<HTMLDivElement>(null);
  const handles = useRef<Array<HTMLButtonElement | null>>([]);
  const hintId = useId();
  const active =
    selected !== null && selected < normalized.length ? selected : null;
  const activePoint = active === null ? null : normalized[active];
  const midpoint = sampleCurve(normalized, 128, interpolation);
  const interiorCount = normalized.length - 2;

  const focusHandle = (index: number) =>
    requestAnimationFrame(() =>
      handles.current[index]?.focus({ preventScroll: true }),
    );

  const local = (clientX: number, clientY: number) => {
    const rect = graph.current!.getBoundingClientRect();
    const px = clientX - rect.left,
      py = clientY - rect.top;
    return {
      rect,
      px,
      py,
      x: Math.max(0, Math.min(255, (px / rect.width) * 255)),
      y: Math.max(0, Math.min(255, (1 - py / rect.height) * 255)),
      outside: Math.max(
        -px,
        px - rect.width,
        -py,
        py - rect.height,
        0,
      ),
    };
  };

  const hitTest = (
    rect: DOMRect,
    px: number,
    py: number,
    radius: number,
  ): number => {
    let best = -1,
      bestDistance = Infinity;
    normalized.forEach(([x, y], index) => {
      const distance = Math.hypot(
        (x / 255) * rect.width - px,
        (1 - y / 255) * rect.height - py,
      );
      if (distance <= radius && distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  const emit = (next: CurvePoints, options?: CurveChangeOptions) =>
    onChange(next, options);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A second finger never hijacks a drag; a new primary pointer replaces a
    // drag whose end event was lost.
    if (drag.current && !event.isPrimary) return;
    drag.current = null;
    const { rect, px, py, x, y } = local(event.clientX, event.clientY);
    const radius =
      event.pointerType === 'mouse' ? MOUSE_HIT_RADIUS : TOUCH_HIT_RADIUS;
    let index = hitTest(rect, px, py, radius);
    let start = normalized;
    let emitted = false;
    if (index < 0) {
      const added = addCurvePoint(normalized, x, y);
      if (!added) {
        setStatus(
          normalized.length >= MAX_CURVE_POINTS
            ? `${label} curve already has the maximum of ${MAX_INTERIOR_CURVE_POINTS} interior points`
            : `A ${label} point already uses that input level`,
        );
        return;
      }
      index = added.index;
      start = added.points;
      emitted = true;
      emit(added.points);
      setStatus(
        `${label} point added at input ${added.points[index][0]}, output ${added.points[index][1]}`,
      );
    }
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; moves
      // over the graph still update the drag.
    }
    drag.current = {
      pointerId: event.pointerId,
      index,
      start,
      last: start,
      emitted,
      removed: false,
    };
    setSelected(index);
    focusHandle(index);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const { x, y, outside } = local(event.clientX, event.clientY);
    const interior = state.index > 0 && state.index < state.start.length - 1;
    const removed = interior && outside > REMOVE_DISTANCE;
    const next = removed
      ? removeCurvePointAt(state.start, state.index)
      : moveCurvePointAt(state.start, state.index, x, y);
    state.removed = removed;
    if (samePoints(next, state.last)) return;
    state.last = next;
    emit(next, { continuing: state.emitted });
    state.emitted = true;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (state.removed) {
      setSelected(null);
      setStatus(`${label} point removed`);
    } else {
      const point = state.last[state.index];
      if (state.emitted && point)
        setStatus(
          `${label} point at input ${point[0]}, output ${point[1]}`,
        );
    }
  };

  const removeAt = (index: number) => {
    if (index <= 0 || index >= normalized.length - 1) return;
    emit(removeCurvePointAt(normalized, index));
    setStatus(`${label} point removed`);
    const nextIndex = index - 1;
    setSelected(nextIndex);
    focusHandle(nextIndex);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const { rect, px, py } = local(event.clientX, event.clientY);
    const index = hitTest(rect, px, py, MOUSE_HIT_RADIUS);
    if (index > 0 && index < normalized.length - 1) removeAt(index);
  };

  const onHandleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step = event.shiftKey ? 10 : 1;
    const [x, y] = normalized[index];
    let next: CurvePoints | null = null;
    if (event.key === 'ArrowLeft') next = moveCurvePointAt(normalized, index, x - step, y);
    else if (event.key === 'ArrowRight') next = moveCurvePointAt(normalized, index, x + step, y);
    else if (event.key === 'ArrowUp') next = moveCurvePointAt(normalized, index, x, y + step);
    else if (event.key === 'ArrowDown') next = moveCurvePointAt(normalized, index, x, y - step);
    else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeAt(index);
      return;
    } else return;
    event.preventDefault();
    setSelected(index);
    if (!samePoints(next, normalized)) emit(next);
  };

  const curvePath = useMemo(() => {
    const coordinates: string[] = [];
    for (let input = 0; input <= 255; input += 1) {
      const output = evaluateCurve(normalized, input, interpolation);
      coordinates.push(
        `${((input / 255) * WIDTH).toFixed(2)},${(HEIGHT - (output / 255) * HEIGHT).toFixed(2)}`,
      );
    }
    return coordinates.join(' ');
  }, [normalized, interpolation]);

  const editSelected = (axis: 0 | 1, value: string) => {
    if (active === null || value.trim() === '') return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const [x, y] = normalized[active];
    const next =
      axis === 0
        ? moveCurvePointAt(normalized, active, number, y)
        : moveCurvePointAt(normalized, active, x, number);
    if (!samePoints(next, normalized)) emit(next);
  };

  const endpoint = (index: number) =>
    index === 0 || index === normalized.length - 1;

  return (
    <fieldset
      className="curve-editor"
      aria-label={`${label} curve editor`}
      data-point-count={normalized.length}
    >
      <div className="curve-editor__header">
        <strong>{label}</strong>
        <span className="curve-editor__count">
          {interiorCount}/{MAX_INTERIOR_CURVE_POINTS} points
        </span>
        <button
          type="button"
          className="curve-editor__reset"
          onClick={() => {
            onChange(identityCurve);
            setSelected(null);
            setStatus(`${label} curve reset`);
          }}
          aria-label={`Reset ${label} curve`}
        >
          Reset
        </button>
      </div>
      <p id={hintId} className="curve-editor__hint">
        Click or tap the graph to add a point and drag to move it. Drag a
        point off the graph, double-click it or press Delete to remove it.
        Arrow keys move a focused point by 1, Shift+Arrow by 10.
      </p>
      <div
        ref={graph}
        className="curve-editor__graph"
        data-testid={`${label.toLowerCase()}-curve-graph`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="curve-editor__grid"
            d={`M0 ${HEIGHT / 4}H${WIDTH}M0 ${HEIGHT / 2}H${WIDTH}M0 ${(HEIGHT * 3) / 4}H${WIDTH}M${WIDTH / 4} 0V${HEIGHT}M${WIDTH / 2} 0V${HEIGHT}M${(WIDTH * 3) / 4} 0V${HEIGHT}`}
          />
          <path
            className="curve-editor__diagonal"
            d={`M0 ${HEIGHT}L${WIDTH} 0`}
          />
          <polyline className="curve-editor__line" points={curvePath} />
        </svg>
        {normalized.map(([x, y], index) => (
          <button
            // Index keys keep focus on a handle while its input level moves.
            key={index}
            ref={(node) => {
              handles.current[index] = node;
            }}
            type="button"
            className={`curve-editor__point${endpoint(index) ? ' curve-editor__point--endpoint' : ''}${active === index ? ' is-selected' : ''}`}
            style={{
              left: `${(x / 255) * 100}%`,
              top: `${(1 - y / 255) * 100}%`,
            }}
            aria-label={`${label} curve ${endpoint(index) ? (index === 0 ? 'black endpoint' : 'white endpoint') : `point ${index}`}: input ${x}, output ${y}`}
            aria-describedby={hintId}
            aria-pressed={active === index}
            data-input={x}
            data-output={y}
            onFocus={() => setSelected(index)}
            onKeyDown={(event) => onHandleKeyDown(event, index)}
          />
        ))}
      </div>
      <output className="curve-editor__status" aria-live="polite">
        {status}
      </output>
      {activePoint && active !== null && (
        <div className="curve-editor__point-fields">
          <label>
            <span>Input</span>
            <input
              type="number"
              min={0}
              max={255}
              step={1}
              value={activePoint[0]}
              disabled={endpoint(active)}
              aria-label={`${label} selected point input`}
              onChange={(event) => editSelected(0, event.target.value)}
            />
          </label>
          <label>
            <span>Output</span>
            <input
              type="number"
              min={0}
              max={255}
              step={1}
              value={activePoint[1]}
              aria-label={`${label} selected point output`}
              onChange={(event) => editSelected(1, event.target.value)}
            />
          </label>
          <button
            type="button"
            className="curve-editor__remove"
            disabled={endpoint(active)}
            onClick={() => removeAt(active)}
            aria-label={`Remove selected ${label} point`}
          >
            Remove point
          </button>
        </div>
      )}
      <label className="curve-editor__fallback">
        <span>{label} midpoint</span>
        <input
          type="range"
          min={0}
          max={255}
          value={midpoint}
          aria-label={`${label} midpoint`}
          onChange={(event) => {
            if (
              normalized.length >= MAX_CURVE_POINTS &&
              !normalized.some(([x]) => x === 128)
            ) {
              setStatus(
                `${label} curve already has the maximum of ${MAX_INTERIOR_CURVE_POINTS} interior points`,
              );
              return;
            }
            onChange(
              setCurvePoint(normalized, 128, Number(event.target.value)),
            );
          }}
        />
        <output>{midpoint}</output>
      </label>
    </fieldset>
  );
}
