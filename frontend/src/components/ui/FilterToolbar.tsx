import type { ReactNode } from "react";

type FilterToolbarProps = {
  children: ReactNode;
};

// Borderless toolbar: filters sit directly on the page instead of in a card.
export default function FilterToolbar({ children }: FilterToolbarProps) {
  return <div className="filter-toolbar">{children}</div>;
}
