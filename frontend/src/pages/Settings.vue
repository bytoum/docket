<template>
    <div class="settings-page">
        <div v-show="show" class="settings-title">
            <h1>{{ $t("Settings") }}</h1>
            <p>{{ $t("settingsSubtitle") }}</p>
        </div>

        <div class="settings-layout">
            <nav v-if="showSubMenu" class="settings-menu">
                <router-link
                    v-for="(item, key) in subMenus"
                    :key="key"
                    :to="`/settings/${key}`"
                    class="menu-item"
                >
                    <span class="menu-icon" :style="iconStyle(item.icon)" aria-hidden="true"></span>
                    <span class="menu-label">{{ item.title }}</span>
                </router-link>

                <!-- Logout Button -->
                <a v-if="$root.isMobile && $root.loggedIn && $root.socket.token !== 'autoLogin'" class="menu-item logout" href="#" @click.prevent="$root.logout">
                    <font-awesome-icon icon="sign-out-alt" class="menu-icon-fa" />
                    <span class="menu-label">{{ $t("Logout") }}</span>
                </a>
            </nav>

            <div class="settings-card">
                <div v-if="currentPage" class="settings-card-header">
                    <div class="settings-card-title">
                        <h2>{{ pageInfo.title }}</h2>
                        <p>{{ pageInfo.description }}</p>
                    </div>
                    <!-- Pages teleport their header actions (e.g. "Add user") here -->
                    <div id="settings-header-actions" class="settings-card-actions"></div>
                </div>
                <div class="settings-card-body">
                    <router-view v-slot="{ Component }">
                        <transition name="slide-fade" appear>
                            <component :is="Component" />
                        </transition>
                    </router-view>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { useRoute } from "vue-router";
import "../styles/settings.scss";
import iconGeneral from "../assets/settings/general.svg";
import iconAppearance from "../assets/settings/appearance.svg";
import iconSecurity from "../assets/settings/security.svg";
import iconUsers from "../assets/settings/users.svg";
import iconGlobalEnv from "../assets/settings/global-env.svg";
import iconAbout from "../assets/settings/about.svg";

