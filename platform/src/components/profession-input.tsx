"use client";

import { forwardRef, useState } from "react";

/**
 * Single-value typeahead for a free-text "what's your profession" / "what's
 * this role" field — same suggestion-dropdown idea as SkillsInput, but one
 * value instead of chips, and still a plain text field underneath (not an
 * enforced enum: typing something not in the list and moving on works
 * fine). Deliberately uncontrolled (defaultValue, not value) so a caller
 * can keep setting .value imperatively via ref the way
 * opportunity-form.tsx's applyServicePackage already does for the title
 * field — a controlled value prop here would fight that and revert it.
 */
export const ProfessionInput = forwardRef<
  HTMLInputElement,
  {
    id?: string;
    name: string;
    defaultValue?: string;
    required?: boolean;
    placeholder?: string;
    suggestions: string[];
    className?: string;
  }
>(function ProfessionInput({ id, name, defaultValue, required, placeholder, suggestions, className }, ref) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

  const matches = query.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  function selectSuggestion(value: string) {
    if (inputEl) inputEl.value = value;
    setQuery(value);
    setFocused(false);
  }

  return (
    <div className="relative">
      <input
        ref={(el) => {
          setInputEl(el);
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        id={id}
        name={name}
        type="text"
        required={required}
        defaultValue={defaultValue}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={(e) => {
          setQuery(e.target.value);
          setFocused(true);
        }}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={className ?? "mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"}
      />
      {focused && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate/25 bg-white py-1 text-sm shadow-md">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className="block w-full px-3 py-1.5 text-start hover:bg-cloud"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
