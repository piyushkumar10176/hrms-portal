/**
 * Turns a thrown value into a message that is safe to return to the browser.
 *
 * Several routes previously returned `err.message` straight to the caller,
 * which leaks Salesforce internals (object and field API names, query text,
 * session diagnostics). Only a recognised validation message is passed through;
 * everything else becomes the caller-supplied fallback and is logged server side.
 */

import { extractValidationMessage } from "./salesforce";

export function safeErrorMessage(err: unknown, fallback: string): string {
  return extractValidationMessage(err) ?? fallback;
}

/** True when the value looks like a Salesforce validation failure. */
export function isValidationError(err: unknown): boolean {
  return extractValidationMessage(err) !== null;
}
