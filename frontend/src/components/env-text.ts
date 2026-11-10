import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Environment variable names allowed
export const KEY_PATTERN = /^[^\s=#]+$/;

// "KEY = value" lines with # comments
export const envLanguage = StreamLanguage.define({
    startState: () => ({ afterKey: false }),
    token(stream, state) {
        if (stream.sol()) {
            state.afterKey = false;
            stream.eatSpace();
            if (stream.peek() === "#") {
                stream.skipToEnd();
                return "comment";
            }
        }
        if (!state.afterKey) {
            if (stream.eatSpace()) {
                return null;
            }
            if (stream.eat("=")) {
                state.afterKey = true;
                return "operator";
            }
            stream.eatWhile(/[^=\s]/);
            return "propertyName";
        }
        stream.skipToEnd();
        return "string";
    },
});

// Same colour classes as the compose editor
export const envHighlighting = syntaxHighlighting(HighlightStyle.define([
    {
        tag: tags.propertyName,
        class: "tok-key",
    },
    {
        tag: tags.comment,
        class: "tok-comment",
    },
    {
        tag: tags.operator,
        class: "tok-op",
    },
]));

/**
 * Rows to editor text, one KEY=value per line
 * @param {{key: string, value: string}[]} rows Rows
 * @returns {string} Editor text
 */
export function rowsToText(rows) {
    const lines = rows.filter((row) => row.key !== "").map((row) => `${row.key}=${row.value}`);
    return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Parse editor text into rows. Blank lines and # comments are skipped.
 * @param {string} text Editor text
 * @returns {{rows: {key: string, value: string}[], errorLine: number}} Rows, and the first invalid line number (0 if none)
 */
export function textToRows(text) {
    const rows = [];
    let errorLine = 0;
    text.split("\n").forEach((rawLine, index) => {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) {
            return;
        }
        const eq = line.indexOf("=");
        const key = (eq === -1 ? line : line.slice(0, eq)).trim();
        const value = eq === -1 ? "" : line.slice(eq + 1).trim();
        if (!KEY_PATTERN.test(key)) {
            errorLine = errorLine || index + 1;
            return;
        }
        rows.push({
            key,
            value,
        });
    });
    return {
        rows,
        errorLine,
    };
}

// What the backend returns for Global .env when global.env doesn't exist yet,
// and doesn't write back when it is unchanged (getSettings and setSettings in
// backend/socket-handlers/main-socket-handler.ts). The list treats it as empty.
export const GLOBAL_ENV_PLACEHOLDER = "# VARIABLE=value #comment";

/**
 * Whether the text has anything the list view would drop: a # comment, or a
 * blank line between content (leading and trailing blank lines don't count)
 * @param {string} text Editor text
 * @returns {boolean} True when the text has comments or interior blank lines
 */
export function hasComments(text: string): boolean {
    const body = text.trim();
    return body !== "" && body.split("\n").some((line) => {
        const trimmed = line.trim();
        return trimmed === "" || trimmed.startsWith("#");
    });
}

/**
 * Whether the list view can show and save the text without changing it: no
 * invalid lines, and writing the parsed rows back gives exactly the same text
 * (a missing final newline and the fresh-install placeholder count as safe)
 * @param {string} text Editor text
 * @returns {boolean} True when the text round-trips exactly
 */
export function isListSafe(text: string): boolean {
    if (text === "" || text === GLOBAL_ENV_PLACEHOLDER) {
        return true;
    }
    const { rows, errorLine } = textToRows(text);
    // A missing final newline is fine, the list adds it when it saves an edit
    return !errorLine && rowsToText(rows) === (text.endsWith("\n") ? text : text + "\n");
}
