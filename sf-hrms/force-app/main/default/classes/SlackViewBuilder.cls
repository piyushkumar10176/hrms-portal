/**
 * Modal primitives.
 *
 * A modal is not a message: it has its own block vocabulary, its own ceilings,
 * and Slack decides whether to keep or close it from the response to the very
 * submission that came out of it. This file owns that vocabulary so no handler
 * has to remember the shapes.
 *
 * The ceilings that bite: 100 blocks in a view, 24 characters in a title or a
 * button on the modal frame, 75 in a select option label, 100 options in a
 * static select, 3000 characters of section text. Slack truncates silently
 * rather than erroring, so everything is cut deliberately here.
 *
 * Every input element carries the action id "value", which is what lets
 * SlackModalValues read a submission back without knowing anything about the
 * form that produced it.
 */
public inherited sharing class SlackViewBuilder {

    public static final Integer MAX_OPTIONS = 100;
    private static final Integer MAX_OPTION_TEXT = 75;
    private static final Integer MAX_FRAME_TEXT = 24;
    private static final String ELEMENT_ACTION_ID = 'value';

    /** Closes the modal and keeps whatever the submission did. */
    public static final String CLOSE = '{}';

    /** One entry in a select. */
    public class Choice {
        public String label;
        public String value;
        public Choice(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    private static String clamp(String text, Integer maxLength) {
        if (text == null) {
            return '';
        }
        return text.length() <= maxLength ? text : text.substring(0, maxLength - 1) + '…';
    }

    private static Map<String, Object> plain(String text, Integer maxLength) {
        return new Map<String, Object>{
            'type' => 'plain_text', 'text' => clamp(text, maxLength), 'emoji' => true
        };
    }

    public static Map<String, Object> option(String label, String value) {
        return new Map<String, Object>{
            'text' => plain(label, MAX_OPTION_TEXT), 'value' => value
        };
    }

    /**
     * Turns choices into option maps.
     *
     * Slack refuses a select carrying zero options, so a caller with an empty
     * list must leave the whole block out rather than render one.
     */
    public static List<Object> options(List<Choice> choices) {
        List<Object> out = new List<Object>();
        for (Choice choice : choices) {
            out.add(option(choice.label, choice.value));
            if (out.size() >= MAX_OPTIONS) {
                break;
            }
        }
        return out;
    }

    // ---- elements --------------------------------------------------------

    public static Map<String, Object> textInput(String placeholder, String initial, Boolean multiline) {
        Map<String, Object> element = new Map<String, Object>{
            'type' => 'plain_text_input', 'action_id' => ELEMENT_ACTION_ID
        };
        if (String.isNotBlank(placeholder)) {
            element.put('placeholder', plain(placeholder, 150));
        }
        if (String.isNotBlank(initial)) {
            element.put('initial_value', initial);
        }
        if (multiline == true) {
            element.put('multiline', true);
        }
        return element;
    }

    public static Map<String, Object> textInput(String placeholder) {
        return textInput(placeholder, null, false);
    }

    /**
     * A static select.
     *
     * The initial option must be one of the options by identity, not merely by
     * value, so it is looked up here rather than constructed again.
     */
    public static Map<String, Object> selectInput(List<Choice> choices, String initialValue) {
        List<Object> opts = options(choices);
        Map<String, Object> element = new Map<String, Object>{
            'type' => 'static_select', 'action_id' => ELEMENT_ACTION_ID, 'options' => opts
        };
        if (String.isNotBlank(initialValue)) {
            for (Object entry : opts) {
                Map<String, Object> opt = (Map<String, Object>) entry;
                if (initialValue == String.valueOf(opt.get('value'))) {
                    element.put('initial_option', opt);
                    break;
                }
            }
        }
        return element;
    }

    public static Map<String, Object> datePicker(Date initial) {
        Map<String, Object> element = new Map<String, Object>{
            'type' => 'datepicker', 'action_id' => ELEMENT_ACTION_ID
        };
        if (initial != null) {
            element.put('initial_date', SlackBlocks.dateText(initial));
        }
        return element;
    }

    /** Wall-clock time in the business zone, as HH:mm. */
    public static Map<String, Object> timePicker(String initial) {
        Map<String, Object> element = new Map<String, Object>{
            'type' => 'timepicker', 'action_id' => ELEMENT_ACTION_ID
        };
        if (String.isNotBlank(initial)) {
            element.put('initial_time', initial);
        }
        return element;
    }

    // ---- blocks ----------------------------------------------------------

    public static Map<String, Object> input(
        String blockId, String label, Map<String, Object> element, Boolean optional, String hintText
    ) {
        Map<String, Object> block = new Map<String, Object>{
            'type' => 'input',
            'block_id' => blockId,
            'label' => plain(label, 2000),
            'element' => element,
            'optional' => optional == true
        };
        if (String.isNotBlank(hintText)) {
            block.put('hint', plain(hintText, 2000));
        }
        return block;
    }

    public static Map<String, Object> input(String blockId, String label, Map<String, Object> element) {
        return input(blockId, label, element, false, null);
    }

    // ---- the view frame --------------------------------------------------

    /**
     * @param privateMetadata carried through the submission untouched, which is
     *        how a modal remembers the record it was opened for. It is echoed
     *        back by Slack, so it is treated as client input on the way back.
     */
    public static Map<String, Object> modal(
        String callbackId, String title, String submitText,
        String privateMetadata, List<Object> blocks
    ) {
        Map<String, Object> view = new Map<String, Object>{
            'type' => 'modal',
            'callback_id' => callbackId,
            'title' => plain(title, MAX_FRAME_TEXT),
            'close' => plain('Cancel', MAX_FRAME_TEXT),
            'blocks' => SlackBlocks.capped(
                blocks, SlackBlocks.MAX_VIEW_BLOCKS, '_Some fields were hidden to fit._'
            )
        };
        if (String.isNotBlank(submitText)) {
            view.put('submit', plain(submitText, MAX_FRAME_TEXT));
        }
        if (String.isNotBlank(privateMetadata)) {
            view.put('private_metadata', privateMetadata);
        }
        return view;
    }

    /**
     * The response that keeps a modal open and marks the blocks at fault.
     *
     * This has to be the answer to the submission itself; a message sent
     * afterwards arrives behind a modal that has already closed.
     */
    public static String errors(Map<String, String> byBlockId) {
        return JSON.serialize(new Map<String, Object>{
            'response_action' => 'errors', 'errors' => byBlockId
        });
    }

    public static String error(String blockId, String message) {
        return errors(new Map<String, String>{ blockId => message });
    }
}
