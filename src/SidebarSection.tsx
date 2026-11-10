import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { SECTION_ATTRIBUTE, SIDEBAR_SECTIONS, type SidebarSectionId } from './sidebarSections.ts';

/**
 * A collapsible properties-sidebar panel registered in `sidebarSections.ts`.
 * The header title is a disclosure button (`aria-expanded`/`aria-controls`);
 * the optional action button (Reset, Clear, …) stays separate.
 */
export function SidebarSection({
  id,
  icon: Icon,
  title,
  collapsed,
  onToggle,
  action,
  onAction,
  className,
  testId,
  children,
}: {
  id: SidebarSectionId;
  icon: LucideIcon;
  title: string;
  collapsed: boolean;
  onToggle: (id: SidebarSectionId) => void;
  action?: ReactNode;
  onAction?: () => void;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const bodyId = `sidebar-section-${id}-body`;
  const collapsible = SIDEBAR_SECTIONS[id].collapsible;
  const attributes = { [SECTION_ATTRIBUTE]: id };
  return (
    <section
      className={`panel sidebar-section${className ? ` ${className}` : ''}`}
      aria-label={title}
      data-collapsed={collapsible && collapsed ? 'true' : 'false'}
      data-testid={testId}
      {...attributes}
    >
      <div className="panel-title">
        {collapsible ? (
          <button
            type="button"
            className="panel-toggle"
            data-sidebar-section-toggle=""
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => onToggle(id)}
          >
            <Icon aria-hidden="true" />
            <span>{title}</span>
            <ChevronDown className="panel-chevron" aria-hidden="true" />
          </button>
        ) : (
          <span>
            <Icon aria-hidden="true" />
            {title}
          </span>
        )}
        {action && (
          <button type="button" onClick={onAction}>
            {action}
          </button>
        )}
      </div>
      <div id={bodyId} className="panel-body" hidden={collapsible && collapsed}>
        {children}
      </div>
    </section>
  );
}
