import { HELP_SECTIONS } from "../lib/help";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="help-btn" aria-label="Help" onClick={onOpen}>
      ?
    </button>
  );
}

export function HelpSheet({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="help-scrim" role="presentation" onClick={onClose}>
      <section
        className="help-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="help-sheet__bar">
          <h2 id="help-title">Help</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="help-sheet__body">
          {HELP_SECTIONS.map((section) => (
            <article key={section.id}>
              <h3>{section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
