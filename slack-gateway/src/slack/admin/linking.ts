/**
 * Matching employees to their Slack accounts.
 *
 * The team_join event only fires when somebody joins the workspace for the very
 * first time. It never fires for a person who was already a member, and it is
 * silently useless if the event was never subscribed. Relying on it alone left
 * an employee created through Slack unlinked, receiving nothing, with no sign
 * anything was wrong.
 *
 * So linking is also a thing an admin can simply run. It asks Slack for the
 * account behind each unlinked employee's email address and records what comes
 * back, which works regardless of when or how the person joined.
 */

import { query, updateRecord } from "@/lib/salesforce";
import { canSeeCompanyWideData, toRole } from "@/lib/authz";
import type { SlackEmployee } from "@/lib/slack";
import { postMessage } from "../api";
import { header, section, context, table, type Block } from "../views/blocks";

/** Addresses that can never match a real account, so never worth a call. */
function isPlaceholder(email: string): boolean {
  return /@(test|example)\.(com|org|net)$/i.test(email);
}

interface LookupResult {
  ok?: boolean;
  error?: string;
  user?: { id?: string; deleted?: boolean; is_bot?: boolean };
}

/** Asks Slack which account owns an address. Needs the users:read.email scope. */
async function lookupByEmail(email: string): Promise<LookupResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "missing_token" };
  try {
    const response = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return (await response.json()) as LookupResult;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface LinkOutcome {
  linked: { name: string; slackId: string }[];
  placeholders: number;
  noAccount: string[];
  scopeMissing: boolean;
}

/**
 * Links every active employee who has a real address and no Slack id yet.
 *
 * @returns what was linked and what could not be
 */
export async function linkEveryone(): Promise<LinkOutcome> {
  const rows = await query<{ Id: string; Name: string; Official_Email__c: string }>(`
    SELECT Id, Name, Official_Email__c FROM Employee__c
    WHERE Employee_Status__c = 'Active'
      AND Slack_User_Id__c = NULL
      AND Official_Email__c != NULL
    LIMIT 200
  `);

  const outcome: LinkOutcome = {
    linked: [], placeholders: 0, noAccount: [], scopeMissing: false,
  };

  for (const row of rows) {
    const email = row.Official_Email__c.toLowerCase();
    if (isPlaceholder(email)) {
      outcome.placeholders++;
      continue;
    }
    const result = await lookupByEmail(email);

    if (result.error === "missing_scope") {
      // Nothing further can succeed, so stop rather than burn calls.
      outcome.scopeMissing = true;
      break;
    }
    if (result.ok && result.user?.id && !result.user.deleted && !result.user.is_bot) {
      await updateRecord("Employee__c", row.Id, { Slack_User_Id__c: result.user.id });
      outcome.linked.push({ name: row.Name, slackId: result.user.id });
    } else {
      outcome.noAccount.push(row.Name);
    }
  }

  return outcome;
}

/** Runs the match and reports it, gated to HR and admin. */
export async function runLinking(actor: SlackEmployee, slackUserId: string): Promise<void> {
  if (!canSeeCompanyWideData({ id: actor.Id, role: toRole(actor.Role__c) })) {
    await postMessage(slackUserId, "Only HR and administrators can link Slack accounts.");
    return;
  }

  await postMessage(slackUserId, "Checking Slack for everyone who is not linked yet…");
  const outcome = await linkEveryone();

  if (outcome.scopeMissing) {
    await postMessage(
      slackUserId,
      ":warning: The Slack app is missing the *users:read.email* scope, so accounts " +
      "cannot be matched by email. Add it under OAuth & Permissions, reinstall the " +
      "app, then run this again."
    );
    return;
  }

  const blocks: Block[] = [header("Slack account linking")];

  if (outcome.linked.length > 0) {
    blocks.push(table(
      ["Employee", "Slack id"],
      outcome.linked.map(l => [l.name, l.slackId]),
      25
    ));
  } else {
    blocks.push(section("_Nobody new was linked._"));
  }

  const notes: string[] = [];
  if (outcome.placeholders > 0) {
    notes.push(
      `${outcome.placeholders} skipped for having a placeholder address ` +
      `such as @test.com, which can never match a real account.`
    );
  }
  if (outcome.noAccount.length > 0) {
    notes.push(
      `${outcome.noAccount.length} have a real address but no Slack account yet: ` +
      outcome.noAccount.slice(0, 10).join(", ") +
      (outcome.noAccount.length > 10 ? ", and others" : "") + "."
    );
  }
  notes.push("Run this again after inviting somebody to Slack.");
  blocks.push(context(...notes));

  await postMessage(
    slackUserId,
    `${outcome.linked.length} newly linked`,
    blocks
  );
}
