"use client";

import { useState } from "react";
import { SKILL_SUGGESTIONS } from "@/lib/skills";

/**
 * Chip-based skill entry with autocomplete suggestions. Submits as a single
 * hidden field of comma-separated text, so it's a drop-in replacement for a
 * plain `<input name="skills">` — no Server Action changes needed.
 */
export function SkillsInput({
  id,
  name,
  defaultValue,
  required,
  placeholder,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [chips, setChips] = useState<string[]>(
    () => defaultValue?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  );
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const normalized = new Set(chips.map((c) => c.toLowerCase()));
  const suggestions = text.trim()
    ? SKILL_SUGGESTIONS.filter(
        (s) => s.toLowerCase().includes(text.trim().toLowerCase()) && !normalized.has(s.toLowerCase())
      ).slice(0, 8)
    : [];

  function addChip(value: string) {
    const trimmed = value.trim();
    if (!trimmed || normalized.has(trimmed.toLowerCase())) {
      setText("");
      return;
    }
    setChips((c) => [...c, trimmed]);
    setText("");
  }

  function removeChip(value: string) {
    setChips((c) => c.filter((s) => s !== value));
  }

  return (
    <div className="relative">
      <div
        className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate/25 px-2 py-1.5"
        onClick={() => document.getElementById(`${id}-text`)?.focus()}
      >
        {chips.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 rounded-full bg-cloud px-2 py-1 text-xs font-medium text-midnight"
          >
            {chip}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeChip(chip);
              }}
              className="text-slate hover:text-coral"
              aria-label={`Remove ${chip}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={`${id}-text`}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addChip(text);
            } else if (e.key === "Backspace" && !text && chips.length > 0) {
              removeChip(chips[chips.length - 1]);
            }
          }}
          placeholder={chips.length === 0 ? placeholder : undefined}
          className="min-w-[8rem] flex-1 border-none py-1 text-sm outline-none"
        />
      </div>

      {focused && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate/25 bg-white py-1 text-sm shadow-md">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addChip(s)}
                className="block w-full px-3 py-1.5 text-left hover:bg-cloud"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <input type="hidden" id={id} name={name} value={chips.join(", ")} />
      {required && chips.length === 0 && <p className="mt-1 text-xs text-slate">Add at least one skill.</p>}
    </div>
  );
}
