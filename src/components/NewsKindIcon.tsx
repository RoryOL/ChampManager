import type { NewsKind } from "../types";
import { NEWS_KIND_ICON, NEWS_KIND_LABEL } from "../lib/news";

type Props = {
  kind: NewsKind;
  className?: string;
};

export function NewsKindIcon({ kind, className }: Props) {
  return (
    <span
      className={`news-kind-icon news-kind-icon--${kind}${className ? ` ${className}` : ""}`}
      title={NEWS_KIND_LABEL[kind]}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24">
        <path d={NEWS_KIND_ICON[kind]} />
      </svg>
    </span>
  );
}
