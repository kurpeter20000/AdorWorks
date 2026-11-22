"use client";

import { useId, useState } from "react";
import { COMMON_COUNTRIES, SOUTH_SUDAN, SOUTH_SUDAN_STATES, type Place } from "@/lib/domain/locations";
import { useT } from "@/i18n/client";

/**
 * City/town, county, state and country (0126), for talent and
 * organisations. In South Sudan the state is picked from the fixed list;
 * anywhere else it's typed. Field names: city, county, state, country.
 */
export function LocationFields({
  initial,
  errors,
  required = true,
  legend,
}: {
  initial?: Place | null;
  errors?: Partial<Record<"city" | "county" | "state" | "country", string[] | undefined>>;
  required?: boolean;
  legend?: string;
}) {
  const t = useT();
  const id = useId();
  const [country, setCountry] = useState(initial?.country || SOUTH_SUDAN);
  const inSouthSudan = country.trim().toLowerCase() === SOUTH_SUDAN.toLowerCase();
  const label = "text-sm font-semibold text-midnight";
  const field = "mt-1 min-h-11 w-full rounded-lg border border-slate/25 bg-white px-3 py-2 text-sm";
  const err = (e?: string[]) => (e?.[0] ? <p className="mt-1 text-sm text-coral-ink">{t(e[0])}</p> : null);
  const initialState = initial?.state ?? "";
  const stateKnown = (SOUTH_SUDAN_STATES as readonly string[]).includes(initialState);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-bold text-midnight">{legend ?? t("Location")}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-country`} className={label}>
            {t("Country")}
          </label>
          <input
            id={`${id}-country`}
            name="country"
            list={`${id}-countries`}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required={required}
            autoComplete="country-name"
            className={field}
          />
          <datalist id={`${id}-countries`}>
            {COMMON_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {err(errors?.country)}
        </div>
        <div>
          <label htmlFor={`${id}-state`} className={label}>
            {inSouthSudan ? t("State") : t("State or region")}
          </label>
          {inSouthSudan ? (
            <select id={`${id}-state`} name="state" defaultValue={stateKnown ? initialState : ""} required={required} className={field}>
              <option value="">{t("Choose a state")}</option>
              {SOUTH_SUDAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input id={`${id}-state`} name="state" defaultValue={stateKnown ? "" : initialState} autoComplete="address-level1" className={field} />
          )}
          {err(errors?.state)}
        </div>
        <div>
          <label htmlFor={`${id}-county`} className={label}>
            {inSouthSudan ? t("County") : t("County or district")}
          </label>
          <input
            id={`${id}-county`}
            name="county"
            defaultValue={initial?.county ?? ""}
            placeholder={inSouthSudan ? t("e.g. Juba County") : ""}
            className={field}
          />
          {err(errors?.county)}
        </div>
        <div>
          <label htmlFor={`${id}-city`} className={label}>
            {t("City or town")}
          </label>
          <input
            id={`${id}-city`}
            name="city"
            defaultValue={initial?.city ?? ""}
            required={required}
            placeholder={inSouthSudan ? t("e.g. Juba") : ""}
            autoComplete="address-level2"
            className={field}
          />
          {err(errors?.city)}
        </div>
      </div>
    </fieldset>
  );
}
