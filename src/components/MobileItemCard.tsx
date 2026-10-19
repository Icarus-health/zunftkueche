import { Children, Fragment, cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
export function MobileItemCard({title, subtitle, children, actions}: {
  title: ReactNode; subtitle?: ReactNode; children?: ReactNode; actions?: ReactNode;
}) {
  return <article className="mobile-item-card">
    <header><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</header>
    {children}<footer>{actions}</footer>
  </article>;
}
type Element = ReactElement<{children?: ReactNode; colSpan?: number; 'data-label'?: string}>;
function elements(children: ReactNode): Element[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    const element = child as Element;
    return element.type === Fragment ? elements(element.props.children) : [element];
  });
}
function text(children: ReactNode): string {
  return Children.toArray(children).map(child =>
    isValidElement(child) ? text((child as Element).props.children) : String(child)).join(' ').trim();
}
/** One set of controls and facts: comparison table on desktop, labelled rows on phones. */
export function ResponsiveTable({children, className = ''}: {children: ReactNode; className?: string}) {
  const sections = elements(children);
  const head = sections.find(section => section.type === 'thead');
  const firstRow = elements(head?.props.children)[0];
  const labels = elements(firstRow?.props.children).flatMap(cell =>
    Array.from({length: cell.props.colSpan ?? 1}, () => text(cell.props.children)));
  return <table className={`responsive-table ${className}`}>
    {sections.map((section, index) => section.type !== 'tbody' ? section : cloneElement(section, {key: section.key ?? index},
      elements(section.props.children).map((row, rowIndex) => {
        let column = 0;
        return cloneElement(row, {key: row.key ?? rowIndex}, elements(row.props.children).map((cell, cellIndex) => {
          const label = labels[column] || 'Aktion';
          column += cell.props.colSpan ?? 1;
          return typeof cell.type === 'string' ? cloneElement(cell, {
            key: cell.key ?? cellIndex, 'data-label': cell.props['data-label'] ?? label,
          }) : cell;
        }));
      }))) }
  </table>;
}
