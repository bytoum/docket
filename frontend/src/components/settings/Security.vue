<template>
    <div>
        <div v-if="settingsLoaded">
            <!-- Change password -->
            <template v-if="!settings.disableAuth">
                <div class="settings-section">
                    <h3>{{ $t("Change Password") }}</h3>
                    <div class="settings-row">
                        <div class="settings-row-text">
                            <span class="settings-row-title">{{ $t("Current User") }}: {{ $root.username }}</span>
                        </div>
                        <button id="logout-btn" type="button" class="btn-subtle" @click="$root.logout">{{ $t("Logout") }}</button>
                    </div>
                    <form class="security-form" @submit.prevent="savePassword">
                        <div class="settings-field">
                            <label for="current-password">{{ $t("Current Password") }}</label>
                            <input
                                id="current-password"
                                v-model="password.currentPassword"
                                type="password"
                                class="form-control"
                                :placeholder="$t('currentPasswordPlaceholder')"
                                autocomplete="current-password"
                                required
                            />
                        </div>

                        <div class="settings-field">
                            <label for="new-password">{{ $t("New Password") }}</label>
                            <input
                                id="new-password"
                                v-model="password.newPassword"
                                type="password"
                                class="form-control"
                                :placeholder="$t('newPasswordPlaceholder')"
                                autocomplete="new-password"
                                required
                            />
                        </div>

                        <div class="settings-field">
                            <label for="repeat-new-password">{{ $t("Repeat New Password") }}</label>
                            <input
                                id="repeat-new-password"
                                v-model="password.repeatNewPassword"
                                type="password"
                                class="form-control"
                                :class="{ 'is-invalid': invalidPassword }"
                                :placeholder="$t('repeatPasswordPlaceholder')"
                                autocomplete="new-password"
                                required
                            />
                            <div class="invalid-feedback">
                                {{ $t("passwordNotMatchMsg") }}
                            </div>
                        </div>

                        <button class="btn btn-primary" type="submit">
                            {{ $t("Update Password") }}
                        </button>
                    </form>
                </div>

                <div class="settings-divider"></div>

                <!-- Two-factor authentication -->
                <div class="settings-section">
                    <h3>{{ $t("Two Factor Authentication") }}</h3>
                    <div class="settings-row">
                        <div class="settings-row-text">
                            <div class="settings-row-title">
                                {{ $t("twoFAAuthenticatorApp") }}
                                <span v-if="twoFAStatus === true" class="status-badge status-badge--success">{{ $t("enabledBadge") }}</span>
                                <span v-else-if="twoFAStatus === false" class="status-badge status-badge--neutral">{{ $t("disabledBadge") }}</span>
                            </div>
                            <div class="settings-row-desc">{{ $t("twoFAAuthenticatorDesc") }}</div>
                        </div>
                        <button class="btn-subtle" type="button" @click="$refs.TwoFADialog.show()">
                            {{ $t("manageButton") }}
                        </button>
                    </div>
                </div>

                <div class="settings-divider"></div>
            </template>

            <!-- Disable / enable authentication -->
            <div class="settings-section">
                <h3>{{ settings.disableAuth ? $t("Enable Auth") : $t("disableAuthTitle") }}</h3>
                <div class="settings-row">
                    <div class="settings-row-text">
                        <div class="settings-row-title">{{ settings.disableAuth ? $t("enableAuthTitle") : $t("turnOffSignIn") }}</div>
                        <div class="settings-row-desc">{{ settings.disableAuth ? $t("enableAuthDesc") : $t("turnOffSignInDesc") }}</div>
                    </div>
                    <button v-if="settings.disableAuth" id="enableAuth-btn" type="button" class="btn btn-primary" @click="enableAuth">{{ $t("Enable Auth") }}</button>
                    <button v-else id="disableAuth-btn" type="button" class="btn-danger-subtle" @click="confirmDisableAuth">
                        <span class="trash-icon" :style="trashIconStyle" aria-hidden="true"></span>
                        {{ $t("disableSignIn") }}
                    </button>
                </div>
            </div>
        </div>

        <TwoFADialog ref="TwoFADialog" @changed="loadTwoFAStatus" />

        <Confirm ref="confirmDisableAuth" btn-style="btn-danger" :yes-text="$t('I understand, please disable')" :no-text="$t('Leave')" @yes="disableAuth">
            <i18n-t keypath="disableauth.message1" tag="p">
                <template #disableAuth>
                    <strong>{{ $t('disableAuth') }}</strong>
                </template>
            </i18n-t>

            <i18n-t keypath="disableauth.message2" tag="p">
                <template #scenarios>
                    <strong>{{ $t('scenarios') }}</strong>
                </template>
            </i18n-t>

            <p>{{ $t("Please use this option carefully!") }}</p>

            <div class="mb-3">
                <label for="current-password2" class="form-label">
                    {{ $t("Current Password") }}
                </label>
                <input
                    id="current-password2"
                    v-model="password.currentPassword"
                    type="password"
                    class="form-control"
                    required
                />
            </div>
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";
import TwoFADialog from "../../components/TwoFADialog.vue";
import iconTrash from "../../assets/settings/trash.svg";

export default {
    components: {
        Confirm,
        TwoFADialog
    },

    data() {
        return {
            // The URL is quoted because inlined SVG data URIs contain single quotes
            trashIconStyle: { "--trash-icon": `url("${iconTrash}")` },
            invalidPassword: false,
            twoFAStatus: null,
            password: {
                currentPassword: "",
                newPassword: "",
                repeatNewPassword: "",
            }
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
        }
    },

    watch: {
        "password.repeatNewPassword"() {
            this.invalidPassword = false;
        },
    },

    mounted() {
        this.loadTwoFAStatus();
    },

    methods: {
        /** Load whether 2FA is enabled for the current user */
        loadTwoFAStatus() {
            this.$root.getSocket().emit("twoFAStatus", (res) => {
                if (res.ok) {
                    this.twoFAStatus = res.status;
                }
            });
        },

        /** Check new passwords match before saving them */
        savePassword() {
            if (this.password.newPassword !== this.password.repeatNewPassword) {
                this.invalidPassword = true;
            } else {
                this.$root
                    .getSocket()
                    .emit("changePassword", this.password, (res) => {
                        this.$root.toastRes(res);
                        if (res.ok) {
                            this.password.currentPassword = "";
                            this.password.newPassword = "";
                            this.password.repeatNewPassword = "";
                        }
                    });
            }
        },

        /** Disable authentication for web app access */
        disableAuth() {
            this.settings.disableAuth = true;

            // Need current password to disable auth
            // Set it to empty if done
            this.saveSettings(() => {
                this.password.currentPassword = "";
                this.$root.username = null;
                this.$root.socketIO.token = "autoLogin";
            }, this.password.currentPassword);
        },

        /** Enable authentication for web app access */
        enableAuth() {
            this.settings.disableAuth = false;
            this.saveSettings();
            this.$root.storage().removeItem("token");
            location.reload();
        },

        /** Show confirmation dialog for disable auth */
        confirmDisableAuth() {
            this.$refs.confirmDisableAuth.show();
        },

    },
};
</script>

<style lang="scss" scoped>
.security-form {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 420px;

    .settings-field {
        align-self: stretch;
    }
}

// Trash icon in the Disable button. A mask, so it takes the text colour.
.trash-icon {
    width: 16px;
    height: 16px;
    background-color: currentColor;
    mask: var(--trash-icon) center / contain no-repeat;
    -webkit-mask: var(--trash-icon) center / contain no-repeat;
}
</style>
