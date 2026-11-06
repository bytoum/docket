<template>
    <section class="console-dock" :class="{ open }">
        <!-- Bar -->
        <div class="dock-bar">
            <div class="dock-title">
                <AssetIcon :src="icons.console" width="12.1667" height="10.8333" tone="neutral" />
                <span>{{ $t("console") }}</span>
                <span v-if="live" class="live-badge">
                    <img :src="icons.dotSuccess" width="6" height="6" alt="" />
                    {{ $t("consoleLive") }}
                </span>
            </div>

            <div v-if="open && services.length > 1" class="dock-filters" role="radiogroup">
                <button
                    v-for="option in filterOptions" :key="option.value" type="button" class="choice-chip"
                    role="radio" :aria-checked="filter === option.value" :class="{ selected: filter === option.value }"
                    @click="filter = option.value"
                >
                    {{ option.label }}
                </button>
            </div>

            <span class="spacer"></span>

            <div v-if="open" class="log-search">
                <AssetIcon v-if="searchText === ''" :src="icons.search" width="13.5" height="13.5" class="log-search-icon" />
                <button v-else type="button" class="log-search-icon clear" :title="$t('clearFilter')" @click="searchText = ''">
                    <font-awesome-icon icon="times" />
                </button>
                <input v-model="searchText" class="form-control log-search-input" autocomplete="off" :placeholder="$t('consoleFilter')" :aria-label="$t('consoleFilter')" />
            </div>

            <button
                v-if="open" type="button" class="clear-btn" :disabled="lines.length === 0"
                :title="$t('consoleClear')" @click="clearLog"
            >
                <font-awesome-icon icon="trash" />
                <span>{{ $t("consoleClear") }}</span>
            </button>

            <button
                type="button" class="toggle-btn" :aria-expanded="open"
                :aria-label="open ? $t('hideConsole') : $t('showConsole')" :title="open ? $t('hideConsole') : $t('showConsole')"
                @click="toggle"
            >
                <AssetIcon :src="open ? icons.chevronDown : icons.chevronUp" width="9.45833" height="5.45833" tone="neutral" />
            </button>
        </div>

        <!-- Log panel -->
        <div v-show="open" ref="panel" class="log-panel" @scroll="onScroll">
            <div v-if="visibleLines.length === 0" class="log-empty">{{ lines.length > 0 ? $t("consoleNoMatch") : $t("consoleEmpty") }}</div>
            <div v-for="line in visibleLines" :key="line.id" class="log-line">
                <span v-if="line.source" class="log-source" :style="sourceStyle">{{ line.source }}</span>
                <span v-if="line.time" class="log-text">{{ line.before }}</span><span v-if="line.time" class="log-time">{{ line.time }}</span><span class="log-text">{{ line.time ? line.after : line.message }}</span>
            </div>
        </div>
    </section>
</template>

<script>
import AssetIcon from "./AssetIcon.vue";
import iconConsole from "../assets/stack/console.svg";
import iconChevronUp from "../assets/stack/chevron-up.svg";
import iconChevronDown from "../assets/stack/chevron-down-dock.svg";
import iconDotSuccess from "../assets/stack/dot-success.svg";
import iconSearch from "../assets/stack/search.svg";

const icons = {
    console: iconConsole,
    chevronUp: iconChevronUp,
    chevronDown: iconChevronDown,
    dotSuccess: iconDotSuccess,
    search: iconSearch,
};

const STORAGE_KEY = "consoleDockOpen";
const MAX_LINES = 1000;

// ANSI escape sequences (colours, cursor movement) and OSC sequences
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

// "redis-1  | message" as printed by "docker compose logs"
const SOURCE_PATTERN = /^(\S+)\s+\|\s?(.*)$/;

// A clock time near the start of a message, e.g. 06:51:22.202
const TIME_PATTERN = /^(.{0,40}?)(\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?)(.*)$/;

let nextLineId = 1;

/**
 * Bottom dock with the stack's combined container logs ("docker compose logs -f").
 * It can be collapsed to a bar, filtered by container and by text, and cleared.
 */