export default {
    data() {
        return {
            show: true,
            settings: {},
            settingsLoaded: false,
            // Only the owner sees the Users and Global .env pages. False until the server says otherwise.
            isOwner: false,
            ownerStatusLoaded: false,
        };
    },

    computed: {
        currentPage() {
            let pathSplit = useRoute().path.split("/");
            let pathEnd = pathSplit[pathSplit.length - 1];
            if (!pathEnd || pathEnd === "settings") {
                return null;
            }
            return pathEnd;
        },

        showSubMenu() {
            if (this.$root.isMobile) {
                return !this.currentPage;
            } else {
                return true;
            }
        },

        /**
         * Title and description of the current page. Uses the full list,
         * so the header still renders before the owner check returns.
         * @returns {object} Title and description, empty for an unknown page
         */
        pageInfo() {
            return this.allMenus[this.currentPage] ?? {
                title: "",
                description: "",
            };
        },

        subMenus() {
            const menus = { ...this.allMenus };
            if (!this.isOwner) {
                delete menus.users;
                delete menus.globalEnv;
            }
            return menus;
        },

        allMenus() {
            return {
                general: {
                    title: this.$t("general"),
                    description: this.$t("settingsDescGeneral"),
                    icon: iconGeneral,
                },
                appearance: {
                    title: this.$t("Appearance"),
                    description: this.$t("settingsDescAppearance"),
                    icon: iconAppearance,
                },
                security: {
                    title: this.$t("Security"),
                    description: this.$t("settingsDescSecurity"),
                    icon: iconSecurity,
                },
                users: {
                    title: this.$t("users"),
                    description: this.$t("settingsDescUsers"),
                    icon: iconUsers,
                },
                globalEnv: {
                    title: this.$t("GlobalEnv"),
                    description: this.$t("settingsDescGlobalEnv"),
                    icon: iconGlobalEnv,
                },
                about: {
                    title: this.$t("About"),
                    description: this.$t("settingsDescAbout"),
                    icon: iconAbout,
                },
            };
        },
    },

    watch: {
        "$root.isMobile"() {
            this.loadGeneralPage();
        },

        currentPage() {
            this.leaveOwnerPagesIfNotOwner();
        },
    },

    mounted() {
        this.loadSettings();
        this.loadOwnerStatus();
        this.loadGeneralPage();
    },

    methods: {

        /**
         * Inline style that passes a menu icon to the CSS mask.
         * The URL is quoted because inlined SVG data URIs contain single quotes.
         * @param {string} icon Imported SVG URL
         * @returns {Object} Style object with the --menu-icon variable
         */
        iconStyle(icon) {
            return { "--menu-icon": `url("${icon}")` };
        },

        /**
         * Load the general settings page
         * For desktop only, on mobile do nothing
         */
        loadGeneralPage() {
            if (!this.currentPage && !this.$root.isMobile) {
                this.$router.push("/settings/appearance");
            }
        },

        /**
         * Ask the server whether the logged-in user is the owner,
         * then leave the owner-only pages if they are not
         * @returns {void}
         */
        loadOwnerStatus() {
            this.$root.getSocket().emit("getUserList", (res) => {
                this.isOwner = !!res.ok && res.userList.some((user) => user.id === res.currentUserID && user.isOwner);
                this.ownerStatusLoaded = true;
                this.leaveOwnerPagesIfNotOwner();
            });
        },

        /**
         * Send a non-owner who opens an owner-only page (Users, Global .env)
         * to the Security page
         * @returns {void}
         */
        leaveOwnerPagesIfNotOwner() {
            const ownerPages = [ "users", "globalEnv" ];
            if (this.ownerStatusLoaded && !this.isOwner && ownerPages.includes(this.currentPage)) {
                this.$router.replace("/settings/security");
            }
        },

        /** Load settings from server */
        loadSettings() {
            this.$root.getSocket().emit("getSettings", (res) => {
                this.settings = res.data;
                if (this.settings.checkUpdate === undefined) {
                    this.settings.checkUpdate = true;
                }
                this.settingsLoaded = true;
            });
        },

        /**
         * Callback for saving settings
         * @callback saveSettingsCB
         * @param {Object} res Result of operation
         */

        /**
         * Save Settings
         * @param {saveSettingsCB} [callback]
         * @param {string} [currentPassword] Only need for disableAuth to true
         */
        saveSettings(callback, currentPassword) {
            let valid = this.validateSettings();
            if (valid.success) {
                this.$root.getSocket().emit("setSettings", this.settings, currentPassword, (res) => {
                    this.$root.toastRes(res);
                    this.loadSettings();

                    if (callback) {
                        callback();
                    }
                });
            } else {
                this.$root.toastError(valid.msg);
            }
        },

        /**
         * Ensure settings are valid
         * @returns {Object} Contains success state and error msg
         */
        validateSettings() {
            if (this.settings.keepDataPeriodDays < 0) {
                return {
                    success: false,
                    msg: this.$t("dataRetentionTimeError"),
                };
            }
            return {
                success: true,
                msg: "",
            };
        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.settings-title {
    margin-bottom: 20px;

    h1 {
        font-size: 28px;
        font-weight: 700;
        line-height: normal;
        margin: 0 0 2px;
        color: $text-primary;

        .dark & {
            color: $dark-text-primary;
        }
    }

    p {
        font-size: 14px;
        margin: 0;
        color: $text-muted;

        .dark & {
            color: $dark-text-muted;
        }
    }
}

.settings-layout {
    display: flex;
    align-items: flex-start;
    gap: 24px;

    .mobile & {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
    }

    @media (max-width: 767.98px) {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
    }
}

.settings-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
    width: 240px;

    .mobile & {
        width: 100%;
    }

    @media (max-width: 767.98px) {
        width: 100%;
    }

    .menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        line-height: normal;
        color: $text-primary;
        text-decoration: none !important;
        cursor: pointer;
        transition: background-color 0.1s ease-in-out;

        .dark & {
            color: $dark-text-primary;
        }

        &:hover {
            background-color: $bg-surface-raised;

            .dark & {
                background-color: $dark-bg-surface-raised;
            }
        }

        &.active,
        &.router-link-active {
            font-weight: 600;
            color: $accent-primary;
            background-color: $accent-primary-subtle;

            .dark & {
                color: $dark-accent-primary;
                background-color: $dark-accent-primary-subtle;
            }

            .menu-icon {
                color: $accent-primary;

                .dark & {
                    color: $dark-accent-primary;
                }
            }
        }
    }

    // The SVG is a mask, so the icon takes the text colour (currentColor)
    .menu-icon {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        color: $text-secondary;
        background-color: currentColor;
        mask: var(--menu-icon) center / auto no-repeat;
        -webkit-mask: var(--menu-icon) center / auto no-repeat;

        .dark & {
            color: $dark-text-secondary;
        }
    }

    .menu-icon-fa {
        width: 16px;
    }
}

.settings-card {
    flex: 1;
    min-width: 0;
    padding: 24px;
    border-radius: 4px;
    background-color: $bg-surface;
    min-height: calc(100vh - 230px);

    .dark & {
        background-color: $dark-bg-surface;
    }

    .mobile & {
        padding: 16px;
        min-height: 0;
    }

    @media (max-width: 767.98px) {
        width: 100%;
        min-width: 0;
        padding: 16px;
        min-height: 0;
    }
}

.settings-card-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 20px;
    margin-bottom: 20px;
    border-bottom: 1px solid $border-default;

    .dark & {
        border-bottom-color: $dark-border-default;
    }
}

.settings-card-title {
    flex: 1;
    min-width: 0;

    h2 {
        font-size: 18px;
        font-weight: 600;
        line-height: normal;
        margin: 0 0 2px;
        color: $text-primary;

        .dark & {
            color: $dark-text-primary;
        }
    }

    p {
        font-size: 13px;
        line-height: normal;
        margin: 0;
        color: $text-muted;

        .dark & {
            color: $dark-text-muted;
        }
    }
}

.settings-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    &:empty {
        display: none;
    }
}

.logout {
    color: $status-danger !important;

    .dark & {
        color: $dark-status-danger !important;
    }
}
</style>
