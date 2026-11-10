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

            <div class="user-table" role="table" :aria-label="$t('usersAccounts')">
                <div class="user-table-head" role="row">
                    <span class="col-user" role="columnheader">{{ $t("userColumn") }}</span>
                    <span class="col-role" role="columnheader">{{ $t("roleColumn") }}</span>
                    <span class="col-2fa" role="columnheader">{{ $t("twoFABadge") }}</span>
                    <span class="col-status" role="columnheader">{{ $t("statusColumn") }}</span>
                    <span class="col-last" role="columnheader">{{ $t("lastActiveColumn") }}</span>
                    <span class="col-actions" role="columnheader"><span class="visually-hidden">{{ $t("userActions") }}</span></span>
                </div>

                <div v-for="user in userList" :key="user.id" class="user-row" :class="{ 'user-disabled': !user.active }" role="row">
                    <div class="col-user" role="cell">
                        <span class="user-avatar" :class="{ 'user-avatar--disabled': !user.active }" aria-hidden="true">{{ initial(user) }}</span>
                        <strong class="user-name">{{ user.username }}</strong>
                        <span v-if="user.id === currentUserID" class="status-badge status-badge--accent">{{ $t("youBadge") }}</span>
                    </div>

                    <div class="col-role" role="cell">
                        <span class="cell-label">{{ $t("roleColumn") }}</span>
                        <span v-if="user.isOwner" class="status-badge status-badge--success">{{ $t("ownerBadge") }}</span>
                        <span v-else class="cell-text">{{ $t("roleUser") }}</span>
                    </div>

                    <div class="col-2fa" role="cell">
                        <span class="cell-label">{{ $t("twoFABadge") }}</span>
                        <span class="status-badge" :class="twoFABadgeClass(user)">{{ user.twoFA ? $t("twoFAOn") : $t("twoFAOff") }}</span>
                    </div>

                    <div class="col-status" role="cell">
                        <span class="cell-label">{{ $t("statusColumn") }}</span>
                        <span class="status-badge" :class="user.active ? 'status-badge--success' : 'status-badge--neutral'">
                            {{ user.active ? $t("Active") : $t("disabledBadge") }}
                        </span>
                    </div>

                    <div class="col-last" role="cell">
                        <span class="cell-label">{{ $t("lastActiveColumn") }}</span>
                        <span class="cell-text" :title="lastActiveTitle(user)">{{ lastActiveText(user) }}</span>
                    </div>

                    <div class="col-actions" role="cell">
                        <div v-if="isOwner && user.id !== currentUserID" class="dropdown">
                            <button
                                type="button" class="row-menu-btn" data-bs-toggle="dropdown" aria-expanded="false"
                                :disabled="processing" :aria-label="$t('userActionsFor', [ user.username ])"
                            >
                                <span class="mask-icon" :style="icons.more" aria-hidden="true"></span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end row-menu">
                                <li>
                                    <button type="button" class="dropdown-item" @click="openResetPassword(user)">
                                        <span class="mask-icon" :style="icons.key" aria-hidden="true"></span>
                                        {{ $t("resetPassword") }}
                                    </button>
                                </li>
                                <li v-if="user.twoFA">
                                    <button type="button" class="dropdown-item" @click="confirmReset2FA(user)">
                                        <span class="mask-icon" :style="icons.shield" aria-hidden="true"></span>
                                        {{ $t("reset2FA") }}
                                    </button>
                                </li>
                                <li>
                                    <button type="button" class="dropdown-item" @click="setActive(user, !user.active)">
                                        <span class="mask-icon" :style="user.active ? icons.ban : icons.check" aria-hidden="true"></span>
                                        {{ user.active ? $t("disableUserMenu") : $t("enableUserMenu") }}
                                    </button>
                                </li>
                                <li><hr class="dropdown-divider"></li>
                                <li>
                                    <button type="button" class="dropdown-item dropdown-item--danger" @click="confirmDelete(user)">
                                        <span class="mask-icon" :style="icons.trash" aria-hidden="true"></span>
                                        {{ $t("deleteUserMenu") }}
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <p v-if="loaded && !isOwner" class="settings-help">{{ $t("ownerOnlyHint") }}</p>
        </div>

        <!-- Add user / reset password dialog (owner only) -->
        <form v-if="isOwner" @submit.prevent="submitForm">
            <div ref="modal" class="modal fade" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered add-user-modal">
                    <div class="modal-content add-user-dialog settings-dialog">
                        <div class="dialog-header">
                            <div class="dialog-title">
                                <h5>{{ passwordTarget ? $t("resetPasswordTitle") : $t("addUser") }}</h5>
                                <p>{{ passwordTarget ? $t("resetPasswordSubtitle") : $t("addUserSubtitle") }}</p>
                            </div>
                            <button type="button" class="btn-subtle dialog-close" data-bs-dismiss="modal" aria-label="Close">
                                <span class="close-icon" aria-hidden="true"></span>
                            </button>
                        </div>

                        <div class="dialog-body">
                            <!-- Whose password is being reset -->
                            <div v-if="passwordTarget" class="target-user">
                                <span class="user-avatar" :class="{ 'user-avatar--disabled': !passwordTarget.active }" aria-hidden="true">{{ initial(passwordTarget) }}</span>
                                <strong class="user-name">{{ passwordTarget.username }}</strong>
                                <span class="status-badge" :class="twoFABadgeClass(passwordTarget)">{{ passwordTarget.twoFA ? $t("twoFAOn") : $t("twoFAOff") }}</span>
                            </div>

                            <div v-if="!passwordTarget" class="settings-field">
                                <label for="new-user-username">{{ $t("Username") }}</label>
                                <input
                                    id="new-user-username" v-model.trim="newUser.username" class="form-control"
                                    :placeholder="$t('usernamePlaceholder')" autocomplete="off" :required="!passwordTarget"
                                />
                            </div>

                            <div class="settings-field">
                                <label for="new-user-password">{{ passwordTarget ? $t("New Password") : $t("Password") }}</label>
                                <div class="settings-field-inline">
                                    <input
                                        id="new-user-password" v-model="newUser.password" :type="showPassword ? 'text' : 'password'"
                                        class="form-control" :placeholder="passwordTarget ? $t('newPasswordPlaceholder') : $t('passwordPlaceholder')" autocomplete="new-password" required
                                    />
                                    <button type="button" class="btn-subtle" @click="generatePassword">{{ $t("generatePassword") }}</button>
                                    <button v-if="showPassword && newUser.password" type="button" class="btn-subtle" @click="copyPassword">{{ $t("copyPassword") }}</button>
                                </div>
                                <div class="settings-help">{{ $t("newUserPasswordHelp") }}</div>
                                <div v-if="showPassword" class="settings-help">{{ passwordTarget ? $t("generatedResetPasswordHint") : $t("generatedPasswordHint") }}</div>
                            </div>

                            <div class="settings-field">
                                <label for="new-user-repeat-password">{{ passwordTarget ? $t("Repeat New Password") : $t("Repeat Password") }}</label>
                                <input
                                    id="new-user-repeat-password" v-model="newUser.repeatPassword" :type="showPassword ? 'text' : 'password'"
                                    class="form-control" :class="{ 'is-invalid': invalidPassword }"
                                    :placeholder="passwordTarget ? $t('repeatPasswordPlaceholder') : $t('repeatUserPasswordPlaceholder')" autocomplete="new-password" required
                                />
                                <div v-if="invalidPassword" class="field-error">{{ $t("passwordNotMatchMsg") }}</div>
                            </div>
                        </div>

                        <div class="dialog-footer">
                            <button type="button" class="btn-subtle" data-bs-dismiss="modal">{{ $t("cancel") }}</button>
                            <button class="btn btn-primary" type="submit" :disabled="processing">
                                <template v-if="passwordTarget">{{ $t("resetPassword") }}</template>
                                <template v-else>
                                    <span class="plus-icon" aria-hidden="true"></span>
                                    {{ $t("addUser") }}
                                </template>
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
import iconMore from "../../assets/settings/more.svg";
import iconKey from "../../assets/settings/key.svg";
import iconBan from "../../assets/settings/ban.svg";
import iconShield from "../../assets/settings/security.svg";
import { genSecret } from "../../../../common/util-common";

