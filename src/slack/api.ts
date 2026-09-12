/**
 * Slack Web API client.
 *
 * The existing routes call fetch directly against slack.com. Everything added
 * from here goes through this instead, so the token, the workspace id and the
 * error handling live in one place rather than being repeated at every call
 * site.
 *
 * Slack answers HTTP 200 even when it refuses a request, so the JSON `ok` field
 * is what decides success. Nothing here throws: a Slack failure must never take
 * down the request that triggered it, because Slack retries anything it does not
 * get a clean answer to within three seconds.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackResult<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * The workspace to act in.
 *
 * An org-wide install spans every workspace in an Enterprise Grid, so Slack
 * refuses workspace-scoped calls with team_access_not_granted unless told which
 * one. Unset outside a Grid, where it is neither needed nor harmful.
 */
function teamId(): string | undefined {
  const id = process.env.SLACK_TEAM_ID?.trim();
  return id ? id : undefined;
}

async function call<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>
): Promise<SlackResult<T>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error(`[slack] ${method} skipped: SLACK_BOT_TOKEN is not set`);
    return { ok: false, error: "missing_token" };
  }

  const payload = { ...body };
  const team = teamId();
  if (team && !("team_id" in payload)) payload.team_id = team;

  try {
    const response = await fetch(`${SLACK_API}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}` };
    }
    const json = (await response.json()) as { ok?: boolean; error?: string } & T;
    if (!json.ok) {
      console.warn(`[slack] ${method} refused: ${json.error}`);
      return { ok: false, error: json.error ?? "unknown_error" };
    }
    return { ok: true, data: json };
  } catch (err) {
    console.error(`[slack] ${method} failed:`, err);
    return { ok: false, error: (err as Error).message };
  }
}

/** Replaces a user's Home tab. Safe to call on every app_home_opened. */
export function publishHome(userId: string, blocks: unknown[]): Promise<SlackResult> {
  return call("views.publish", {
    user_id: userId,
    view: { type: "home", blocks },
  });
}

/**
 * Opens a modal.
 *
 * The trigger_id is single use and lives about three seconds, so this must be
 * called immediately on the interaction that produced it, never after awaiting
 * anything slow.
 */
export function openView(triggerId: string, view: unknown): Promise<SlackResult> {
  return call("views.open", { trigger_id: triggerId, view });
}

/** Replaces the contents of an already open modal. */
export function updateView(viewId: string, view: unknown): Promise<SlackResult> {
  return call("views.update", { view_id: viewId, view });
}

/** Pushes a second modal onto the stack. Slack allows three deep. */
export function pushView(triggerId: string, view: unknown): Promise<SlackResult> {
  return call("views.push", { trigger_id: triggerId, view });
}

/** Posts a message. Passing a member id as channel opens a direct message. */
export function postMessage(
  channel: string,
  text: string,
  blocks?: unknown[]
): Promise<SlackResult> {
  return call("chat.postMessage", blocks ? { channel, text, blocks } : { channel, text });
}
