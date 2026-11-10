<template>
    <div>
        <div v-if="settingsLoaded">
            <form autocomplete="off" @submit.prevent="saveGeneral">
                <div class="global-env-toolbar">
                    <div class="settings-segmented" role="radiogroup">
                        <button
                            v-for="option in viewOptions" :key="option.value" type="button"
                            class="settings-segment" role="radio" :aria-checked="view === option.value"
                            :class="{ selected: view === option.value }" @click="setView(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                    <span class="global-env-count">{{ $tc("globalEnvVariables", variableCount) }}</span>
                </div>

                <!-- List view -->
                <div v-if="view === 'list'" class="global-env-list">
                    <p v-if="readonlyList" class="global-env-note">{{ $t(hasCommentLines ? "globalEnvCommentsNote" : "globalEnvRawOnlyNote") }}</p>
                    <EnvEditor ref="list" list-only :readonly="readonlyList" />
                </div>

                <!-- Raw view -->
                <div v-else class="global-env-editor">
                    <code-mirror
                        ref="editor"
                        v-model="settings.globalENV"
                        :extensions="extensionsEnv"
                        minimal
                        wrap="true"
                        :dark="$root.isDark"
                        tab="true"
                    />
                </div>

                <div class="global-env-actions">
                    <button class="btn btn-primary" type="submit">
                        {{ $t("Save") }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import EnvEditor from "../EnvEditor.vue";
import { envLanguage, envHighlighting, hasComments, isListSafe, rowsToText, textToRows } from "../env-text";

const VIEW_STORAGE_KEY = "docket.globalEnvView";

export default {
    name: "GlobalEnv",
    components: {
        CodeMirror,
        EnvEditor,
    },

    setup() {
        const extensionsEnv = [
            envLanguage,
            envHighlighting,
            lineNumbers(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
        ];

        return { extensionsEnv };
    },

    data() {
        let view = "raw";
        try {
            view = localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "raw";
        } catch (e) {
            // Storage can be unavailable, e.g. in a private window
        }

        return { view };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },

        viewOptions() {
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

        /** The saved text */
        text() {
            return this.settings.globalENV || "";
        },

        /** The list is read-only unless the text round-trips through it exactly */
        readonlyList() {
            return !isListSafe(this.text);
        },

        /** Whether the text has comments or blank lines (picks the note) */
        hasCommentLines() {
            return hasComments(this.text);
        },

        /** Number of KEY=value lines */
        variableCount() {
            return textToRows(this.text).rows.length;
        },
    },

    watch: {
        // Fill the list whenever it opens (also on load, when List was remembered)
        view: "fillList",
        settingsLoaded: "fillList",
    },

    mounted() {
        this.fillList();
    },

    methods: {
        /**
         * Load the saved text into the list view, when it is shown
         * @returns {void}
         */
        fillList() {
            this.$nextTick(() => {
                if (this.view === "list" && this.$refs.list) {
                    this.$refs.list.reset(textToRows(this.text).rows);
                }
            });
        },

        /**
         * Write the list's variables back to settings.globalENV
         * @returns {boolean} False when the list has invalid input (an error is shown)
         */
        syncFromList() {
            if (this.view !== "list" || this.readonlyList || !this.$refs.list) {
                return true;
            }
            const rows = this.$refs.list.collect();
            if (rows === null) {
                return false;
            }
            // An untouched list must never rewrite the file
            if (JSON.stringify(rows) !== JSON.stringify(textToRows(this.text).rows)) {
                this.settings.globalENV = rowsToText(rows);
            }
            return true;
        },

        /**
         * Switch between the list and the raw editor, carrying edits over
         * @param {string} view "list" or "raw"
         * @returns {void}
         */
        setView(view) {
            if (view === this.view) {
                return;
            }
            if (view === "raw") {
                if (!this.syncFromList()) {
                    return;
                }
            } else {
                const { errorLine } = textToRows(this.text);
                if (errorLine) {
                    this.$root.toastError(this.$t("envInvalidLine", [ errorLine ]));
                    return;
                }
            }
            this.view = view;
            try {
                localStorage.setItem(VIEW_STORAGE_KEY, view);
            } catch (e) {
                // Ignore, the setting is only a convenience
            }
        },

        /** Save the settings */
        saveGeneral() {
            if (!this.syncFromList()) {
                return;
            }
            this.saveSettings();
        },
    },
};
</script>

<style scoped lang="scss">
@import "../../styles/vars.scss";

.global-env-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}

.global-env-count {
    font-size: 12px;
    color: $text-muted;
}

.global-env-note {
    margin: 0 0 12px;
    font-size: 13px;
    color: $text-muted;
}

.global-env-editor {
    min-height: 320px;
    border-radius: 4px;
    overflow: hidden;
    background-color: $bg-input;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;

    :deep(.cm-editor) {
        min-height: 320px;
        font-family: inherit;
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
        background-color: $bg-surface-raised;
        border-right: none;
    }

    :deep(.cm-gutter.cm-lineNumbers .cm-gutterElement) {
        padding: 0;
    }

    :deep(.cm-activeLine) {
        background-color: rgba($accent-primary-subtle, 0.7) !important;
    }

    :deep(.cm-activeLineGutter) {
        background-color: transparent;
        color: $text-primary;
    }

    :deep(.cm-cursor) {
        border-left: 2px solid $text-primary;
    }

    :deep(.tok-key) {
        color: $accent-primary;
    }

    :deep(.tok-op),
    :deep(.tok-comment) {
        color: $text-muted;
    }
}

.global-env-actions {
    margin-top: 20px;
}

.dark {
    .global-env-count,
    .global-env-note {
        color: $dark-text-muted;
    }

    .global-env-editor {
        background-color: $dark-bg-input;

        :deep(.cm-editor),
        :deep(.cm-content) {
            color: $dark-text-primary;
            caret-color: $dark-text-primary;
        }

        :deep(.cm-gutters) {
            background-color: $dark-bg-surface-raised;
            color: $dark-text-muted;
        }

        :deep(.cm-activeLine) {
            background-color: rgba($dark-accent-primary, 0.12) !important;
        }

        :deep(.cm-activeLineGutter) {
            color: $dark-text-primary;
        }

        :deep(.cm-cursor) {
            border-left-color: $dark-text-primary;
        }

        :deep(.tok-key) {
            color: $dark-accent-primary;
        }

        :deep(.tok-op),
        :deep(.tok-comment) {
            color: $dark-text-muted;
        }
    }
}
</style>