export default {
    components: {
        AssetIcon,
    },
    props: {
        /** Name of the combined terminal on the backend */
        name: {
            type: String,
            required: true,
        },
        /** Agent endpoint of the stack */
        endpoint: {
            type: String,
            default: "",
        },
        /** Service names of the stack, used for the filter chips */
        services: {
            type: Array,
            default: () => [],
        },
        /** Container names set with "container_name", keyed by service name */
        containerNames: {
            type: Object,
            default: () => ({}),
        },
        /** Whether the stack is running */
        live: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        let open = false;
        try {
            open = localStorage.getItem(STORAGE_KEY) === "1";
        } catch (e) {
            // Storage can be unavailable, e.g. in a private window
        }

        return {
            icons,
            open,
            filter: "",
            searchText: "",
            lines: [],
            partial: "",
            stickToBottom: true,
            boundName: "",
        };
    },
    computed: {
        filterOptions() {
            return [
                {
                    value: "",
                    label: this.$t("all"),
                },
                ...this.services.map((service) => ({
                    value: service,
                    label: service,
                })),
            ];
        },

        visibleLines() {
            const search = this.searchText.trim().toLowerCase();
            if (!this.filter && !search) {
                return this.lines;
            }
            return this.lines.filter((line) => {
                if (this.filter && !this.belongsTo(line.source, this.filter)) {
                    return false;
                }
                return !search
                    || line.message.toLowerCase().includes(search)
                    || line.source.toLowerCase().includes(search);
            });
        },

        /**
         * Align messages by giving every source label the width of the longest one
         * @returns {object} Style for the source labels
         */
        sourceStyle() {
            const longest = this.lines.reduce((max, line) => Math.max(max, line.source.length), 0);
            return {
                minWidth: `${longest + 3}ch`,
            };
        },
    },
    watch: {
        name: {
            handler() {
                this.bind();
            },
            immediate: true,
        },
        endpoint() {
            this.bind();
        },
        open(isOpen) {
            try {
                localStorage.setItem(STORAGE_KEY, isOpen ? "1" : "0");
            } catch (e) {
                // Ignore, the setting is only a convenience
            }
            this.updateDockHeight();
            if (isOpen) {
                this.scrollToBottom();
            }
        },
    },
    mounted() {
        this.updateDockHeight();
    },
    unmounted() {
        if (this.boundName) {
            this.$root.unbindTerminal(this.boundName);
        }
        document.documentElement.style.removeProperty("--console-dock-height");
    },
    methods: {
        /**
         * Receive the combined terminal's output. The socket mixin only calls
         * write() on the bound object, so this component acts as the terminal.
         * @returns {void}
         */
        bind() {
            if (this.boundName) {
                this.$root.unbindTerminal(this.boundName);
                this.boundName = "";
            }
            if (!this.name) {
                return;
            }
            this.lines = [];
            this.partial = "";
            this.boundName = this.name;
            this.$root.bindTerminal(this.endpoint, this.name, {
                write: (data) => this.append(data),
            });
        },

        /**
         * Split raw terminal output into log lines
         * @param {string} data Output chunk, may end mid-line
         * @returns {void}
         */
        append(data) {
            const text = (this.partial + String(data)).replace(ANSI_PATTERN, "");
            const parts = text.split("\n");
            this.partial = parts.pop();

            for (const raw of parts) {
                const line = raw.replace(/\r/g, "").trimEnd();
                if (line !== "") {
                    this.lines.push(this.parseLine(line));
                }
            }

            if (this.lines.length > MAX_LINES) {
                this.lines.splice(0, this.lines.length - MAX_LINES);
            }

            if (this.open && this.stickToBottom) {
                this.scrollToBottom();
            }
        },

        /**
         * Split a log line into its source container, message and time
         * @param {string} line Log line without colour codes
         * @returns {object} Parsed line
         */
        parseLine(line) {
            const sourceMatch = SOURCE_PATTERN.exec(line);
            const source = sourceMatch ? sourceMatch[1] : "";
            const message = sourceMatch ? sourceMatch[2] : line;
            const timeMatch = TIME_PATTERN.exec(message);

            return {
                id: nextLineId++,
                source,
                message,
                before: timeMatch ? timeMatch[1] : "",
                time: timeMatch ? timeMatch[2] : "",
                after: timeMatch ? timeMatch[3] : "",
            };
        },

        /**
         * Whether a log line source (e.g. "redis-1") belongs to a service
         * @param {string} source Source label of the line
         * @param {string} service Service name
         * @returns {boolean} True if it belongs to the service
         */
        belongsTo(source, service) {
            if (!source) {
                return false;
            }
            return source === service
                || source === this.containerNames[service]
                || new RegExp(`^${service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`).test(source);
        },

        /**
         * Clear the log lines shown in the dock. Only clears this view;
         * new output keeps coming in.
         * @returns {void}
         */
        clearLog() {
            this.lines = [];
            this.stickToBottom = true;
        },

        toggle() {
            this.open = !this.open;
        },

        onScroll() {
            const panel = this.$refs.panel;
            if (panel) {
                this.stickToBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 24;
            }
        },

        scrollToBottom() {
            this.$nextTick(() => {
                const panel = this.$refs.panel;
                if (panel) {
                    panel.scrollTop = panel.scrollHeight;
                }
            });
        },

        /**
         * Expose the dock height so the page and sidebar can leave room for it
         * @returns {void}
         */
        updateDockHeight() {
            this.$nextTick(() => {
                const height = this.$el?.offsetHeight ?? 0;
                document.documentElement.style.setProperty("--console-dock-height", `${height}px`);
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.console-dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background-color: $bg-surface;
    border-top: 1px solid $surface-border;
}

.dock-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    min-height: 54px;
}

.dock-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
}

.live-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: normal;
    color: $success;
    background-color: $status-success-subtle;
}

.dock-filters {
    display: flex;
    gap: 6px;
    padding-left: 12px;
    overflow-x: auto;
}

.choice-chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    line-height: normal;
    color: $text-secondary;
    background-color: $bg-surface;
    border: 1px solid $border-strong;
    border-radius: 999px;

    &:hover {
        background-color: $bg-input;
    }

    &.selected {
        color: $primary;
        background-color: $accent-subtle;
        border-color: $primary;
    }
}

