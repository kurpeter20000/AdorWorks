"use client";

import type { FormHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface SearchBarProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  onSubmit?: (query: string) => void;
}

/**
 * A styled search input with a leading icon and a trailing solid-accent
 * submit button — the pattern common to Upwork/Fiverr/Terawork's hero
 * search. Deliberately just a form primitive: it doesn't know where a
 * search should go, the caller wires that up (see docs/DESIGN_SYSTEM.md).
 */
export function SearchBar({
  name = "q",
  placeholder = "Search skills, categories or roles",
  defaultValue,
  submitLabel = "Search",
  onSubmit,
  className,
  ...formProps
}: SearchBarProps) {
  return (
    <form
      className={cn("flex w-full items-center gap-2 rounded-full bg-white p-1.5 shadow-md", className)}
      onSubmit={(e) => {
        if (!onSubmit) return;
        e.preventDefault();
        const query = new FormData(e.currentTarget).get(name);
        onSubmit(typeof query === "string" ? query : "");
      }}
      role="search"
      {...formProps}
    >
      <Search className="ml-2 size-5 shrink-0 text-slate" aria-hidden="true" />
      <label className="sr-only" htmlFor={`search-${name}`}>
        {placeholder}
      </label>
      <input
        id={`search-${name}`}
        name={name}
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-midnight placeholder:text-slate/70 focus:outline-none"
      />
      <Button type="submit" size="md" className="rounded-full">
        {submitLabel}
      </Button>
    </form>
  );
}
