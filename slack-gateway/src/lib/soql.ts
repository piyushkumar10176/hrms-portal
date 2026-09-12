/**
 * SOQL literal helpers.
 *
 * jsforce has no bind-variable API for raw SOQL strings, so every value
 * interpolated into a query must be escaped or validated here rather than
 * inline at the call site.
 */

/** Salesforce record ids are 15 or 18 case-sensitive alphanumeric characters. */
const SF_ID = /^[a-zA-Z0-9]{15,18}$/;

export class InvalidSalesforceIdError extends Error {
  constructor(value: string) {
    super(`Not a valid Salesforce id: ${value}`);
    this.name = "InvalidSalesforceIdError";
  }
}

/**
 * Validates a value is a Salesforce id before it is placed into a query.
 * Throws rather than escaping, because anything that is not an id here is a bug
 * or an injection attempt, not a legitimate value.
 */
export function assertSalesforceId(value: string | null | undefined): string {
  if (!value || !SF_ID.test(value)) {
    throw new InvalidSalesforceIdError(String(value));
  }
  return value;
}

/** True when the value is a well-formed Salesforce id. */
export function isSalesforceId(value: string | null | undefined): boolean {
  return Boolean(value) && SF_ID.test(value as string);
}

/**
 * Escapes a string for use inside single quotes in a SOQL literal.
 * Backslash must be escaped first so the quote escape is not itself escaped.
 */
export function escapeSoqlString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}
