<template>
    <Teleport to="body">
        <transition name="drawer-fade">
            <div v-if="open" class="drawer-scrim" @click="close"></div>
        </transition>

        <transition name="drawer-slide">
            <aside v-if="open" class="side-drawer" :class="$root.theme" role="dialog" aria-modal="true" @keydown.esc="close">
                <!-- Header -->
                <header class="drawer-header">
                    <div class="drawer-title">
                        <h2>{{ serviceName ? $t("containerWebhook") : $t("webhook") }}</h2>
                        <p>{{ serviceName ? serviceName + " · " + stackName : stackName }}</p>
                    </div>
                    <button type="button" class="square-btn" :aria-label="$t('cancel')" @click="close">
                        <span class="icon"><img :src="icons.close" alt="" width="9.5" height="9.5" /></span>
                    </button>
                </header>

                <!-- Body -->
                <div class="drawer-body">
                    <p class="field-hint intro">{{ serviceName ? $t("containerWebhookIntro", [ serviceName ]) : $t("webhookIntro") }}</p>

                    <p v-if="loading" class="field-hint">…</p>

                    <p v-else-if="unsupported" class="field-hint">{{ $t("webhookUnsupported") }}</p>

                    <template v-else-if="webhook">
                        <div v-if="token" class="field">
                            <label class="field-label" for="webhook-url">{{ $t("webhookUrl") }}</label>
                            <div class="copy-row">
                                <input id="webhook-url" class="field-input mono" :value="url" readonly @focus="$event.target.select()" />
                                <button type="button" class="footer-btn secondary" @click="copy(url)">{{ $t("webhookCopy") }}</button>
                            </div>
                        </div>
                        <p v-else class="field-hint warning">{{ $t("webhookUrlUnavailable") }}</p>

                        <dl v-if="webhook.createdDate" class="details">
                            <dt>{{ $t("webhookCreated") }}</dt>
                            <dd>{{ formatDate(webhook.createdDate) }}</dd>
                            <dt>{{ $t("webhookLastTriggered") }}</dt>
                            <dd>{{ webhook.lastTriggered ? formatDate(webhook.lastTriggered) : $t("webhookNever") }}</dd>
                            <template v-if="webhook.lastResult">
                                <dt>{{ $t("webhookLastResult") }}</dt>
                                <dd><span class="result-badge" :class="'result-' + webhook.lastResult">{{ resultLabel(webhook.lastResult) }}</span></dd>
                            </template>
                        </dl>

                        <div v-if="token" class="field">
                            <span class="field-label">{{ $t("webhookGithubStep") }}</span>
                            <pre class="snippet">{{ snippet }}</pre>
                            <div>
                                <button type="button" class="footer-btn secondary" @click="copy(snippet)">{{ $t("webhookCopy") }}</button>
                            </div>
                            <p class="field-hint">{{ $t("webhookGithubHint") }}</p>
                        </div>
                    </template>
                </div>

                <!-- Footer -->
                <footer v-if="!loading && !unsupported" class="drawer-footer">
                    <template v-if="webhook">
                        <button type="button" class="footer-btn danger" :disabled="busy" @click="remove">{{ $t("deleteWebhook") }}</button>
                        <span class="footer-spacer"></span>
                        <button type="button" class="footer-btn secondary" :disabled="busy" @click="regenerate">{{ $t("regenerateWebhook") }}</button>
                    </template>
                    <template v-else>
                        <span class="footer-spacer"></span>
                        <button type="button" class="footer-btn primary" :disabled="busy" @click="create">{{ $t("createWebhook") }}</button>
                    </template>
                </footer>
            </aside>
        </transition>
    </Teleport>
</template>

<script>
import iconClose from "../assets/drawer/close.svg";

const icons = {
    close: iconClose,
};

// How long to wait for getWebhook before treating the agent as too old
const LOAD_TIMEOUT_MS = 5000;

/**
 * Side drawer to create, regenerate or delete a deploy webhook, for a whole
 * stack or for one of its containers.
 * Webhooks created before the server stored tokens have no URL to show and
 * must be regenerated.
 */
