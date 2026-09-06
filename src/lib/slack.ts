/**
 * Slack gateway helpers.
 *
 * Architecture note. This app is the Slack gateway, not the brain. It verifies
 * the signature, acknowledges within Slack's 3 second deadline, and asks
 * Salesforce to do the actual work. Salesforce stays the system of record.
 *
 * The gateway lives here rather than in Apex because Slack's 3 second budget is
 * unforgiving and a Salesforce Site guest-user endpoint adds cold start and
 * guest-user overhead, plus a public attack surface on the org itself. Business
 * logic stays in Salesforce; these routes hold none.
 */

import { query } from "./salesforce";
import { escapeSoqlString } from "./soql";

export interface SlackEmployee {
  Id: string;
  Name: string;
  Official_Email__c: string | null;
  Slack_User_Id__c: string | null;
  Reporting_Manager__c: string | null;
  Role__c: string | null;
}

/** Resolves a Slack member id to the Employee__c record it is mapped to. */
export async function employeeForSlackUser(
  slackUserId: string
): Promise<SlackEmployee | null> {
  if (!/^[A-Z0-9]{5,20}$/i.test(slackUserId)) return null;
  const rows = await query<SlackEmployee>(`
    SELECT Id, Name, Official_Email__c, Slack_User_Id__c, Reporting_Manager__c, Role__c
    FROM Employee__c
    WHERE Slack_User_Id__c = '${escapeSoqlString(slackUserId)}'
      AND Employee_Status__c = 'Active'
    LIMIT 1
  `);
  return rows[0] ?? null;
}

/** An ephemeral reply only the invoking user sees. */
export function ephemeral(text: string) {
  return { response_type: "ephemeral" as const, text };
}

/**
 * Posts a delayed result back to Slack.
 *
 * Slack allows five posts to a response_url within thirty minutes, which is how
 * work that outruns the 3 second acknowledgement gets its answer to the user.
 */
export async function postToResponseUrl(
  responseUrl: string,
  body: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[slack] response_url post failed:", err);
  }
}

/** The message shown when a Slack account is not linked to an employee. */
export function notLinkedMessage() {
  return ephemeral(
    "Your Slack account is not linked to an employee record yet. " +
      "Ask HR to set your Slack user id on your employee profile."
  );
}
