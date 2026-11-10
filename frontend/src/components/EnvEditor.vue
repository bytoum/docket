<template>
    <div class="env-editor-field">
        <div v-if="!listOnly" class="toggle-row">
            <span class="field-label">{{ label }}</span>
            <span class="toggle-spacer"></span>
            <div class="segmented" role="radiogroup">
                <button
                    v-for="option in modeOptions" :key="option.value" type="button" class="segment"
                    role="radio" :aria-checked="mode === option.value" :class="{ selected: mode === option.value }"
                    @click="setMode(option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
        </div>

        <!-- List view -->
        <template v-if="mode === 'list'">
            <div class="rows">
                <div class="row-line column-headers">
                    <span class="env-key">{{ $t("envKey") }}</span>
                    <span class="env-value">{{ $t("envValue") }}</span>
                    <span class="square-spacer"></span>
                </div>
                <div v-for="(row, index) in rows" :key="index" class="row-line">
                    <input v-model.trim="row.key" class="field-input env-key" placeholder="KEY" :aria-label="$t('envKey')" :readonly="readonly" />
                    <input v-model="row.value" class="field-input env-value" placeholder="value" :aria-label="$t('envValue')" :readonly="readonly" />
                    <span v-if="readonly" class="square-spacer"></span>
                    <button v-else type="button" class="square-btn" :aria-label="$t('removeVariable')" @click="removeRow(index)">
                        <span class="icon"><img :src="icons.close" alt="" width="9.5" height="9.5" /></span>
                    </button>
                </div>
            </div>
            <button v-if="!readonly" type="button" class="add-row" @click="rows.push({ key: '', value: '' })">
                <span class="icon"><img :src="icons.plus" alt="" width="10.8333" height="10.8333" /></span>
                {{ $t("addVariable") }}
            </button>
            <p class="field-hint">{{ $t("envHint") }}</p>
        </template>

        <!-- Raw view: code editor -->
        <template v-else>
            <div class="env-editor">
                <div class="env-editor-header">
                    <AssetIcon :src="icons.file" width="10.5" height="12.8333" :box="14" tone="neutral" />
                    <span class="env-editor-name">.env</span>
                    <span class="toggle-spacer"></span>
                    <button type="button" class="format-btn" :title="$t('formatYaml') + ' (Shift+Alt+F)'" @click="formatRaw">
                        <AssetIcon :src="icons.format" width="10.8333" height="10.8333" :box="13" />
                        {{ $t("formatYaml") }}
                    </button>
                </div>
                <div class="env-editor-body" @keydown="onEditorKeydown">
                    <code-mirror
                        v-model="raw"
                        :extensions="extensions"
                        minimal
                        wrap="true"
                        :dark="$root.isDark"
                        tab="true"
                    />
                </div>
            </div>
            <p class="field-hint">{{ $t("envRawHint") }}</p>
        </template>
    </div>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { KEY_PATTERN, envLanguage, envHighlighting, rowsToText, textToRows } from "./env-text";
import AssetIcon from "./AssetIcon.vue";
import iconClose from "../assets/drawer/close.svg";
import iconPlus from "../assets/drawer/plus.svg";
import iconFile from "../assets/drawer/file.svg";
import iconFormat from "../assets/drawer/format.svg";

// Icons exported from the Figma design
const icons = {
    close: iconClose,
    plus: iconPlus,
    file: iconFile,
    format: iconFormat,
};

const MODE_STORAGE_KEY = "envEditorMode";

// Shared with the Global .env settings page
export { textToRows, rowsToText };

/**
 * Turn a service's "environment" (list or map) into key/value rows
 * @param {Array|object|undefined} env Compose environment value
 * @returns {{key: string, value: string}[]} Rows
 */
export function envToRows(env) {
    if (Array.isArray(env)) {
        return env.map((line) => {
            const text = String(line);
            const index = text.indexOf("=");
            return index === -1 ? {
                key: text,
                value: "",
            } : {
                key: text.slice(0, index),
                value: text.slice(index + 1),
            };
        });
    }
    if (env && typeof env === "object") {
        return Object.entries(env).map(([ key, value ]) => ({
            key,
            value: value === null || value === undefined ? "" : String(value),
        }));
    }
    return [];
}

/**
 * Key/value rows back to a compose "environment" value, in the same form
 * (list or map) as the original
 * @param {{key: string, value: string}[]} rows Rows
 * @param {Array|object|undefined} original Original environment value
 * @returns {Array|object|undefined} Environment value, undefined when empty
 */
