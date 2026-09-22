import type { PageId } from "../types";

const items: { id: PageId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "M12 4 4 10v10h5v-6h6v6h5V10z" },
  { id: "squad", label: "Squad", icon: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8v-1a5 5 0 0 1 10 0v1zm10-9a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm2 9v-1a5 5 0 0 0-2.3-4.2 6.7 6.7 0 0 1 5.3 5.2V20z" },
  { id: "tactics", label: "Tactics", icon: "M4 6h16v2H4zm0 5h10v2H4zm0 5h16v2H4z" },
  { id: "fixtures", label: "Matches", icon: "M5 4h14a1 1 0 0 1 1 1v15H4V5a1 1 0 0 1 1-1zm2 4h10v2H7zm0 4h7v2H7z" },
  { id: "table", label: "Table", icon: "M4 5h16v3H4zm0 5h16v9H4zm3 2v5h2v-5z" },
];

type Props = {
  page: PageId;
  onChange: (page: PageId) => void;
};

export function BottomNav({ page, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            page === item.id || ((page === "training" || page === "development") && item.id === "squad")
              ? "is-active"
              : ""
          }
          onClick={() => onChange(item.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.icon} />
          </svg>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
