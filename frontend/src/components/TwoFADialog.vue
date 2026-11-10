<template>
    <form @submit.prevent="submit">
        <div ref="modal" class="modal fade" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            {{ $t("Setup 2FA") }}
                            <span v-if="twoFAStatus == true" class="status-badge active">{{ $t("Active") }}</span>
                            <span v-if="twoFAStatus == false" class="status-badge inactive">{{ $t("Inactive") }}</span>
                        </h5>
                        <button :disabled="processing" type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <div v-if="uri && twoFAStatus == false" class="mx-auto text-center qr-wrap">
                                <div class="qr-box">
                                    <vue-qrcode :key="uri" :value="uri" type="image/png" :quality="1" :color="{ light: '#ffffffff' }" />
                                </div>
                                <button v-show="!showSecret" type="button" class="btn btn-outline-primary btn-sm mt-2" @click="showSecret = true">{{ $t("Show secret") }}</button>
                            </div>
                            <div v-if="showSecret && secret && twoFAStatus == false" class="text-center mt-2">
                                <code class="secret-code">{{ secret }}</code>
                            </div>

                            <div v-if="!(uri && twoFAStatus == false)" class="mb-3">
                                <label for="current-password" class="form-label">
                                    {{ $t("Current Password") }}
                                </label>
                                <input
                                    id="current-password"
                                    v-model="currentPassword"
                                    type="password"
                                    class="form-control"
                                    autocomplete="current-password"
                                    required
                                />
                            </div>

                            <button v-if="uri == null && twoFAStatus == false" class="btn btn-primary" type="button" @click="prepare2FA()">
                                {{ $t("Enable 2FA") }}
                            </button>

                            <button v-if="twoFAStatus == true" class="btn btn-danger" type="button" :disabled="processing" @click="confirmDisableTwoFA()">
                                {{ $t("Disable 2FA") }}
                            </button>

                            <div v-if="uri && twoFAStatus == false" class="mt-3">
                                <label for="basic-url" class="form-label">{{ $t("twoFAVerifyLabel") }}</label>
                                <div class="input-group">
                                    <input v-model="token" type="text" maxlength="7" class="form-control" autocomplete="one-time-code" required>
                                    <button class="btn btn-outline-primary" type="button" @click="verifyToken()">{{ $t("Verify Token") }}</button>
                                </div>
                                <p v-show="tokenValid" class="mt-2 token-valid">{{ $t("tokenValidSettingsMsg") }}</p>
                                <p v-show="tokenInvalid" class="mt-2 token-invalid">{{ $t("tokenInvalidSettingsMsg") }}</p>
                            </div>
                        </div>
                    </div>

                    <div v-if="uri && twoFAStatus == false" class="modal-footer">
                        <button type="submit" class="btn btn-primary" :disabled="processing || tokenValid == false" @click="confirmEnableTwoFA()">
                            <div v-if="processing" class="spinner-border spinner-border-sm me-1"></div>
                            {{ $t("Save") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </form>

    <Confirm ref="confirmEnableTwoFA" btn-style="btn-danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="save2FA">
        {{ $t("confirmEnableTwoFAMsg") }}
    </Confirm>

    <Confirm ref="confirmDisableTwoFA" btn-style="btn-danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="disable2FA">
        {{ $t("confirmDisableTwoFAMsg") }}
    </Confirm>
</template>

<script lang="ts">
import { Modal } from "bootstrap";
import Confirm from "./Confirm.vue";
import VueQrcode from "vue-qrcode";

export default {
    components: {
        Confirm,
        VueQrcode,
    },
    props: {},
    emits: [ "changed" ],
    data() {
        return {
            currentPassword: "",
            processing: false,
            uri: null,
            tokenValid: false,
            tokenInvalid: false,
            twoFAStatus: null,
            token: null,
            showSecret: false,
        };
    },
    computed: {
        /**
         * The shared secret, parsed from the otpauth URI. Only set during setup.
         * @returns {string} The secret, or an empty string
         */
        secret() {
            if (!this.uri) {
                return "";
            }
            try {
                return new URL(this.uri).searchParams.get("secret") || "";
            } catch (e) {
                return "";
            }
        },
    },
    watch: {
        /** A new code has not been checked yet, so clear both results */
        token() {
            this.tokenValid = false;
            this.tokenInvalid = false;
        },
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
        this.$refs.modal.addEventListener("hidden.bs.modal", this.resetForm);
        this.getStatus();
    },
    beforeUnmount() {
        this.$refs.modal?.removeEventListener("hidden.bs.modal", this.resetForm);
    },
    methods: {
        /** Clear the password, code and setup state when the dialog closes */
        resetForm() {
            this.currentPassword = "";
            this.token = null;
            this.uri = null;
            this.tokenValid = false;
            this.tokenInvalid = false;
            this.showSecret = false;
        },

        /** Show the dialog */
        show() {
            this.modal.show();
        },

        /** Show dialog to confirm enabling 2FA */
        confirmEnableTwoFA() {
            this.$refs.confirmEnableTwoFA.show();
        },

        /** Show dialog to confirm disabling 2FA */
        confirmDisableTwoFA() {
            this.$refs.confirmDisableTwoFA.show();
        },

        /** Prepare 2FA configuration */
        prepare2FA() {
            this.processing = true;

            this.$root.getSocket().emit("prepare2FA", this.currentPassword, (res) => {
                this.processing = false;

                if (res.ok) {
                    this.uri = res.uri;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /** Save the current 2FA configuration */
        save2FA() {
            this.processing = true;

            this.$root.getSocket().emit("save2FA", this.currentPassword, (res) => {
                this.processing = false;

                if (res.ok) {
                    this.$root.toastRes(res);
                    this.getStatus();
                    this.$emit("changed");
                    this.modal.hide();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /** Disable 2FA for this user */
        disable2FA() {
            this.processing = true;

            this.$root.getSocket().emit("disable2FA", this.currentPassword, (res) => {
                this.processing = false;

                if (res.ok) {
                    this.$root.toastRes(res);
                    this.getStatus();
                    this.$emit("changed");
                    this.modal.hide();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /** Verify the token generated by the user */
        verifyToken() {
            this.$root.getSocket().emit("verifyToken", this.token, this.currentPassword, (res) => {
                if (res.ok) {
                    this.tokenValid = !!res.valid;
                    this.tokenInvalid = !res.valid;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /** Get current status of 2FA */
        getStatus() {
            this.$root.getSocket().emit("twoFAStatus", (res) => {
                if (res.ok) {
                    this.twoFAStatus = res.status;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.qr-wrap {
    width: 210px;
}

.qr-box {
    background-color: #fff; // stays white so the QR code scans in dark mode
    border-radius: 4px;
    padding: 8px;
}

.secret-code {
    user-select: all;
    word-break: break-all;
}

.status-badge {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    vertical-align: middle;

    &.active {
        color: $accent-primary;
        background-color: $accent-primary-subtle;
    }

    &.inactive {
        color: $status-neutral;
        background-color: $status-neutral-subtle;
    }
}

.token-valid {
    color: $status-success;
}

.token-invalid {
    color: $status-danger;
}

.dark {
    .modal-dialog .form-text, .modal-dialog p {
        color: $dark-font-color;
    }

    .modal-dialog p.token-valid {
        color: $dark-status-success;
    }

    .modal-dialog p.token-invalid {
        color: $dark-status-danger;
    }

    .status-badge.active {
        color: $dark-accent-primary;
        background-color: $dark-accent-primary-subtle;
    }

    .status-badge.inactive {
        color: $dark-status-neutral;
        background-color: $dark-status-neutral-subtle;
    }
}
</style>
