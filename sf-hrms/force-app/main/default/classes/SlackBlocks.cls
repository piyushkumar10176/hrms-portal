/**
 * Block Kit primitives.
 *
 * Slack truncates silently rather than erroring when a limit is exceeded, so a
 * list that outgrew its ceiling would quietly lose its end with nothing to say
 * why. Every builder here cuts deliberately and, where it matters, says what was
 * hidden.
 *
 * The limits that bite: 50 blocks per message, 100 per modal or Home view, 3000
 * characters of section text, 10 fields per section, 75 per button label.
 */
public with sharing class SlackBlocks {

    public static final Integer MAX_MESSAGE_BLOCKS = 50;
    public static final Integer MAX_VIEW_BLOCKS = 100;
    private static final Integer MAX_SECTION_TEXT = 3000;
    private static final Integer MAX_FIELDS = 10;
    private static final Integer MAX_BUTTON_TEXT = 75;

    /** The three characters Slack requires escaped inside message text. */
    public static String escape(String value) {
        if (String.isBlank(value)) {
            return '';
        }
        return value.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
    }

    private static String clamp(String text, Integer maxLength) {
        if (text == null) {
            return '';
        }
        return text.length() <= maxLength ? text : text.substring(0, maxLength - 1) + '…';
    }

    public static Map<String, Object> mrkdwn(String text) {
        return new Map<String, Object>{
            'type' => 'mrkdwn', 'text' => clamp(text, MAX_SECTION_TEXT)
        };
    }

    public static Map<String, Object> plain(String text) {
        return new Map<String, Object>{
            'type' => 'plain_text', 'text' => clamp(text, MAX_SECTION_TEXT), 'emoji' => true
        };
    }

    public static Map<String, Object> header(String text) {
        // Header blocks cap at 150 characters and do not render markdown.
        return new Map<String, Object>{
            'type' => 'header',
            'text' => new Map<String, Object>{
                'type' => 'plain_text', 'text' => clamp(text, 150), 'emoji' => true
            }
        };
    }

    public static Map<String, Object> section(String text) {
        return new Map<String, Object>{ 'type' => 'section', 'text' => mrkdwn(text) };
    }

    public static Map<String, Object> divider() {
        return new Map<String, Object>{ 'type' => 'divider' };
    }

    /**
     * A two column label and value grid.
     *
     * Slack renders at most ten fields and drops the rest without a word, so
     * anything beyond that is cut here where it can be reasoned about.
     */
    public static Map<String, Object> fields(List<String> labels, List<String> values) {
        List<Object> pairs = new List<Object>();
        Integer count = Math.min(Math.min(labels.size(), values.size()), MAX_FIELDS);
        for (Integer i = 0; i < count; i++) {
            String value = String.isBlank(values[i]) ? '—' : values[i];
            pairs.add(mrkdwn('*' + labels[i] + '*\n' + value));
        }
        return new Map<String, Object>{ 'type' => 'section', 'fields' => pairs };
    }

    public static Map<String, Object> context(List<String> lines) {
        List<Object> elements = new List<Object>();
        for (String line : lines) {
            elements.add(mrkdwn(line));
            if (elements.size() >= 10) {
                break;
            }
        }
        return new Map<String, Object>{ 'type' => 'context', 'elements' => elements };
    }

    public static Map<String, Object> context(String line) {
        return context(new List<String>{ line });
    }

    public static Map<String, Object> button(String text, String actionId, String value, String style) {
        Map<String, Object> element = new Map<String, Object>{
            'type' => 'button',
            'action_id' => actionId,
            'text' => new Map<String, Object>{
                'type' => 'plain_text', 'text' => clamp(text, MAX_BUTTON_TEXT), 'emoji' => true
            }
        };
        if (String.isNotBlank(value)) {
            element.put('value', value);
        }
        if (String.isNotBlank(style)) {
            element.put('style', style);
        }
        return element;
    }

    /** A row of buttons. Slack allows five elements in an actions block. */
    public static Map<String, Object> actions(List<Object> elements) {
        List<Object> kept = new List<Object>();
        for (Object element : elements) {
            kept.add(element);
            if (kept.size() >= 5) {
                break;
            }
        }
        return new Map<String, Object>{ 'type' => 'actions', 'elements' => kept };
    }

    /**
     * Caps a block list and says what was hidden, rather than letting Slack drop
     * the overflow with no explanation.
     */
    public static List<Object> capped(List<Object> blocks, Integer maxBlocks, String note) {
        if (blocks.size() <= maxBlocks) {
            return blocks;
        }
        List<Object> kept = new List<Object>();
        for (Integer i = 0; i < maxBlocks - 1; i++) {
            kept.add(blocks[i]);
        }
        kept.add(context(
            String.isBlank(note)
                ? '_' + (blocks.size() - maxBlocks + 1) + ' more not shown._'
                : note
        ));
        return kept;
    }

    /**
     * Renders rows as an aligned monospace table.
     *
     * A code block is the only thing in Slack that lines columns up, so anything
     * tabular goes through here rather than into fields.
     */
    public static Map<String, Object> table(
        List<String> headers, List<List<String>> rows, Integer maxRows
    ) {
        List<Integer> widths = new List<Integer>();
        for (String head : headers) {
            widths.add(head.length());
        }
        Integer shown = Math.min(rows.size(), maxRows);
        for (Integer r = 0; r < shown; r++) {
            for (Integer c = 0; c < headers.size(); c++) {
                String cell = c < rows[r].size() && rows[r][c] != null ? rows[r][c] : '';
                if (cell.length() > widths[c]) {
                    widths[c] = cell.length();
                }
            }
        }

        List<String> lines = new List<String>{ padRow(headers, widths) };
        List<String> rule = new List<String>();
        for (Integer w : widths) {
            rule.add('-'.repeat(w));
        }
        lines.add(padRow(rule, widths));
        for (Integer r = 0; r < shown; r++) {
            lines.add(padRow(rows[r], widths));
        }
        if (rows.size() > shown) {
            lines.add('... ' + (rows.size() - shown) + ' more');
        }
        return section('```\n' + clamp(String.join(lines, '\n'), MAX_SECTION_TEXT - 10) + '\n```');
    }

    private static String padRow(List<String> cells, List<Integer> widths) {
        List<String> padded = new List<String>();
        for (Integer i = 0; i < widths.size(); i++) {
            String cell = i < cells.size() && cells[i] != null ? cells[i] : '';
            padded.add(cell.rightPad(widths[i]));
        }
        return String.join(padded, '  ').replaceAll('\\s+$', '');
    }

    /**
     * A date as yyyy-MM-dd.
     *
     * Concatenating a Date with a String in Apex yields "2026-09-12 00:00:00",
     * which shows the reader a midnight that means nothing.
     */
    public static String dateText(Date value) {
        if (value == null) {
            return '';
        }
        return DateTime.newInstance(value, Time.newInstance(0, 0, 0, 0)).format('yyyy-MM-dd');
    }

    /** An ephemeral reply only the person who typed the command sees. */
    public static String ephemeral(String text) {
        return JSON.serialize(new Map<String, Object>{
            'response_type' => 'ephemeral', 'text' => text
        });
    }

    public static String ephemeral(String text, List<Object> blocks) {
        return JSON.serialize(new Map<String, Object>{
            'response_type' => 'ephemeral', 'text' => text, 'blocks' => blocks
        });
    }
}
