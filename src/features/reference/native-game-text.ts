/** Native rich text is presentation markup, never executable HTML. Keep raw text in Source. */
import i18n from "../../i18n";
import { humanizeNativeLabel } from "./native-wiki-labels";

export function nativeDisplayText(value: string): string {
  return value.replace(/<InputAction\b[^>]*\bid="([^"]+)"[^>]*\/?\s*>/g, (_tag, id: string) => ` [${i18n.t(`wiki.inputActions.${id}`, { defaultValue: humanizeNativeLabel(id) })}] `)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}