.spacer {
    flex: 1;
}

.log-search {
    position: relative;
    width: 220px;
}

.log-search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: $muted;

    &.clear {
        border: none;
        background: none;
        padding: 0;
        font-size: 13px;
        cursor: pointer;

        &:hover {
            color: $text-secondary;
        }
    }
}

.log-search-input {
    height: 32px;
    font-size: 13px;
    padding: 6px 10px 6px 32px;
    border-radius: 4px;
    border-color: $surface-border;
    background-color: $bg-input;

    &::placeholder {
        color: $muted;
    }
}

.clear-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 6px 10px;
    font-size: 13px;
    font-weight: 500;
    line-height: normal;
    color: $text-secondary;
    background-color: $surface-raised;
    border: none;
    border-radius: 4px;

    &:hover:not(:disabled) {
        background-color: darken($surface-raised, 4%);
    }

    &:disabled {
        opacity: 0.5;
    }
}

.toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border: 1px solid $surface-border;
    border-radius: 8px;
    background-color: $surface-raised;

    &:hover {
        background-color: darken($surface-raised, 4%);
    }
}

.log-panel {
    height: 220px;
    overflow: auto;
    padding: 14px 24px;
    background-color: $bg-input;
    border-top: 1px solid $surface-border;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 18px;
    color: $text-secondary;
}

.log-line {
    white-space: pre;
    margin-bottom: 3px;
}

.log-source {
    display: inline-block;
    color: $primary;
}

.log-time {
    color: $text-muted;
}

.log-empty {
    color: $muted;
}

// Dark theme
.dark {
    .console-dock {
        background-color: $dark-header-bg;
        border-top-color: $dark-border-color;
    }

    .dock-title {
        color: $dark-text-primary;
    }

    .live-badge {
        color: $dark-status-success;
        background-color: $dark-status-success-subtle;
    }

    .choice-chip {
        color: $dark-font-color;
        background-color: $dark-header-bg;
        border-color: $dark-border-strong;

        &.selected {
            color: $highlight;
            background-color: rgba($primary, 0.2);
            border-color: $highlight;
        }
    }

    .log-search-input {
        background-color: $dark-bg;
        border-color: $dark-border-color;
        color: $dark-font-color;
    }

    .clear-btn {
        color: $dark-font-color;
        background-color: $dark-bg;
    }

    .toggle-btn {
        background-color: $dark-bg;
        border-color: $dark-border-color;
    }

    .log-panel {
        background-color: $dark-bg-input;
        border-top-color: $dark-border-color;
        color: $dark-font-color;
    }

    .log-source {
        color: $highlight;
    }
}
</style>
