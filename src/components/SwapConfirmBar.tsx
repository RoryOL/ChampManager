type PickState = {
  first: string | null;
  second: string | null;
};

export function nextSwapPick(first: string | null, second: string | null, name: string): PickState {
  if (!first) return { first: name, second: null };
  if (first === name) return { first: second, second: null };
  if (second === name) return { first, second: null };
  return { first, second: name };
}

type Props = {
  first: string | null;
  second: string | null;
  onSwap: () => void;
  onClear: () => void;
  disabled?: boolean;
  hint?: string;
};

export function SwapConfirmBar({ first, second, onSwap, onClear, disabled = false, hint }: Props) {
  return (
    <div className="swap-bar">
      <div className="swap-bar__row">
        <p className="swap-bar__picks">
          <span className={first ? "is-set" : ""}>{first ?? "First player"}</span>
          <span className="swap-bar__swap">↔</span>
          <span className={second ? "is-set" : ""}>{second ?? "Second player"}</span>
        </p>
        <div className="row-actions">
          <button type="button" className="btn" disabled={!first || !second || disabled} onClick={onSwap}>
            Swap
          </button>
          <button type="button" className="btn btn--ghost" disabled={!first && !second} onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {hint ? <p className="hint hint--tight">{hint}</p> : null}
    </div>
  );
}
