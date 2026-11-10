<template>
    <div class="about">
        <div class="about-brand">
            <img src="/icon.svg" alt="" width="32" height="32" />
            <span class="about-name">Docket</span>
            <span v-if="$root.info?.version" class="status-badge status-badge--accent">v{{ $root.info.version }}</span>
        </div>
        <p class="about-tagline">{{ $t("aboutTagline") }}</p>

        <div class="about-details">
            <div v-for="row in rows" :key="row.label" class="about-row">
                <span class="about-label">{{ row.label }}</span>
                <span class="about-value" :class="{ 'about-unavailable': row.value === null }">{{ row.value === undefined ? $t("loadingValue") : row.value === null ? $t("unavailable") : row.value }}</span>
            </div>
        </div>

        <div v-if="!$root.isFrontendBackendVersionMatched" class="alert alert-warning about-warning" role="alert">
            ⚠️ {{ $t("Frontend Version do not match backend version!") }}
        </div>

        <div class="about-actions">
            <a class="btn-subtle" href="https://github.com/bytoum/docket/releases" target="_blank" rel="noopener">{{ $t("checkForUpdates") }}</a>
            <a class="btn-subtle" href="https://github.com/bytoum/docket#readme" target="_blank" rel="noopener">
                {{ $t("documentation") }}
                <span class="about-arrow" :style="arrowStyle" aria-hidden="true"></span>
            </a>
        </div>

        <div class="settings-divider"></div>

        <div class="about-toggle">
            <div class="about-toggle-text">{{ $t("Show update if available") }}</div>
            <button
                type="button" class="switch" role="switch" :aria-checked="!!settings.checkUpdate" :aria-label="$t('Show update if available')"
                @click="toggle('checkUpdate')"
            >
                <img :src="settings.checkUpdate ? iconSwitchOn : iconSwitchOff" alt="" width="44" height="26" />
            </button>
        </div>
        <div class="about-toggle" :class="{ disabled: !settings.checkUpdate }">
            <div class="about-toggle-text">{{ $t("Also check beta release") }}</div>
            <button
                type="button" class="switch" role="switch" :aria-checked="!!settings.checkBeta" :aria-label="$t('Also check beta release')"
                :disabled="!settings.checkUpdate" @click="toggle('checkBeta')"
            >
                <img :src="settings.checkBeta ? iconSwitchOn : iconSwitchOff" alt="" width="44" height="26" />
            </button>
        </div>
    </div>
</template>

<script>
import iconSwitchOn from "../../assets/drawer/switch-on.svg";
import iconSwitchOff from "../../assets/drawer/switch-off.svg";
import iconArrow from "../../assets/settings/arrow-right.svg";

export default {
    data() {
        return {
            iconSwitchOn,
            iconSwitchOff,
            /** Result of getSystemInfo; undefined means still loading, null means unavailable */
            systemInfo: {
                dockerVersion: undefined,
                composeVersion: undefined,
                host: undefined,
                uptimeSeconds: undefined,
            },
        };
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

        /**
         * Mask for the arrow icon, so it follows the text colour
         * @returns {object}
         */
        arrowStyle() {
            return { "--arrow-icon": `url("${iconArrow}")` };
        },

        /**
         * Rows of the info table. An undefined value is shown as loading, a null value as unavailable.
         * @returns {{label: string, value: string|null|undefined}[]}
         */
        rows() {
            const info = this.systemInfo;
            const rows = [
                { label: this.$t("Version"),
                    value: this.$root.info?.version ?? null },
            ];
            if (!this.$root.isFrontendBackendVersionMatched) {
                rows.push({ label: this.$t("Frontend Version"),
                    value: this.$root.frontendVersion });
            }
            rows.push(
                { label: this.$t("dockerEngine"),
                    value: info.dockerVersion },
                { label: this.$t("dockerCompose"),
                    value: info.composeVersion },
                { label: this.$t("host"),
                    value: info.host },
                { label: this.$t("uptime"),
                    value: info.uptimeSeconds == null ? info.uptimeSeconds : this.formatUptime(info.uptimeSeconds) },
            );
            return rows;
        },
    },

    mounted() {
        this.$root.getSocket().emit("getSystemInfo", (res) => {
            if (res && res.ok) {
                this.systemInfo = {
                    dockerVersion: res.dockerVersion ?? null,
                    composeVersion: res.composeVersion ?? null,
                    host: res.host ?? null,
                    uptimeSeconds: typeof res.uptimeSeconds === "number" ? res.uptimeSeconds : null,
                };
            } else {
                this.systemInfo = {
                    dockerVersion: null,
                    composeVersion: null,
                    host: null,
                    uptimeSeconds: null,
                };
            }
        });
    },

    methods: {
        /**
         * Flip a boolean setting and save it
         * @param {string} key Setting name
         * @returns {void}
         */
        toggle(key) {
            this.settings[key] = !this.settings[key];
            this.saveSettings();
        },

        /**
         * Humanise a duration using its largest whole unit
         * @param {number} seconds Duration in seconds
         * @returns {string} e.g. "12 days", "3 hours", "5 minutes"
         */
        formatUptime(seconds) {
            if (seconds < 60) {
                return this.$t("uptimeLessThanMinute");
            }
            if (seconds < 3600) {
                return this.$tc("uptimeMinutes", Math.floor(seconds / 60), { n: Math.floor(seconds / 60) });
            }
            if (seconds < 86400) {
                return this.$tc("uptimeHours", Math.floor(seconds / 3600), { n: Math.floor(seconds / 3600) });
            }
            return this.$tc("uptimeDays", Math.floor(seconds / 86400), { n: Math.floor(seconds / 86400) });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../../styles/vars.scss";

.about {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
}

.about-brand {
    display: flex;
    align-items: center;
    gap: 12px;
}

.about-name {
    font-size: 20px;
    font-weight: 700;
    color: $text-primary;

    .dark & {
        color: $dark-text-primary;
    }
}

.about-tagline {
    margin: 0;
    font-size: 13px;
    color: $text-secondary;

    .dark & {
        color: $dark-text-secondary;
    }
}

.about-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 640px;
}

.about-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    font-size: 13px;
    line-height: normal;
    border-radius: 4px;
    background-color: $bg-input;

    .dark & {
        background-color: $dark-bg-input;
    }
}

.about-label {
    flex-shrink: 0;
    width: 160px;
    color: $text-muted;

    .dark & {
        color: $dark-text-muted;
    }
}

.about-value {
    min-width: 0;
    font-weight: 500;
    color: $text-primary;
    overflow-wrap: anywhere;

    .dark & {
        color: $dark-text-primary;
    }
}

.about-unavailable {
    font-weight: 400;
    color: $text-muted;

    .dark & {
        color: $dark-text-muted;
    }
}

.about-arrow {
    width: 16px;
    height: 16px;
    background-color: currentColor;
    mask: var(--arrow-icon) center / 10.8333px no-repeat;
    -webkit-mask: var(--arrow-icon) center / 10.8333px no-repeat;
}

.about-warning {
    margin: 0;
    max-width: 640px;
}

.about-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.settings-divider {
    width: 100%;
    margin: 0;
}

.about-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    max-width: 640px;

    &.disabled {
        opacity: 0.5;
    }
}

.about-toggle-text {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;

    .dark & {
        color: $dark-text-primary;
    }
}

.switch {
    flex-shrink: 0;
    display: inline-flex;
    padding: 0;
    border: none;
    background: none;
    border-radius: 13px;
    cursor: pointer;

    &:disabled {
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 2px solid $primary;
        outline-offset: 2px;
    }
}
</style>
