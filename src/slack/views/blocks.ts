/**
 * Block Kit primitives.
 *
 * Block Kit is verbose and easy to get subtly wrong, and Slack truncates
 * silently rather than erroring when a limit is exceeded. These helpers keep the
 * shapes in one place and enforce the limits that bite:
 *
 *   50 blocks per message, 100 per modal
 *   3000 characters per section text, 150 per button label
 *   10 fields per section, and each field caps at 2000 characters
 *
 * Every builder truncates rather than letting Slack drop the block.
 */

export const MAX_MESSAGE_BLOCKS = 50;
export const MAX_MODAL_BLOCKS = 100;
const MAX_SECTION_TEXT = 3000;
const MAX_FIELD_TEXT = 2000;
const MAX_FIELDS_PER_SECTION = 10;
const MAX_BUTTON_TEXT = 75;

export type Block = Record<string, unknown>;

/** Slack requires three characters escaped inside message text. */
export function escape(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1) + "…";
}

export function mrkdwn(text: string): Block {
  return { type: "mrkdwn", text: clamp(text, MAX_SECTION_TEXT) };
}

export function plain(text: string): Block {
  return { type: "plain_text", text: clamp(text, MAX_SECTION_TEXT), emoji: true };
}

export function header(text: string): Block {
  // Header blocks cap at 150 characters and do not render markdown.
  return { type: "header", text: { type: "plain_text", text: clamp(text, 150), emoji: true } };
}

export function section(text: string, accessory?: Block): Block {
  const block: Block = { type: "section", text: mrkdwn(text) };
  if (accessory) block.accessory = accessory;
  return block;
}

/**
 * A two-column label/value grid.
 *
 * Slack renders at most 10 fields and silently drops the rest, so anything
 * beyond that is cut here where it can be reasoned about.
 */
export function fields(pairs: [string, string][]): Block {
  return {
    type: "section",
    fields: pairs.slice(0, MAX_FIELDS_PER_SECTION).map(([label, value]) => ({
      type: "mrkdwn",
      text: clamp(`*${label}*\n${value || "—"}`, MAX_FIELD_TEXT),
    })),
  };
}

export function context(...lines: string[]): Block {
  return {
    type: "context",
    elements: lines.slice(0, 10).map(line => mrkdwn(line)),
  };
}

export function divider(): Block {
  return { type: "divider" };
}

export interface ButtonSpec {
  text: string;
  actionId: string;
  value?: string;
  style?: "primary" | "danger";
  /** Shows a confirmation dialog before the action fires. */
  confirm?: { title: string; text: string; confirmText?: string };
  url?: string;
}

export function button(spec: ButtonSpec): Block {
  const block: Block = {
    type: "button",
    action_id: spec.actionId,
    text: { type: "plain_text", text: clamp(spec.text, MAX_BUTTON_TEXT), emoji: true },
  };
  if (spec.value !== undefined) block.value = spec.value;
  if (spec.style) block.style = spec.style;
  if (spec.url) block.url = spec.url;
  if (spec.confirm) {
    block.confirm = {
      title: { type: "plain_text", text: clamp(spec.confirm.title, 100) },
      text: mrkdwn(spec.confirm.text),
      confirm: { type: "plain_text", text: spec.confirm.confirmText ?? "Confirm" },
      deny: { type: "plain_text", text: "Cancel" },
    };
  }
  return block;
}

/** A row of buttons. Slack allows up to five elements in an actions block. */
export function actions(...buttons: Block[]): Block {
  return { type: "actions", elements: buttons.slice(0, 5) };
}

/**
 * Caps a block list and says what was hidden.
 *
 * Going over the ceiling makes Slack drop blocks with no error, so a list that
 * grew past it would quietly lose its end. Better to cut deliberately and tell
 * the reader.
 */
export function capped(blocks: Block[], limit: number, hiddenNote?: string): Block[] {
  if (blocks.length <= limit) return blocks;
  const kept = blocks.slice(0, limit - 1);
  kept.push(context(hiddenNote ?? `_${blocks.length - limit + 1} more not shown._`));
  return kept;
}

/** Renders rows as an aligned monospace table, which is the only thing in Slack that lines up. */
export function table(headers: string[], rows: string[][], maxRows = 20): Block {
  const shown = rows.slice(0, maxRows);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...shown.map(r => (r[i] ?? "").length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ").trimEnd();

  const body = [line(headers), widths.map(w => "-".repeat(w)).join("  "), ...shown.map(line)];
  if (rows.length > shown.length) {
    body.push(`... ${rows.length - shown.length} more`);
  }
  return section("```\n" + clamp(body.join("\n"), MAX_SECTION_TEXT - 10) + "\n```");
}
