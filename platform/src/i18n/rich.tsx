import { Fragment, type ReactNode } from "react";

/**
 * Renders a translated sentence that contains links or emphasis, so the
 * translator — not the code — decides where the link sits in the sentence:
 *
 *   rich(t("I agree to the <terms>Terms of Use</terms>."), {
 *     terms: (text) => <a href="…">{text}</a>,
 *   })
 *
 * Only tags named in `parts` become elements; anything else in the text is
 * shown as plain text, so a translation can never inject markup.
 * Works in Server and Client Components alike.
 */
export function rich(text: string, parts: Record<string, (children: string) => ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = parts[m[1]];
    out.push(<Fragment key={i++}>{render ? render(m[2]) : m[2]}</Fragment>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