// Length of generated passwords
const GENERATED_PASSWORD_LENGTH = 20;

// Check mark for "Enable user" (the design only has the "Disable user" icon)
const iconCheck = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='8' cy='8' r='5.5'/%3E%3Cpath d='M5.75 8.1l1.6 1.6 2.9-3.2'/%3E%3C/svg%3E";

/**
 * Style that passes an icon to the .mask-icon CSS mask
 * @param {string} url Icon URL
 * @returns {object} Style object with the --icon variable
 */
function maskStyle(url) {
    return { "--icon": `url("${url}")` };
}

/**
 * Settings page to list users. The owner can also add, disable and delete them,
 * and reset their password or 2FA.
 */
export default {
    components: {
        Confirm,
    },

    data() {
        return {
            // Icons are CSS masks, so they take the text colour.
            // The URL is quoted because inlined SVG data URIs contain single quotes.
            icons: {
                more: maskStyle(iconMore),
                key: maskStyle(iconKey),
                ban: maskStyle(iconBan),
                check: maskStyle(iconCheck),
                shield: maskStyle(iconShield),
                trash: maskStyle(iconTrash),
            },
            loaded: false,
            processing: false,
            userList: [],
            currentUserID: null,
            userToDelete: null,
            userToReset: null,
            // User whose password the dialog resets; null when it adds a user
            passwordTarget: null,
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
            this.passwordTarget = null;
            this.ensureModal();
            this.modal?.show();
        },

        /**
         * Open the dialog to set a new password for another user
         * @param {object} user User whose password to reset
         * @returns {void}
         */
        openResetPassword(user) {
            this.resetForm();
            this.passwordTarget = user;
            this.ensureModal();
            this.modal?.show();
        },

        /**
         * Submit the dialog: add a user or reset a password
         * @returns {void}
         */
        submitForm() {
            if (this.passwordTarget) {
                this.resetPassword();
            } else {
                this.addUser();
            }
        },

        /**
         * Set the new password from the form for the target user.
         * The server logs that user out everywhere.
         * @returns {void}
         */
        resetPassword() {
            if (this.newUser.password !== this.newUser.repeatPassword) {
                this.invalidPassword = true;
                return;
            }

            this.processing = true;
            this.$root.getSocket().emit("resetUserPassword", this.passwordTarget.id, this.newUser.password, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                // The form is cleared once the dialog has closed (hidden.bs.modal),
                // so the title doesn't switch to "Add user" while it fades out
                if (res.ok) {
                    this.modal?.hide();
                }
            });
        },

        /**
         * Clear the dialog form and its error
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
            this.passwordTarget = null;
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
         * "Last active" as relative time in the UI language, e.g. "2 hours ago"
         * @param {object} user User to show
         * @returns {string} Relative time, "Just now" or "Never"
         */
        lastActiveText(user) {
            if (!user.lastActive) {
                return this.$t("lastActiveNever");
            }
            const seconds = Math.round((new Date(user.lastActive).getTime() - Date.now()) / 1000);
            if (Number.isNaN(seconds)) {
                return this.$t("lastActiveNever");
            }
            if (seconds > -60) {
                return this.$t("lastActiveJustNow");
            }

            const units = [
                [ "year", 365 * 24 * 3600 ],
                [ "month", 30 * 24 * 3600 ],
                [ "week", 7 * 24 * 3600 ],
                [ "day", 24 * 3600 ],
                [ "hour", 3600 ],
                [ "minute", 60 ],
            ];
            const [ unit, size ] = units.find(([ , size ]) => -seconds >= size);
            try {
                const format = new Intl.RelativeTimeFormat(this.$i18n.locale, { numeric: "auto" });
                return format.format(Math.round(seconds / size), unit);
            } catch (e) {
                return new Date(user.lastActive).toLocaleString();
            }
        },

        /**
         * Full date and time of "Last active", for the tooltip
         * @param {object} user User to show
         * @returns {string} Local date and time, or empty when never active
         */
        lastActiveTitle(user) {
            return user.lastActive ? new Date(user.lastActive).toLocaleString() : "";
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

// User table (Figma "User List"): a filled header row, then rows split by dividers
// The actions column is up to 340px wide as in Figma; it gives way first on a narrower card.
$user-columns: minmax(0, 1fr) 100px 110px 110px 140px minmax(32px, 340px);

.user-table {
    display: flex;
    flex-direction: column;
}

.user-table-head,
.user-row {
    display: grid;
    grid-template-columns: $user-columns;
    align-items: center;
    padding: 0 14px;
}

.user-table-head {
    padding-top: 9px;
    padding-bottom: 9px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    line-height: normal;
    text-transform: uppercase;
    color: $text-muted;
    background-color: $bg-input;

    .dark & {
        color: $dark-text-muted;
        background-color: $dark-bg-input;
    }
}

.user-row {
    min-height: 57px;
    padding-top: 12px;
    padding-bottom: 12px;

    & + & {
        border-top: 1px solid $border-default;

        .dark & {
            border-top-color: $dark-border-default;
        }
    }
}

.col-user {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}

.col-role,
.col-2fa,
.col-status,
.col-last {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.col-actions {
    display: flex;
    justify-content: flex-end;
}

.cell-text {
    font-size: 13px;
    line-height: normal;
    white-space: nowrap;
    color: $text-secondary;

    .dark & {
        color: $dark-text-secondary;
    }
}

// Column names, shown next to each value only when the table is stacked
.cell-label {
    display: none;
    min-width: 72px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: $text-muted;

    .dark & {
        color: $dark-text-muted;
    }
}

// Narrow card: hide the header and stack each row's cells
@media (max-width: 991.98px) {
    .user-table-head {
        display: none;
    }

    .user-row {
        grid-template-columns: minmax(0, 1fr) 32px;
        row-gap: 8px;
    }

    .col-user {
        grid-column: 1;
        grid-row: 1;
    }

    .col-actions {
        grid-column: 2;
        grid-row: 1;
    }

    .col-role,
    .col-2fa,
    .col-status,
    .col-last {
        grid-column: 1 / -1;
    }

    .cell-label {
        display: inline;
    }
}

// Row menu button (32px, filled) and its dropdown
.row-menu-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 4px;
    color: $text-secondary;
    background-color: $bg-input;

    .dark & {
        color: $dark-text-secondary;
        background-color: $dark-bg-input;
    }

    &:hover,
    &.show {
        color: $accent-primary;
        background-color: $accent-primary-subtle;

        .dark & {
            color: $dark-accent-primary;
            background-color: $dark-accent-primary-subtle;
        }
    }

    &:focus-visible {
        outline: 2px solid $accent-primary;
        outline-offset: 2px;
    }
}

.row-menu {
    width: 220px;
    padding: 6px;
    border: 0;
    border-radius: 4px;
    background-color: $bg-surface-raised;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);

    .dark & {
        background-color: $dark-bg-surface-raised;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    li + li {
        margin-top: 2px;
    }

    .dropdown-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        line-height: normal;
        color: $text-primary;

        .dark & {
            color: $dark-text-primary;
        }

        .mask-icon {
            color: $text-secondary;

            .dark & {
                color: $dark-text-secondary;
            }
        }

        &:hover,
        &:focus-visible {
            background-color: $bg-input;

            .dark & {
                background-color: $dark-bg-input;
            }
        }

        &--danger,
        &--danger .mask-icon {
            color: $status-danger;

            .dark & {
                color: $dark-status-danger;
            }
        }
    }

    .dropdown-divider {
        margin: 2px 0;
        border-top-color: $border-default;
        opacity: 1;

        .dark & {
            border-top-color: $dark-border-default;
        }
    }
}

// Reset password dialog: the user whose password is being reset
.target-user {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
    padding: 10px 12px;
    border-radius: 4px;
    background-color: $bg-input;

    .dark & {
        background-color: $dark-bg-input;
    }
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

// Icons are masks, so they take the text colour
.mask-icon,
.plus-icon,
.close-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    background-color: currentColor;
}

.mask-icon {
    mask: var(--icon) center / contain no-repeat;
    -webkit-mask: var(--icon) center / contain no-repeat;
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
