import { SuggestionPrompt } from "@/components/chat/chat-data";

export function SuggestionPrompts({
  suggestions,
  onSelect
}: {
  suggestions: SuggestionPrompt[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="grid gap-2 px-4 pb-3 md:grid-cols-2 md:px-6 2xl:grid-cols-4">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => onSelect(suggestion.text)}
          className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-left text-xs leading-5 text-[var(--color-text-muted)] transition hover:border-[color:var(--color-border-strong)] hover:bg-[var(--color-hover)]"
        >
          {suggestion.text}
        </button>
      ))}
    </div>
  );
}