export default {
    props: {
        /** Whether the drawer is shown */
        open: {
            type: Boolean,
            default: false,
        },
        /** Stack the webhook belongs to */
        stackName: {
            type: String,
            required: true,
        },
        /** Service the webhook updates, or "" for the whole stack */
        serviceName: {
            type: String,
            default: "",
        },
        /** Agent endpoint of the stack, "" for this instance */
        endpoint: {
            type: String,
            default: "",
        },
    },
    emits: [ "close", "changed" ],
    data() {
        return {
            icons,
            loading: false,
            unsupported: false,
            busy: false,
            webhook: null,
            token: "",
        };
    },
    computed: {
        /**
         * Event arguments that name the webhook. The service is only sent
         * when set, so whole-stack webhooks work with any agent.
         * @returns {string[]} Stack name, then the service name if any
         */
        target() {
            return this.serviceName ? [ this.stackName, this.serviceName ] : [ this.stackName ];
        },

        /**
         * Full webhook URL on the host that runs the stack
         * @returns {string} URL
         */
        url() {
            // The backend serves the webhook. In development it runs on port
            // 5001 next to the Vite dev server, as in the socket connection.
            let base = location.origin;
            const env = process.env.NODE_ENV || "production";
            if (env === "development" || localStorage.dev === "dev") {
                base = location.protocol + "//" + location.hostname + ":5001";
            }
            if (this.endpoint !== "") {
                base = (this.$root.agentList[this.endpoint]?.url ?? "").replace(/\/+$/, "");
            }
            return base + "/api/webhook/" + this.token;
        },

        /**
         * GitHub Actions step that calls the webhook
         * @returns {string} YAML
         */
        snippet() {
            return "- name: Redeploy on Docket\n  run: curl -fsS -X POST --max-time 600 \"${{ secrets.DOCKET_WEBHOOK_URL }}\"";
        },
    },
    watch: {
        open(isOpen) {
            this.token = "";
            if (isOpen) {
                this.load();
            }
        },
    },
    methods: {
        /**
         * Close the drawer
         * @returns {void}
         */
        close() {
            this.token = "";
            this.$emit("close");
        },

        /**
         * Load the webhook's details. No reply means an agent without webhooks.
         * @returns {void}
         */
        load() {
            this.loading = true;
            this.unsupported = false;
            this.webhook = null;
            let done = false;
            const timer = setTimeout(() => {
                if (!done) {
                    done = true;
                    this.loading = false;
                    this.unsupported = true;
                }
            }, LOAD_TIMEOUT_MS);
            this.$root.emitAgent(this.endpoint, "getWebhook", ...this.target, (res) => {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timer);
                this.loading = false;
                if (res.ok) {
                    this.webhook = res.webhook;
                    this.token = res.webhook?.token ?? "";
                } else {
                    this.unsupported = true;
                }
            });
        },

        /**
         * Create the webhook, or replace it with a new URL
         * @returns {void}
         */
        create() {
            this.busy = true;
            this.$root.emitAgent(this.endpoint, "createWebhook", ...this.target, (res) => {
                this.busy = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.token = res.token;
                this.$emit("changed");
                this.webhook = {
                    createdDate: new Date().toISOString(),
                    lastTriggered: null,
                    lastResult: null,
                    token: res.token,
                };
            });
        },

        /**
         * Replace the URL after a confirmation
         * @returns {void}
         */
        regenerate() {
            if (confirm(this.$t("regenerateWebhookConfirm"))) {
                this.create();
            }
        },

        /**
         * Delete the webhook after a confirmation
         * @returns {void}
         */
        remove() {
            if (!confirm(this.$t("deleteWebhookConfirm"))) {
                return;
            }
            this.busy = true;
            this.$root.emitAgent(this.endpoint, "deleteWebhook", ...this.target, (res) => {
                this.busy = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.token = "";
                this.webhook = null;
                this.$emit("changed");
            });
        },

        /**
         * Copy text to the clipboard
         * @param {string} text Text to copy
         * @returns {Promise<void>}
         */
        async copy(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.$root.toastSuccess(this.$t("webhookCopied"));
            } catch (e) {
                this.$root.toastError(this.$t("webhookCopyFailed"));
            }
        },

        /**
         * A time in the browser's time zone
         * @param {string|null} value ISO 8601 time
         * @returns {string} Local date and time
         */
        formatDate(value) {
            return value ? new Date(value).toLocaleString() : "—";
        },

        /**
         * Label of a run result
         * @param {string} result success, failed or busy
         * @returns {string} Label
         */
        resultLabel(result) {
            const keys = {
                success: "webhookResultSuccess",
                failed: "webhookResultFailed",
                busy: "webhookResultBusy",
            };
            return keys[result] ? this.$t(keys[result]) : result;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/drawer.scss";

.intro {
    font-size: 13px;
}

.copy-row {
    display: flex;
    gap: 8px;
}

.mono,
.snippet {
    font-family: SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
}

.snippet {
    margin: 0;
    padding: 10px;
    white-space: pre-wrap;
    word-break: break-all;
    background-color: $bg-input;
    border-radius: 4px;
}

.warning {
    color: $status-warning;
}

.details {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 16px;
    margin: 0;
    font-size: 14px;

    dt {
        font-weight: 600;
        color: $muted;
    }

    dd {
        margin: 0;
    }
}

.result-badge {
    display: inline-block;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
}

.result-success {
    color: $status-success;
    background-color: $status-success-subtle;
}

.result-busy {
    color: $status-warning;
    background-color: $status-warning-subtle;
}

.result-failed {
    color: $status-danger;
    background-color: $status-danger-subtle;
}

.side-drawer.dark {
    .snippet {
        background-color: $dark-bg-input;
    }

    .warning {
        color: $dark-status-warning;
    }

    .result-success {
        color: $dark-status-success;
        background-color: $dark-status-success-subtle;
    }

    .result-busy {
        color: $dark-status-warning;
        background-color: $dark-status-warning-subtle;
    }

    .result-failed {
        color: $dark-status-danger;
        background-color: $dark-status-danger-subtle;
    }
}
</style>
