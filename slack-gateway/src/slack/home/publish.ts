/**
 * Rendering the Home tab for a Slack user.
 *
 * Called on app_home_opened, and again after any action that changes what the
 * tab shows, so clocking in from the tab leaves it correct rather than stale.
 */

import { employeeForSlackUser } from "@/lib/slack";
import { publishHome } from "../api";
import { buildHome, buildUnlinkedHome } from "./view";
import { loadHomeData } from "./data";

/**
 * Builds and publishes one person's Home tab.
 *
 * Never throws. This runs from an event Slack will retry if it does not get a
 * clean answer, and a retry storm is worse than a tab that failed to draw once.
 *
 * @param slackUserId the Slack member whose tab is being drawn
 */
export async function refreshHome(slackUserId: string): Promise<void> {
  try {
    const employee = await employeeForSlackUser(slackUserId);
    if (!employee) {
      await publishHome(slackUserId, buildUnlinkedHome());
      return;
    }
    const data = await loadHomeData(employee);
    await publishHome(slackUserId, buildHome(data));
  } catch (err) {
    console.error(`[slack/home] could not render home for ${slackUserId}:`, err);
    // Leave whatever was there rather than replacing it with an error screen:
    // a slightly stale tab is more use than a blank one.
  }
}
