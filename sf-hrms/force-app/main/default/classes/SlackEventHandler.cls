/**
 * The Events API.
 *
 * Acknowledged synchronously and worked afterwards, because Slack redelivers
 * anything it does not get a clean answer to within three seconds and a retry
 * storm is worse than a missed redraw.
 */
public inherited sharing class SlackEventHandler {

    public static void enqueue(Map<String, Object> event) {
        String type = String.valueOf(event.get('type'));
        if (type == 'app_home_opened' || type == 'team_join') {
            // Queueable rather than inline: both of these need callouts, and the
            // acknowledgement must not wait on them.
            System.enqueueJob(new SlackEventWorker(JSON.serialize(event)));
        }
    }
}
