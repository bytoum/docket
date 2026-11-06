<template>
    <Teleport to="body">
        <transition name="drawer-fade">
            <div v-if="open" class="drawer-scrim" :class="$root.theme" @click="close"></div>
        </transition>

        <transition name="drawer-slide">
            <aside v-if="open" class="side-drawer" :class="$root.theme" role="dialog" aria-modal="true" @keydown.esc="close">
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
        return {
            iconClose,
        };
    },
    watch: {
        open(isOpen) {
            if (isOpen) {
                this.$nextTick(() => this.load());
            }
        },
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

// Wider than the other drawers, so long values fit in the editor
.side-drawer {
    width: 760px;
}

.drawer-body {
    gap: 16px;
}
</style>
