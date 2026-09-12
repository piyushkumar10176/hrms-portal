/**
 * Does the work a slash command asked for, after the acknowledgement has gone.
 *
 * Everything here runs outside Slack's three second window, so it is free to
 * query and to call out. The answer goes to the response_url Slack supplied,
 * which accepts five posts within thirty minutes.
 *
 * Failures are reported to the person who typed the command rather than
 * swallowed. A command that silently does nothing is the worst outcome: they
 * retype it, and nobody learns anything.
 */
public with sharing class SlackAsyncWorker implements Queueable, Database.AllowsCallouts {

    private final String command;
    private final String argument;
    private final String slackUserId;
    private final String responseUrl;

    public SlackAsyncWorker(String command, String argument, String slackUserId, String responseUrl) {
        this.command = command;
        this.argument = argument;
        this.slackUserId = slackUserId;
        this.responseUrl = responseUrl;
    }

    public void execute(QueueableContext context) {
        try {
            Employee__c employee = SlackEmployeeLookup.forSlackUser(slackUserId);
            if (employee == null) {
                post(SlackBlocks.ephemeral(
                    'Your Slack account is not linked to an employee record yet. ' +
                    'Ask HR to link it; they can do that from the HRMS admin console.'
                ));
                return;
            }
            post(answer(employee));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Slack ' + command + ' failed: ' + e.getTypeName() + ': ' + e.getMessage()
                + '\n' + e.getStackTraceString());
            post(SlackBlocks.ephemeral(
                'Something went wrong reaching Salesforce. Please try again.'
            ));
        }
    }

    /** Routes to the right command. */
    private String answer(Employee__c employee) {
        if (command == '/myleave') {
            return SlackLeaveCommand.balance(employee);
        }
        if (command == '/whosout') {
            return SlackLeaveCommand.whoIsOut();
        }
        // Ported one at a time. Saying so plainly beats a command that appears
        // broken, and beats one that silently does nothing.
        return SlackBlocks.ephemeral(
            command + ' has not been moved to the Salesforce gateway yet. ' +
            'It still works on the original Slack app.'
        );
    }

    /** Posts the real answer back to Slack. */
    private void post(String body) {
        HttpRequest request = new HttpRequest();
        request.setEndpoint(responseUrl);
        request.setMethod('POST');
        request.setHeader('Content-Type', 'application/json');
        request.setTimeout(20000);
        request.setBody(body);
        try {
            HttpResponse response = new Http().send(request);
            if (response.getStatusCode() != 200) {
                System.debug(LoggingLevel.ERROR,
                    'response_url refused: ' + response.getStatusCode() + ' ' + response.getBody());
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'response_url unreachable: ' + e.getMessage());
        }
    }
}
