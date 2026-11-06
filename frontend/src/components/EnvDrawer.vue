<template>
    <Teleport to="body">
        <transition name="drawer-fade">
            <div v-if="open" class="drawer-scrim" :class="$root.theme" @click="close"></div>
        </transition>

        <transition name="drawer-slide">
            <aside
                v-if="open" class="side-drawer" :class="[ $root.theme, { resizing } ]" :style="{ width: width + 'px' }"
                role="dialog" aria-modal="true" @keydown.esc="close"
            >
                <!-- Drag the left edge to resize (arrow keys work too) -->
                <div
                    class="resize-handle" role="separator" aria-orientation="vertical" tabindex="0"
                    :aria-label="$t('resizeDrawer')" :aria-valuenow="width" :aria-valuemin="MIN_WIDTH"
                    @pointerdown="startResize" @keydown="onResizeKeydown"
                ></div>

                <!-- Header -->
                <header class="drawer-header">
                    <div class="drawer-title">
                        <h2>{{ $t("editEnvTitle") }}</h2>
                        <p>{{ $t("editEnvSubtitle", [ serviceName ]) }}</p>
                    </div>
                    <button type="button" class="square-btn" :aria-label="$t('cancel')" @click="close">
                        <span class="icon"><img :src="iconClose" alt="" width="9.5" height="9.5" /></span>
                    </button>
                </header>

                <!-- Body -->
                <form id="env-drawer-form" class="drawer-body" @submit.prevent="submit">
                    <EnvEditor ref="editor" :label="$t('envVariables')" />
                </form>

                <!-- Footer -->
                <footer class="drawer-footer">
                    <span class="footer-spacer"></span>
                    <button type="button" class="footer-btn secondary" @click="close">{{ $t("cancel") }}</button>
                    <button type="submit" form="env-drawer-form" class="footer-btn primary" :disabled="busy">
                        {{ $t("saveChanges") }}
                    </button>
                </footer>
            </aside>
        </transition>
    </Teleport>
</template>

<script>
import EnvEditor, { envToRows } from "./EnvEditor.vue";
import iconClose from "../assets/drawer/close.svg";

const WIDTH_STORAGE_KEY = "envDrawerWidth";
const DEFAULT_WIDTH = 760;
const MIN_WIDTH = 520;
// Keep this much of the page visible to the left of the drawer
const MIN_FREE_SPACE = 80;
const KEYBOARD_STEP = 40;

/**
 * Drawer that edits one container's environment variables, as a key/value
 * list or as raw "KEY=value" text in a code editor.
 */
export default {
    components: {
        EnvEditor,
    },
    props: {
        /** Whether the drawer is shown */
        open: {
            type: Boolean,
            default: false,
        },
        /** Name of the service whose environment is edited */
        serviceName: {
            type: String,
            default: "",
        },
        /** Parsed compose file of the stack */
        jsonConfig: {
            type: Object,
            required: true,
        },
        /** Disables the save button while the parent is working */
        busy: {
            type: Boolean,
            default: false,
        },
    },
    emits: [ "close", "submit" ],
    data() {
        let width = DEFAULT_WIDTH;
        try {
            const saved = parseInt(localStorage.getItem(WIDTH_STORAGE_KEY), 10);
            if (saved >= MIN_WIDTH) {
                width = saved;
            }
        } catch (e) {
            // Storage can be unavailable, e.g. in a private window
        }

        return {
            iconClose,
            MIN_WIDTH,
            width,
            resizing: false,
        };
    },
    watch: {
        open(isOpen) {
            if (isOpen) {
                this.width = this.clampWidth(this.width);
                this.$nextTick(() => this.load());
            }
        },
    },
    mounted() {
        window.addEventListener("resize", this.onWindowResize);
    },
    unmounted() {
        window.removeEventListener("resize", this.onWindowResize);
        this.stopResize();
    },
    methods: {
        /**
         * Fill the editor from the service's environment
         * @returns {void}
         */
        load() {
            const service = this.jsonConfig.services?.[this.serviceName] ?? {};
            this.$refs.editor?.reset(envToRows(service.environment));
        },

        close() {
            this.$emit("close");
        },

        /**
         * Keep a width between the minimum and what the window allows
         * @param {number} width Width in pixels
         * @returns {number} Clamped width
         */
        clampWidth(width) {
            const max = Math.max(MIN_WIDTH, window.innerWidth - MIN_FREE_SPACE);
            return Math.round(Math.min(Math.max(width, MIN_WIDTH), max));
        },

        /**
         * Set the drawer width and optionally remember it
         * @param {number} width Width in pixels
         * @param {boolean} save Store it for the next time
         * @returns {void}
         */
        setWidth(width, save = true) {
            this.width = this.clampWidth(width);
            if (save) {
                try {
                    localStorage.setItem(WIDTH_STORAGE_KEY, String(this.width));
                } catch (e) {
                    // Ignore, the setting is only a convenience
                }
            }
        },

        /**
         * Start dragging the left edge
         * @param {PointerEvent} event Pointer event
         * @returns {void}
         */
        startResize(event) {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            this.resizing = true;
            this.resizeStartX = event.clientX;
            this.resizeStartWidth = this.width;
            window.addEventListener("pointermove", this.onResizeMove);
            window.addEventListener("pointerup", this.stopResize);
            window.addEventListener("pointercancel", this.stopResize);
        },

        /**
         * Dragging left makes the drawer wider
         * @param {PointerEvent} event Pointer event
         * @returns {void}
         */
        onResizeMove(event) {
            this.setWidth(this.resizeStartWidth + (this.resizeStartX - event.clientX), false);
        },

        /**
         * Stop dragging and remember the width
         * @returns {void}
         */
        stopResize() {
            window.removeEventListener("pointermove", this.onResizeMove);
            window.removeEventListener("pointerup", this.stopResize);
            window.removeEventListener("pointercancel", this.stopResize);
            if (this.resizing) {
                this.resizing = false;
                this.setWidth(this.width);
            }
        },

        /**
         * Left / right arrows on the focused edge change the width
         * @param {KeyboardEvent} event Key event
         * @returns {void}
         */
        onResizeKeydown(event) {
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                this.setWidth(this.width + KEYBOARD_STEP);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                this.setWidth(this.width - KEYBOARD_STEP);
            }
        },

        /**
         * Shrink the drawer if the window got too small for it
         * @returns {void}
         */
        onWindowResize() {
            const clamped = this.clampWidth(this.width);
            if (clamped !== this.width) {
                this.width = clamped;
            }
        },

        /**
         * Emit the service name with the new variables
         * @returns {void}
         */
        submit() {
            const rows = this.$refs.editor?.collect();
            if (!rows) {
                return;
            }
            this.$emit("submit", {
                serviceName: this.serviceName,
                rows,
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/drawer.scss";

// Width is set inline; never wider than the window
.side-drawer {
    max-width: 100vw;
}

// Thin strip over the left edge; the line turns blue on hover
.resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -4px;
    width: 8px;
    z-index: 1;
    cursor: ew-resize;
    touch-action: none;

    &::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 3px;
        width: 2px;
        background-color: transparent;
        transition: background-color 0.15s;
    }

    &:hover::after,
    &:focus-visible::after,
    .resizing &::after {
        background-color: $primary;
    }

    &:focus-visible {
        outline: none;
    }
}

// No text selection or slide animation while dragging
.resizing {
    user-select: none;
    transition: none;
}

.drawer-body {
    gap: 16px;
}
</style>
