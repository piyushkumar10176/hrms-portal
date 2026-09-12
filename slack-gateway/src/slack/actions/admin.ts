/**
 * Routing for the admin buttons and modal submissions.
 *
 * Kept apart from the existing handlers so the leave and regularization flows
 * that already work are not touched. Authority is re-checked inside each
 * handler, not here: a button is a convenience, never the boundary.
 */

import type { SlackEmployee } from "@/lib/slack";
import { businessToday } from "@/lib/business-time";
import { postMessage } from "../api";
import { refreshHome } from "../home/publish";
import {
  openAddEmployee, openFindEmployee, openEditEmployee, openOffboard,
  createEmployee, saveEmployee, offboardEmployee, sendSearchResults, sendProfile,
  reinvite, readModalValues,
} from "../admin/employees";
import {
  sendPersonDay, sendPersonMonth, sendTodayAcrossCompany,
  openAddPunch, addPunch, openAttendancePicker,
} from "../admin/attendance";
import { runLinking } from "../admin/linking";

export interface ModalState {
  values: Record<string, Record<string, Record<string, unknown>>>;
}

/**
 * Handles an admin button.
 *
 * @returns true when the action belonged here
 */
export async function handleAdminAction(
  actionId: string,
  value: string | undefined,
  triggerId: string,
  actor: SlackEmployee,
  slackUserId: string
): Promise<boolean> {
  switch (actionId) {
    case "admin_find_employee":
      await openFindEmployee(triggerId);
      return true;

    case "admin_add_employee":
      await openAddEmployee(triggerId, actor);
      return true;

    case "admin_edit_employee":
      await openEditEmployee(triggerId, value ?? "", actor);
      return true;

    case "admin_offboard":
      await openOffboard(triggerId, value ?? "", actor);
      return true;

    case "admin_reinvite":
      await reinvite(value ?? "", actor, slackUserId);
      return true;

    case "admin_view_profile":
      await sendProfile(value ?? "", actor, slackUserId);
      return true;

    case "admin_view_attendance":
      await sendPersonMonth(value ?? "", actor, slackUserId);
      return true;

    case "admin_attendance":
      await openAttendancePicker(triggerId);
      return true;

    case "admin_today_attendance":
      await sendTodayAcrossCompany(actor, slackUserId);
      return true;

    case "admin_link_slack":
      await runLinking(actor, slackUserId);
      await refreshHome(slackUserId);
      return true;

    case "admin_add_punch": {
      const [employeeId, date] = (value ?? "").split("|");
      await openAddPunch(triggerId, employeeId, date || businessToday(), actor);
      return true;
    }

    default:
      return false;
  }
}

/** The response Slack expects from a modal submission that failed validation. */
function errors(map: Record<string, string>) {
  return { response_action: "errors" as const, errors: map };
}

/**
 * Handles an admin modal submission.
 *
 * Slack keeps the modal open only if the response arrives within three seconds
 * and names the blocks at fault, so validation answers here rather than by a
 * message afterwards.
 *
 * @returns null when the submission was not an admin one
 */
export async function handleAdminSubmission(
  callbackId: string,
  state: ModalState | undefined,
  privateMetadata: string | undefined,
  actor: SlackEmployee,
  slackUserId: string
): Promise<Record<string, unknown> | null> {
  const values = readModalValues(state);

  switch (callbackId) {
    case "admin_find_employee": {
      const term = values.term ?? "";
      if (term.length < 2) {
        return errors({ term: "Type at least two characters." });
      }
      // Answer the modal now, then do the lookup; Slack closes on an empty body.
      void sendSearchResults(term, actor, slackUserId);
      return {};
    }

    case "admin_create_employee": {
      const outcome = await createEmployee(values, actor);
      if (!outcome.ok && outcome.errors) return errors(outcome.errors);
      await postMessage(slackUserId, outcome.message ?? "Done.");
      await refreshHome(slackUserId);
      return {};
    }

    case "admin_edit_employee": {
      const outcome = await saveEmployee(privateMetadata ?? "", values, actor);
      if (!outcome.ok && outcome.errors) return errors(outcome.errors);
      await postMessage(slackUserId, outcome.message ?? "Done.");
      return {};
    }

    case "admin_offboard_employee": {
      const outcome = await offboardEmployee(privateMetadata ?? "", values, actor);
      await postMessage(slackUserId, outcome.message);
      await refreshHome(slackUserId);
      return {};
    }

    case "admin_add_punch": {
      const [employeeId, date] = (privateMetadata ?? "").split("|");
      const outcome = await addPunch(employeeId, date, values, actor);
      await postMessage(slackUserId, outcome.message);
      if (outcome.ok) void sendPersonDay(employeeId, date, actor, slackUserId);
      return {};
    }

    case "admin_pick_attendance": {
      const employeeId = values.employee ?? "";
      const date = values.date;
      if (date) void sendPersonDay(employeeId, date, actor, slackUserId);
      else void sendPersonMonth(employeeId, actor, slackUserId);
      return {};
    }

    default:
      return null;
  }
}
