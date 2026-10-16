import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

type Item = { id: string; label: string; key: string; icon: LucideIcon };

/** A single viewport-contained menu, outside the scrolling toolbar. */
export function ToolFlyout({
  label, trigger, items, selected, onSelect, onClose,
}: {
  label: string;
  trigger: HTMLButtonElement;
  items: Item[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 16);
    const height = Math.min(items.length * 44 + 12, window.innerHeight - 16);
    const frame = requestAnimationFrame(() => {
      setPosition({
        left: Math.max(8, Math.min(rect.right + 6, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)),
      });
      menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [trigger, items.length]);
  useLayoutEffect(() => {
    const close = (event: Event) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.contains(event.target as Node)) {
        onClose();
        if (event.type === 'pointerdown') trigger.focus();
      }
    };
    const dismiss = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', dismiss);
    // Focus can scroll the toolbar after the flyout has mounted. Attach the
    // scroll listener after two frames so that keyboard opening does not
    // immediately dismiss the popup during that settling scroll.
    let scrollFrame = requestAnimationFrame(() => {
      scrollFrame = requestAnimationFrame(() =>
        window.addEventListener('scroll', close, true),
      );
    });
    return () => {
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', close, true);
    };
  }, [trigger, onClose]);
  return createPortal(
    <div
      ref={menu}
      className="tool-flyout"
      role="menu"
      tabIndex={-1}
      aria-label={`${label} subtools`}
      aria-labelledby={trigger.id}
      style={position}
      onKeyDown={(event) => {
        event.stopPropagation();
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        } else if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          onClose();
          trigger.focus();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          aria-label={item.label}
          className={selected === item.id ? 'active' : ''}
          onClick={() => {
            onSelect(item.id);
            trigger.focus();
          }}
        >
          <span className="tool-flyout-label">
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </span>
          <kbd aria-hidden="true">{item.key}</kbd>
        </button>
      ))}
    </div>, document.body,
  );
}
