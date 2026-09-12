/**
 * Reads a submitted modal back into a flat map.
 *
 * Slack nests a submission three deep: block id, then action id, then a field
 * whose shape depends on the element that produced it. Every element this app
 * builds carries the action id "value", which is what lets this read a form
 * without knowing anything about the form.
 *
 * Blanks are dropped rather than kept as empty strings, so a caller can ask
 * "was this filled in" with a single containsKey and an optional field that was
 * left alone is indistinguishable from one that was never rendered. That is the
 * behaviour the edit modal relies on to mean "leave what is already there".
 */
public inherited sharing class SlackModalValues {

    /**
     * @param view the view object from a view_submission payload
     * @return block id to the submitted value, trimmed, blanks omitted
     */
    public static Map<String, String> read(Map<String, Object> view) {
        Map<String, String> out = new Map<String, String>();
        if (view == null) {
            return out;
        }
        Map<String, Object> state = (Map<String, Object>) view.get('state');
        if (state == null) {
            return out;
        }
        Map<String, Object> values = (Map<String, Object>) state.get('values');
        if (values == null) {
            return out;
        }

        for (String blockId : values.keySet()) {
            Map<String, Object> block = (Map<String, Object>) values.get(blockId);
            if (block == null) {
                continue;
            }
            Map<String, Object> field = (Map<String, Object>) block.get('value');
            if (field == null) {
                // An element built somewhere else may carry a different action
                // id; taking the only entry is right whenever there is one.
                if (block.size() != 1) {
                    continue;
                }
                field = (Map<String, Object>) block.values()[0];
            }
            String value = extract(field);
            if (String.isNotBlank(value)) {
                out.put(blockId, value.trim());
            }
        }
        return out;
    }

    /** One field, whatever element produced it. */
    private static String extract(Map<String, Object> field) {
        if (field == null) {
            return null;
        }
        Object plain = field.get('value');
        if (plain != null) {
            return String.valueOf(plain);
        }
        Object selected = field.get('selected_option');
        if (selected != null) {
            return String.valueOf(((Map<String, Object>) selected).get('value'));
        }
        Object day = field.get('selected_date');
        if (day != null) {
            return String.valueOf(day);
        }
        Object clock = field.get('selected_time');
        if (clock != null) {
            return String.valueOf(clock);
        }
        return null;
    }

    /** The private_metadata a modal was opened with, as Slack echoed it back. */
    public static String metadataOf(Map<String, Object> view) {
        if (view == null) {
            return '';
        }
        Object metadata = view.get('private_metadata');
        return metadata == null ? '' : String.valueOf(metadata);
    }

    public static String callbackIdOf(Map<String, Object> view) {
        if (view == null) {
            return '';
        }
        Object callbackId = view.get('callback_id');
        return callbackId == null ? '' : String.valueOf(callbackId);
    }

    /**
     * A date a picker produced.
     *
     * Returns null rather than throwing on anything unparseable: the value
     * reaches us through the client, so a malformed one is a refusal to act,
     * not an exception for the reader to see.
     */
    public static Date asDate(String value) {
        if (String.isBlank(value) || !Pattern.matches('\\d{4}-\\d{2}-\\d{2}', value)) {
            return null;
        }
        try {
            return Date.newInstance(
                Integer.valueOf(value.substring(0, 4)),
                Integer.valueOf(value.substring(5, 7)),
                Integer.valueOf(value.substring(8, 10))
            );
        } catch (Exception e) {
            return null;
        }
    }

    /** A record id from client-supplied text, or null when it is not one. */
    public static Id asId(String value, Schema.SObjectType expected) {
        if (String.isBlank(value)) {
            return null;
        }
        try {
            Id parsed = Id.valueOf(value);
            return parsed.getSobjectType() == expected ? parsed : null;
        } catch (Exception e) {
            return null;
        }
    }
}
