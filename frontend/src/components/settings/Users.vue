<template>
    <div class="my-4">
        <div v-if="settingsLoaded && settings.disableAuth" class="alert alert-warning">
            {{ $t("authDisabledUsersHint") }}
        </div>

        <!-- User list -->
        <ul class="list-group mb-3">
            <li
                v-for="user in userList" :key="user.id"
                class="list-group-item d-flex align-items-center gap-2" :class="{ 'user-disabled': !user.active }"
            >
                <strong class="me-1">{{ user.username }}</strong>
                <span v-if="user.id === currentUserID" class="badge bg-primary">{{ $t("youBadge") }}</span>
                <span v-if="user.isOwner" class="badge bg-info">{{ $t("ownerBadge") }}</span>
                <span v-if="!user.active" class="badge bg-secondary">{{ $t("disabledBadge") }}</span>
                <span v-if="user.twoFA" class="badge bg-success">{{ $t("twoFABadge") }}</span>

                <span class="flex-grow-1"></span>

                <template v-if="isOwner && user.id !== currentUserID">
                    <button v-if="user.twoFA" type="button" class="btn btn-sm btn-normal" :disabled="processing" @click="confirmReset2FA(user)">
                        {{ $t("reset2FA") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-normal" :disabled="processing" @click="setActive(user, !user.active)">
                        {{ user.active ? $t("disableUser") : $t("enableUser") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" :disabled="processing" @click="confirmDelete(user)">
                        {{ $t("deleteUser") }}
                    </button>
                </template>
            </li>
        </ul>

        <p v-if="loaded && !isOwner" class="form-text">{{ $t("ownerOnlyHint") }}</p>

        <!-- Add user (owner only) -->
        <template v-if="isOwner">
            <h5 class="my-4 settings-subheading">{{ $t("addUser") }}</h5>
            <form class="mb-3" @submit.prevent="addUser">
                <div class="mb-3">
                    <label for="new-user-username" class="form-label">{{ $t("Username") }}</label>
                    <input id="new-user-username" v-model.trim="newUser.username" class="form-control" autocomplete="off" required />
                </div>

                <div class="mb-3">
                    <label for="new-user-password" class="form-label">{{ $t("Password") }}</label>
                    <div class="input-group">
                        <input
                            id="new-user-password" v-model="newUser.password" :type="showPassword ? 'text' : 'password'"
                            class="form-control" autocomplete="new-password" required
                        />
                        <button type="button" class="btn btn-normal" @click="generatePassword">{{ $t("generatePassword") }}</button>
                        <button v-if="showPassword && newUser.password" type="button" class="btn btn-normal" @click="copyPassword">{{ $t("copyPassword") }}</button>
                    </div>
                    <div v-if="showPassword" class="form-text">{{ $t("generatedPasswordHint") }}</div>
                </div>

                <div class="mb-3">
                    <label for="new-user-repeat-password" class="form-label">{{ $t("Repeat Password") }}</label>
                    <input
                        id="new-user-repeat-password" v-model="newUser.repeatPassword" :type="showPassword ? 'text' : 'password'" class="form-control"
                        :class="{ 'is-invalid': invalidPassword }" autocomplete="new-password" required
                    />
                    <div class="invalid-feedback">{{ $t("passwordNotMatchMsg") }}</div>
                </div>

                <button class="btn btn-primary" type="submit" :disabled="processing">{{ $t("addUser") }}</button>
            </form>
        </template>

        <Confirm ref="confirmDelete" btn-style="btn-danger" :yes-text="$t('deleteUser')" :no-text="$t('cancel')" :title="$t('deleteUserTitle')" @yes="deleteUser">
            {{ $t("deleteUserMsg", [ userToDelete?.username ?? "" ]) }}
        </Confirm>

        <Confirm ref="confirmReset2FA" btn-style="btn-danger" :yes-text="$t('reset2FA')" :no-text="$t('cancel')" :title="$t('reset2FATitle')" @yes="reset2FA">
            {{ $t("reset2FAMsg", [ userToReset?.username ?? "" ]) }}
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";
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

    methods: {
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
                    this.newUser = {
                        username: "",
                        password: "",
                        repeatPassword: "",
                    };
                    this.showPassword = false;
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
.user-disabled strong {
    opacity: 0.5;
}
</style>