export function rowsToEnv(rows, original) {
    if (rows.length === 0) {
        return undefined;
    }
    if (original && !Array.isArray(original)) {
        const env = {};
        for (const row of rows) {
            env[row.key] = row.value;
        }
        return env;
    }
    return rows.map((row) => `${row.key}=${row.value}`);
}

/**
 * Environment variables editor with a key/value list view and a raw
 * "KEY=value" code editor view, used in the env drawer.
 * The parent calls reset() to load rows and collect() to read them back.
 */
export default {
    components: {
        AssetIcon,
        CodeMirror,
    },
    props: {
        /** Label shown next to the List / Raw toggle */
        label: {
            type: String,
            default: "",
        },
        /** Show only the list view: no List / Raw toggle, and the mode is not stored */
        listOnly: {
            type: Boolean,
            default: false,
        },
        /** The list is display-only: inputs are read-only, and rows cannot be added or removed */
        readonly: {
            type: Boolean,
            default: false,
        },
    },
    setup() {
        return {
            extensions: [
                envLanguage,
                envHighlighting,
                lineNumbers(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
            ],
        };
    },
    data() {
        let mode = "raw";
        if (this.listOnly) {
            mode = "list";
        } else {
            try {
                mode = localStorage.getItem(MODE_STORAGE_KEY) === "list" ? "list" : "raw";
            } catch (e) {
                // Storage can be unavailable, e.g. in a private window
            }
        }

        return {
            icons,
            mode,
            rows: [],
            raw: "",
        };
    },
    computed: {
        modeOptions() {
            return [
                {
                    value: "list",
                    label: this.$t("envList"),
                },
                {
                    value: "raw",
                    label: this.$t("envRaw"),
                },
            ];
        },
    },
    methods: {
        /**
         * Load variables into both views
         * @param {{key: string, value: string}[]} rows Variables
         * @returns {void}
         */
        reset(rows) {
            this.rows = rows.map((row) => ({ ...row }));
            this.raw = rowsToText(this.rows);
            this.ensureBlankRow();
        },

        /**
         * Remove a row from the list view
         * @param {number} index Row index
         * @returns {void}
         */
        removeRow(index) {
            this.rows.splice(index, 1);
            this.ensureBlankRow();
        },

        /**
         * The list view always shows at least one empty row to type into
         * @returns {void}
         */
        ensureBlankRow() {
            if (this.rows.length === 0 && !this.readonly) {
                this.rows.push({
                    key: "",
                    value: "",
                });
            }
        },

        /**
         * Read the variables from the current view. Shows an error toast
         * and returns null when the input is invalid.
         * @returns {{key: string, value: string}[]|null} Variables
         */
        collect() {
            if (this.mode === "raw") {
                const { rows, errorLine } = textToRows(this.raw);
                if (errorLine) {
                    this.$root.toastError(this.$t("envInvalidLine", [ errorLine ]));
                    return null;
                }
                return rows;
            }

            const rows = this.rows.filter((row) => row.key !== "");
            if (rows.some((row) => !KEY_PATTERN.test(row.key))) {
                this.$root.toastError(this.$t("envInvalidKey"));
                return null;
            }
            return rows.map((row) => ({ ...row }));
        },

        /**
         * Switch between the list and the raw editor, carrying the edits over
         * @param {string} mode "list" or "raw"
         * @returns {void}
         */
        setMode(mode) {
            if (mode === this.mode || this.listOnly) {
                return;
            }
            if (mode === "raw") {
                this.raw = rowsToText(this.rows);
            } else {
                const { rows, errorLine } = textToRows(this.raw);
                if (errorLine) {
                    this.$root.toastError(this.$t("envInvalidLine", [ errorLine ]));
                    return;
                }
                this.rows = rows;
                this.ensureBlankRow();
            }
            this.mode = mode;
            try {
                localStorage.setItem(MODE_STORAGE_KEY, mode);
            } catch (e) {
                // Ignore, the setting is only a convenience
            }
        },

        /**
         * Rewrite the editor text as KEY=value lines, keeping comments
         * @returns {void}
         */
        formatRaw() {
            const out = [];
            for (const rawLine of this.raw.split("\n")) {
                const line = rawLine.trim();
                if (line === "") {
                    if (out.length > 0 && out[out.length - 1] !== "") {
                        out.push("");
                    }
                } else if (line.startsWith("#")) {
                    out.push(line);
                } else {
                    const eq = line.indexOf("=");
                    out.push(eq === -1 ? line : `${line.slice(0, eq).trim()}=${line.slice(eq + 1).trim()}`);
                }
            }
            while (out.length > 0 && out[out.length - 1] === "") {
                out.pop();
            }
            this.raw = out.length > 0 ? out.join("\n") + "\n" : "";
        },

        /**
         * Shift+Alt+F formats the editor text
         * @param {KeyboardEvent} event Key event from the editor
         * @returns {void}
         */
        onEditorKeydown(event) {
            if (event.shiftKey && event.altKey && event.code === "KeyF") {
                event.preventDefault();
                this.formatRaw();
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/drawer.scss";

// Fills the drawer body, so the raw editor gets all the height there is
.env-editor-field {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.toggle-row {
    display: flex;
    align-items: center;
}

.toggle-spacer {
    flex: 1;
}

.segmented {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 4px;
    background-color: $surface-raised;
}

.segment {
    padding: 5px 10px;
    border: none;
    border-radius: 3px;
    background: transparent;
    font-size: 12px;
    font-weight: 500;
    line-height: normal;
    color: $text-secondary;

    &.selected {
        font-weight: 600;
        color: $text-primary;
        background-color: $bg-surface;
    }
}

.env-editor {
    display: flex;
    flex-direction: column;
    border-radius: 4px;
    overflow: hidden;
    flex: 1;
    min-height: 320px;
    background-color: $bg-input;
}

.env-editor-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 6px 6px 10px;
}

.env-editor-name {
    font-size: 13px;
    font-weight: 500;
}

.format-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    line-height: normal;
    color: $primary;
    background-color: $accent-subtle;

    &:hover {
        background-color: darken($accent-primary-subtle, 4%);
    }
}

.env-editor-body {
    flex: 1;
    min-height: 0;
    position: relative;

    // Out of the flow, so a long file scrolls inside the editor instead of
    // stretching the drawer
    :deep(.vue-codemirror) {
        position: absolute;
        inset: 0;
    }

    :deep(.cm-editor) {
        height: 100%;
    }

    :deep(.cm-editor) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: $text-primary;
        background-color: transparent !important;

        &.cm-focused {
            outline: none;
        }
    }

    :deep(.cm-scroller) {
        font-family: inherit;
        line-height: 22px;
    }

    :deep(.cm-content) {
        padding: 10px 0;
        caret-color: $text-primary;
    }

    :deep(.cm-line) {
        padding: 0 10px;
    }

    :deep(.cm-gutters) {
        min-height: 100%;
        padding: 0 10px;
        color: $muted;
        background-color: $surface-raised;
        border-right: none;
    }

    :deep(.cm-gutter.cm-lineNumbers .cm-gutterElement) {
        padding: 0;
    }

    :deep(.cm-gutters .cm-gutterElement:first-child) {
        margin-top: 10px;
    }

    :deep(.cm-activeLine) {
        background-color: rgba($accent-subtle, 0.7) !important;
    }

    :deep(.cm-activeLineGutter) {
        background-color: transparent;
        color: $text-primary;
    }

    :deep(.cm-cursor) {
        border-left: 2px solid $text-primary;
    }

    :deep(.tok-key) {
        color: $primary;
    }

    :deep(.tok-op),
    :deep(.tok-comment) {
        color: $muted;
    }
}

// Dark theme
.dark {
    .segmented {
        background-color: $dark-header-bg;
    }

    .segment {
        color: $dark-font-color;

        &.selected {
            color: $dark-text-primary;
            background-color: $dark-bg;
        }
    }

    .env-editor {
        background-color: $dark-bg-input;
    }

    .format-btn {
        color: $highlight;
        background-color: rgba($primary, 0.2);
    }

    .env-editor-body {
        :deep(.cm-editor),
        :deep(.cm-content) {
            color: $dark-text-primary;
            caret-color: $dark-text-primary;
        }

        :deep(.cm-gutters) {
            background-color: $dark-header-bg;
        }

        :deep(.cm-activeLine) {
            background-color: rgba($primary, 0.12) !important;
        }

        :deep(.cm-activeLineGutter) {
            color: $dark-text-primary;
        }

        :deep(.cm-cursor) {
            border-left-color: $dark-text-primary;
        }

        :deep(.tok-key) {
            color: $highlight;
        }
    }
}
</style>
