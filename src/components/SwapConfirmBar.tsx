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
  const selected = first ? `${first}${second ? ` and ${second}` : ""}` : null;
  return (
    <div className="swap-bar">
      <p className="hint hint--tight">
        {hint ?? "Tap two players, then Swap to change positions or bring someone on."}
        {selected ? ` Selected: ${selected}.` : ""}
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
  );
}
