/**
 * Stands in for Slack in tests.
 *
 * Slack answers HTTP 200 even when it refuses, and the JSON ok field is what
 * decides, so a mock that only returned 200 would prove nothing. This one
 * answers by endpoint and can be told to refuse, which is what lets the tests
 * cover the paths that matter: a bot token Slack rejects, an employee whose
 * address belongs to nobody in the workspace.
 *
 * Every call is recorded so a test can assert what was said, not merely that
 * something was.
 */
@isTest
public class SlackHttpMock implements HttpCalloutMock {

    /** Endpoints called, in order. */
    public List<String> endpoints = new List<String>();

    /** Bodies posted, in order. A GET contributes an empty string. */
    public List<String> bodies = new List<String>();

    /** The member id users.lookupByEmail should return. Null means nobody. */
    public String lookupResult;

    /** When set, every call is refused with this Slack error code. */
    public String refuseWith;

    public SlackHttpMock() {}

    public SlackHttpMock(String lookupResult) {
        this.lookupResult = lookupResult;
    }

    public HttpResponse respond(HttpRequest request) {
        endpoints.add(request.getEndpoint());
        bodies.add(request.getBody() == null ? '' : request.getBody());

        HttpResponse response = new HttpResponse();
        response.setStatusCode(200);
        response.setHeader('Content-Type', 'application/json');

        if (String.isNotBlank(refuseWith)) {
            response.setBody('{"ok":false,"error":"' + refuseWith + '"}');
            return response;
        }
        if (request.getEndpoint().contains('users.lookupByEmail')) {
            response.setBody(
                String.isBlank(lookupResult)
                    ? '{"ok":false,"error":"users_not_found"}'
                    : '{"ok":true,"user":{"id":"' + lookupResult + '"}}'
            );
            return response;
        }
        response.setBody('{"ok":true}');
        return response;
    }

    /** True when any call went to this Slack method. */
    public Boolean called(String method) {
        for (String endpoint : endpoints) {
            if (endpoint.contains(method)) {
                return true;
            }
        }
        return false;
    }

    /** The body of the first call to a method, for asserting what was said. */
    public String bodyOf(String method) {
        for (Integer i = 0; i < endpoints.size(); i++) {
            if (endpoints[i].contains(method)) {
                return bodies[i];
            }
        }
        return null;
    }

    /**
     * True when any call to a method said this.
     *
     * Not the same question as bodyOf, and the difference matters: the triggers
     * notify people too, so a test asserting on its own message would otherwise
     * be reading the notifier's first and failing for the wrong reason.
     */
    public Boolean saidInAny(String method, String text) {
        for (Integer i = 0; i < endpoints.size(); i++) {
            if (endpoints[i].contains(method) && bodies[i].contains(text)) {
                return true;
            }
        }
        return false;
    }

    /** Everything said to a method, for a failure message worth reading. */
    public String allSaidTo(String method) {
        List<String> said = new List<String>();
        for (Integer i = 0; i < endpoints.size(); i++) {
            if (endpoints[i].contains(method)) {
                said.add(bodies[i]);
            }
        }
        return String.join(said, '\n---\n');
    }
}
