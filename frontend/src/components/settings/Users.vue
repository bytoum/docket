<template>
    <div>
        <div v-if="settingsLoaded && settings.disableAuth" class="alert alert-warning">
            {{ $t("authDisabledUsersHint") }}
        </div>

        <!-- Header action (owner only), shown in the card header -->
        <Teleport v-if="isOwner" to="#settings-header-actions">
            <button type="button" class="btn btn-primary" @click="openAddUser">
                <span class="plus-icon" aria-hidden="true"></span>
                {{ $t("addUser") }}
            </button>
        </Teleport>

        <div class="settings-section">
            <h3>{{ $t("usersAccounts") }}</h3>

            <ul class="user-list">
                <li v-for="user in userList" :key="user.id" class="user-row" :class="{ 'user-disabled': !user.active }">
                    <div class="user-info">
                        <span class="user-avatar" :class="{ 'user-avatar--disabled': !user.active }" aria-hidden="true">{{ initial(user) }}</span>
                        <strong class="user-name">{{ user.username }}</strong>
                        <span v-if="user.id === currentUserID" class="status-badge status-badge--accent">{{ $t("youBadge") }}</span>
                        <span v-if="user.isOwner" class="status-badge status-badge--success">{{ $t("ownerBadge") }}</span>
                        <span v-if="!user.active" class="status-badge status-badge--neutral">{{ $t("disabledBadge") }}</span>
                        <span class="status-badge" :class="twoFABadgeClass(user)">{{ user.twoFA ? $t("twoFAOn") : $t("twoFAOff") }}</span>
                    </div>

                    <div v-if="isOwner && user.id !== currentUserID" class="user-actions">
                        <button v-if="user.twoFA" type="button" class="btn-subtle" :disabled="processing" @click="confirmReset2FA(user)">
                            {{ $t("reset2FA") }}
                        </button>
                        <button type="button" class="btn-subtle" :disabled="processing" @click="setActive(user, !user.active)">
                            {{ user.active ? $t("disableUser") : $t("enableUser") }}
                        </button>
                        <button type="button" class="btn-danger-subtle" :disabled="processing" @click="confirmDelete(user)">
                            <span class="trash-icon" :style="trashIconStyle" aria-hidden="true"></span>
                            {{ $t("deleteUser") }}
                        </button>
                    </div>
                </li>
            </ul>

            <p v-if="loaded && !isOwner" class="settings-help">{{ $t("ownerOnlyHint") }}</p>
        </div>

        <!-- Add user dialog (owner only) -->
        <form v-if="isOwner" @submit.prevent="addUser">
            <div ref="modal" class="modal fade" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered add-user-modal">
                    <div class="modal-content add-user-dialog settings-dialog">
                        <div class="dialog-header">
                            <div class="dialog-title">
                                <h5>{{ $t("addUser") }}</h5>
                                <p>{{ $t("addUserSubtitle") }}</p>
                            </div>
                            <button type="button" class="btn-subtle dialog-close" data-bs-dismiss="modal" aria-label="Close">
                                <span class="close-icon" aria-hidden="true"></span>
                            </button>
                        </div>

                        <div class="dialog-body">
                            <div class="settings-field">
                                <label for="new-user-username">{{ $t("Username") }}</label>
                                <input
                                    id="new-user-username" v-model.trim="newUser.username" class="form-control"
                                    :placeholder="$t('usernamePlaceholder')" autocomplete="off" required
                                />
                            </div>

                            <div class="settings-field">
                                <label for="new-user-password">{{ $t("Password") }}</label>
                                <div class="settings-field-inline">
                                    <input
                                        id="new-user-password" v-model="newUser.password" :type="showPassword ? 'text' : 'password'"
                                        class="form-control" :placeholder="$t('passwordPlaceholder')" autocomplete="new-password" required
                                    />
                                    <button type="button" class="btn-subtle" @click="generatePassword">{{ $t("generatePassword") }}</button>
                                    <button v-if="showPassword && newUser.password" type="button" class="btn-subtle" @click="copyPassword">{{ $t("copyPassword") }}</button>
                                </div>
                                <div class="settings-help">{{ $t("newUserPasswordHelp") }}</div>
                                <div v-if="showPassword" class="settings-help">{{ $t("generatedPasswordHint") }}</div>
                            </div>

                            <div class="settings-field">
                                <label for="new-user-repeat-password">{{ $t("Repeat Password") }}</label>
                                <input
                                    id="new-user-repeat-password" v-model="newUser.repeatPassword" :type="showPassword ? 'text' : 'password'"
                                    class="form-control" :class="{ 'is-invalid': invalidPassword }"
                                    :placeholder="$t('repeatPasswordPlaceholder')" autocomplete="new-password" required
                                />
                                <div v-if="invalidPassword" class="field-error">{{ $t("passwordNotMatchMsg") }}</div>
                            </div>
                        </div>

                        <div class="dialog-footer">
                            <button type="button" class="btn-subtle" data-bs-dismiss="modal">{{ $t("cancel") }}</button>
                            <button class="btn btn-primary" type="submit" :disabled="processing">
                                <span class="plus-icon" aria-hidden="true"></span>
                                {{ $t("addUser") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </form>

        <Confirm ref="confirmDelete" btn-style="btn-danger" :yes-text="$t('deleteUser')" :no-text="$t('cancel')" :title="$t('deleteUserTitle')" @yes="deleteUser">
            {{ $t("deleteUserMsg", [ userToDelete?.username ?? "" ]) }}
        </Confirm>

        <Confirm ref="confirmReset2FA" btn-style="btn-danger" :yes-text="$t('reset2FA')" :no-text="$t('cancel')" :title="$t('reset2FATitle')" @yes="reset2FA">
            {{ $t("reset2FAMsg", [ userToReset?.username ?? "" ]) }}
        </Confirm>
    </div>
</template>

<script>
import { Modal } from "bootstrap";
import Confirm from "../../components/Confirm.vue";
import iconTrash from "../../assets/settings/trash.svg";
import { genSecret } from "../../../../common/util-common";

// Length of generated passwords
const GENERATED_PASSWORD_LENGTH = 20;

/**
 * Settings page to list users. The owner can also add, disable and delete them.
 */
export default {
    components: {
        Confirm,
    },

    data() {
        return {
            // The URL is quoted because inlined SVG data URIs contain single quotes
            trashIconStyle: { "--trash-icon": `url("${iconTrash}")` },
            loaded: false,
            processing: false,
            userList: [],
            currentUserID: null,
            userToDelete: null,
            userToReset: null,
            invalidPassword: false,
            // Shown in plain text after "Generate", so it can be copied
            showPassword: false,
            newUser: {
                username: "",
                password: "",
                repeatPassword: "",
            },
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },

        /**
         * Whether the logged-in user is the owner
         * @returns {boolean} True for the owner
         */
        isOwner() {
            return this.userList.some((user) => user.id === this.currentUserID && user.isOwner);
        },
    },

    watch: {
        "newUser.repeatPassword"() {
            this.invalidPassword = false;
        },
    },

    mounted() {
        this.loadUsers();
    },

    beforeUnmount() {
        this.removeModal();
    },

    methods: {
        /**
         * Create the Bootstrap modal on first use. The form only exists for the owner.
         * @returns {void}
         */
        ensureModal() {
            if (this.modal || !this.$refs.modal) {
                return;
            }
            this.modal = new Modal(this.$refs.modal);
            this.modalElement = this.$refs.modal;
            this.modalElement.addEventListener("hidden.bs.modal", this.resetForm);
        },

        /**
         * Dispose of the modal and its listener
         * @returns {void}
         */
        removeModal() {
            this.modalElement?.removeEventListener("hidden.bs.modal", this.resetForm);
            this.modal?.dispose();
            this.modal = null;
            this.modalElement = null;
        },

        /**
         * Open the Add user dialog
         * @returns {void}
         */
        openAddUser() {
            this.ensureModal();
            this.modal?.show();
        },

        /**
         * Clear the Add user form and its error
         * @returns {void}
         */
        resetForm() {
            this.newUser = {
                username: "",
                password: "",
                repeatPassword: "",
            };
            this.showPassword = false;
            this.invalidPassword = false;
        },

        /**
         * First letter of the username, for the avatar
         * @param {object} user User to show
         * @returns {string} Uppercase initial
         */
        initial(user) {
            return (user.username || "?").charAt(0).toUpperCase();
        },

        /**
         * Badge colour for the 2FA state. A disabled user's badge is neutral.
         * @param {object} user User to show
         * @returns {string} Badge modifier class
         */
        twoFABadgeClass(user) {
            if (!user.active) {
                return "status-badge--neutral";
            }
            return user.twoFA ? "status-badge--success" : "status-badge--warning";
        },

        /**
         * Load the user list from the server
         * @returns {void}
         */
        loadUsers() {
            this.$root.getSocket().emit("getUserList", (res) => {
                if (res.ok) {
                    this.userList = res.userList;
                    this.currentUserID = res.currentUserID;
                    this.loaded = true;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Add the user from the form
         * @returns {void}
         */
        addUser() {
            if (this.newUser.password !== this.newUser.repeatPassword) {
                this.invalidPassword = true;
                return;
            }

            this.processing = true;
            this.$root.getSocket().emit("addUser", {
                username: this.newUser.username,
                password: this.newUser.password,
            }, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.modal?.hide();
                    this.resetForm();
                    this.loadUsers();
                }
            });
        },

        /**
         * Fill both password fields with a random password and show it.
         * It always has a letter and a digit, so it passes the server's
         * strength check.
         * @returns {void}
         */
        generatePassword() {
            let password;
            do {
                password = genSecret(GENERATED_PASSWORD_LENGTH);
            } while (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password));

            this.newUser.password = password;
            this.newUser.repeatPassword = password;
            this.showPassword = true;
        },

        /**
         * Copy the password to the clipboard
         * @returns {Promise<void>}
         */
        async copyPassword() {
            try {
                await navigator.clipboard.writeText(this.newUser.password);
                this.$root.toastSuccess(this.$t("passwordCopied"));
            } catch (e) {
                this.$root.toastError(this.$t("copyFailed"));
            }
        },

        /**
         * Disable or enable a user
         * @param {object} user User to change
         * @param {boolean} active New state
         * @returns {void}
         */
        setActive(user, active) {
            this.processing = true;
            this.$root.getSocket().emit("setUserActive", user.id, active, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                this.loadUsers();
            });
        },

        /**
         * Ask before deleting a user
         * @param {object} user User to delete
         * @returns {void}
         */
        confirmDelete(user) {
            this.userToDelete = user;
            this.$refs.confirmDelete.show();
        },

        /**
         * Delete the user waiting for confirmation
         * @returns {void}
         */
        deleteUser() {
            if (!this.userToDelete) {
                return;
            }
            this.processing = true;
            this.$root.getSocket().emit("deleteUser", this.userToDelete.id, (res) => {
                this.processing = false;
                this.userToDelete = null;
                this.$root.toastRes(res);
                this.loadUsers();
            });
        },

        /**
         * Ask before turning off a user's 2FA
         * @param {object} user User whose 2FA to reset
         * @returns {void}
         */
        confirmReset2FA(user) {
            this.userToReset = user;
            this.$refs.confirmReset2FA.show();
        },

        /**
         * Turn off 2FA for the user waiting for confirmation
         * @returns {void}
         */
        reset2FA() {
            if (!this.userToReset) {
                return;
            }
            this.processing = true;
            this.$root.getSocket().emit("resetUser2FA", this.userToReset.id, (res) => {
                this.processing = false;
                this.userToReset = null;
                this.$root.toastRes(res);
                this.loadUsers();
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../../styles/vars.scss";

.user-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.user-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    min-height: 57px;
    padding: 12px 12px 12px 14px;
    background-color: $bg-input;
    border-radius: 4px;

    .dark & {
        background-color: $dark-bg-input;
    }
}

.user-info {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}

.user-name {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
    overflow-wrap: anywhere;

    .dark & {
        color: $dark-text-primary;
    }
}

.user-disabled .user-name {
    color: $text-secondary;

    .dark & {
        color: $dark-text-secondary;
    }
}

.user-avatar {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: $accent-primary;
    background-color: $accent-primary-subtle;

    .dark & {
        color: $dark-accent-primary;
        background-color: $dark-accent-primary-subtle;
    }

    &--disabled {
        color: $status-neutral;
        background-color: $status-neutral-subtle;

        .dark & {
            color: $dark-status-neutral;
            background-color: $dark-status-neutral-subtle;
        }
    }
}

.user-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

// Icons are masks, so they take the text colour
.trash-icon,
.plus-icon,
.close-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    background-color: currentColor;
}

.trash-icon {
    mask: var(--trash-icon) center / contain no-repeat;
    -webkit-mask: var(--trash-icon) center / contain no-repeat;
}

$plus-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M8 3.5v9M3.5 8h9'/%3E%3C/svg%3E");
$close-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M4.5 4.5l7 7M11.5 4.5l-7 7'/%3E%3C/svg%3E");

.plus-icon {
    mask: $plus-icon center / contain no-repeat;
    -webkit-mask: $plus-icon center / contain no-repeat;
}

.close-icon {
    mask: $close-icon center / contain no-repeat;
    -webkit-mask: $close-icon center / contain no-repeat;
}

// Add user dialog (520px wide in Figma)
.add-user-modal {
    max-width: 520px;
}

.add-user-dialog {
    border: 0;
    border-radius: 4px;
    background-color: $bg-surface;

    .dark & {
        background-color: $dark-bg-surface;
    }
}

.dialog-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 20px 16px 0 24px;
}

.dialog-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    h5 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: $text-primary;

        .dark & {
            color: $dark-text-primary;
        }
    }

    p {
        margin: 0;
        font-size: 13px;
        line-height: normal;
        color: $text-muted;

        .dark & {
            color: $dark-text-muted;
        }
    }
}

.dialog-close {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    padding: 0;
}

.dialog-body {
    padding: 20px 24px 6px;
}

.dialog-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 24px 24px;
}

.field-error {
    font-size: 12px;
    color: $status-danger;

    .dark & {
        color: $dark-status-danger;
    }
}
</style>
