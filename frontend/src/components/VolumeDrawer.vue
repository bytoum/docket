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
                        <h2>{{ isAdd ? $t("addVolume") : $t("editVolumeTitle") }}</h2>
                        <p v-if="isAdd">{{ $t("addVolumeSubtitle", [ stackName ]) }}</p>
                        <p v-else>{{ $t("editVolumeSubtitle", [ volumeName, stackName ]) }}</p>
                    </div>
                    <button type="button" class="square-btn" :aria-label="$t('cancel')" @click="close">
                        <span class="icon"><img :src="icons.close" alt="" width="9.5" height="9.5" /></span>
                    </button>
                </header>

                <!-- Body -->
                <form id="volume-drawer-form" class="drawer-body" @submit.prevent="submit">
                    <!-- Volume type -->
                    <div class="field">
                        <span class="field-label">{{ $t("volumeType") }}</span>
                        <div class="chips" role="radiogroup">
                            <button
                                v-for="option in typeOptions" :key="option.value" type="button" class="choice-chip"
                                role="radio" :aria-checked="draft.type === option.value" :class="{ selected: draft.type === option.value }"
                                :disabled="!isAdd && draft.type !== option.value"
                                @click="draft.type = option.value"
                            >
                                {{ $t(option.label) }}
                            </button>
                        </div>
                        <p class="field-hint">{{ $t("volumeTypeHint") }}</p>
                    </div>

                    <!-- New volume -->
                    <template v-if="draft.type === 'new'">
                        <div class="field">
                            <label class="field-label" for="drawer-volume-name">{{ $t("volumeName") }}</label>
                            <input
                                id="drawer-volume-name" ref="nameInput" v-model.trim="draft.name" class="field-input" placeholder="e.g. whodb-data"
                                autocomplete="off" @blur="draft.name = draft.name.toLowerCase()"
                            />
                            <p class="field-hint">{{ $t("volumeNameHint") }}</p>
                        </div>

                        <div class="field">
                            <label class="field-label" for="drawer-volume-driver">{{ $t("networkDriver") }}</label>
                            <div class="select-wrapper">
                                <select id="drawer-volume-driver" v-model="draft.driver" class="field-input">
                                    <option v-for="driver in driverOptions" :key="driver" :value="driver">{{ driver }}</option>
                                </select>
                                <span class="icon select-chevron"><img :src="icons.chevronDown" alt="" width="9.5" height="5.5" /></span>
                            </div>
                            <p class="field-hint">{{ $t("volumeDriverHint") }}</p>
                        </div>

                        <div class="field">
                            <label class="field-label" for="drawer-volume-options">{{ $t("driverOptions") }}</label>
                            <input
                                id="drawer-volume-options" v-model.trim="draft.options" class="field-input"
                                placeholder="e.g. type=nfs, o=addr=10.0.0.5" autocomplete="off"
                            />
                            <p class="field-hint">{{ $t("driverOptionsHint") }}</p>
                        </div>
                    </template>

                    <!-- External volume -->
                    <div v-else class="field">
                        <span class="field-label">{{ $t("existingVolumes") }}</span>
                        <input v-model.trim="search" class="field-input" :placeholder="$t('searchVolumes')" autocomplete="off" :aria-label="$t('searchVolumes')" />

                        <div class="host-options" role="radiogroup">
                            <button
                                v-for="volume in filteredHostVolumes" :key="volume.name" type="button" class="host-option"
                                role="radio" :aria-checked="draft.external === volume.name" :class="{ selected: draft.external === volume.name }"
                                @click="draft.external = volume.name"
                            >
                                <img :src="draft.external === volume.name ? icons.radioOn : icons.radioOff" alt="" width="18" height="18" />
                                <span class="info">
                                    <span class="name">{{ volume.name }}</span>
                                    <span v-if="volume.driver" class="meta">{{ volume.driver }} · {{ $tc("containerCount", volume.containers) }}</span>
                                </span>
                            </button>
                            <div v-if="filteredHostVolumes.length === 0" class="field-hint">{{ $t("noMatchingVolumes") }}</div>
                        </div>

                        <p class="field-hint">{{ $t("existingVolumesHint") }}</p>
                    </div>
                </form>

                <!-- Footer -->
                <footer class="drawer-footer">
                    <span class="footer-spacer"></span>
                    <button type="button" class="footer-btn secondary" @click="close">{{ $t("cancel") }}</button>
                    <button type="submit" form="volume-drawer-form" class="footer-btn primary" :disabled="busy">
                        <span v-if="isAdd" class="icon"><img :src="icons.plusOnAccent" alt="" width="10.8333" height="10.8333" /></span>
                        {{ isAdd ? $t("addVolume") : $t("saveChanges") }}
                    </button>
                </footer>
            </aside>
        </transition>
    </Teleport>
</template>

<script>
import iconClose from "../assets/drawer/close.svg";
import iconChevronDown from "../assets/drawer/chevron-down.svg";
import iconPlusOnAccent from "../assets/drawer/plus-on-accent.svg";
import iconRadioOn from "../assets/drawer/radio-on.svg";
import iconRadioOff from "../assets/drawer/radio-off.svg";

const icons = {
    close: iconClose,
    chevronDown: iconChevronDown,
    plusOnAccent: iconPlusOnAccent,
    radioOn: iconRadioOn,
    radioOff: iconRadioOff,
};

// Volume names allowed by Docker Compose
const VOLUME_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;

// Anonymous volumes are named with a 64 character hex id
const ANONYMOUS_VOLUME_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Parse "key=value, key=value" driver options. A piece without "=" belongs
 * to the previous value, so "o=addr=10.0.0.5,rw" stays one option.
 * @param {string} text Options text
 * @returns {object|null} Options, or null when a key is missing
 */
function parseDriverOptions(text) {
    const options = {};
    let lastKey = null;
    for (const rawPiece of text.split(",")) {
        const piece = rawPiece.trim();
        if (piece === "") {
            continue;
        }
        const eq = piece.indexOf("=");
        if (eq === -1) {
            if (lastKey === null) {
                return null;
            }
            options[lastKey] += "," + piece;
            continue;
        }
        const key = piece.slice(0, eq).trim();
        if (key === "") {
            return null;
        }
        options[key] = piece.slice(eq + 1).trim();
        lastKey = key;
    }
    return options;
}

/**
 * Driver options back to "key=value, key=value" text
 * @param {object|undefined} options Driver options
 * @returns {string} Options text
 */
function formatDriverOptions(options) {
    return Object.entries(options ?? {}).map(([ key, value ]) => `${key}=${value}`).join(", ");
}

/**
 * Side drawer to add a volume to the stack (new or external) or edit one
 */
export default {
    props: {
        /** Whether the drawer is shown */
        open: {
            type: Boolean,
            default: false,
        },
        /** Volume to edit, or an empty string to add one */
        volumeName: {
            type: String,
            default: "",
        },
        /** Parsed compose file of the stack */
        jsonConfig: {
            type: Object,
            required: true,
        },
        /** Name of the stack, used in the subtitle */
        stackName: {
            type: String,
            default: "",
        },
        /** Agent endpoint of the stack */
        endpoint: {
            type: String,
            default: "",
        },
        /** Disables the buttons while the parent is working */
        busy: {
            type: Boolean,
            default: false,
        },
    },
    emits: [ "close", "submit" ],
    data() {
        return {
            icons,
            draft: this.emptyDraft(),
            search: "",
            hostVolumes: [],
            typeOptions: [
                {
                    value: "new",
                    label: "newVolume",
                },
                {
                    value: "external",
                    label: "externalExisting",
                },
            ],
        };
    },
    computed: {
        isAdd() {
            return this.volumeName === "";
        },

        volumes() {
            return this.jsonConfig.volumes ?? {};
        },

        /**
         * "local", plus the driver the volume already uses if it is another one
         * @returns {string[]} Driver names
         */
        driverOptions() {
            const options = [ "local" ];
            if (this.draft.driver && !options.includes(this.draft.driver)) {
                options.push(this.draft.driver);
            }
            return options;
        },

        /**
         * Host volumes that can be attached: named ones only, not this
         * stack's own, not already in the compose file, and matching the search
         * @returns {object[]} Volumes with name, driver and container count
         */
        filteredHostVolumes() {
            const search = this.search.toLowerCase();
            return this.hostVolumes.filter((volume) =>
                !ANONYMOUS_VOLUME_PATTERN.test(volume.name)
                && !(this.stackName && volume.name.startsWith(this.stackName + "_"))
                && (volume.name === this.draft.external || !(volume.name in this.volumes))
                && volume.name.toLowerCase().includes(search));
        },
    },
    watch: {
        open(isOpen) {
            if (isOpen) {
                this.load();
                this.loadHostVolumes();
                this.$nextTick(() => this.$refs.nameInput?.focus());
            }
        },
    },
    methods: {
        emptyDraft() {
            return {
                type: "new",
                name: "",
                driver: "local",
                options: "",
                external: "",
            };
        },

        /**
         * Fill the form from the volume being edited, or reset it
         * @returns {void}
         */
        load() {
            const draft = this.emptyDraft();
            this.search = "";

            if (!this.isAdd) {
                const config = this.volumes[this.volumeName] ?? {};
                if (config.external) {
                    draft.type = "external";
                    draft.external = config.name ?? this.volumeName;
                } else {
                    draft.name = this.volumeName;
                    draft.driver = config.driver ?? "local";
                    draft.options = formatDriverOptions(config.driver_opts);
                }
            }

            this.draft = draft;
        },

        /**
         * Load the volumes on the Docker host. Agents without this event
         * leave the list empty.
         * @returns {void}
         */
        loadHostVolumes() {
            this.hostVolumes = [];
            this.$root.emitAgent(this.endpoint, "getDockerVolumeDetails", (res) => {
                if (res.ok) {
                    this.hostVolumes = res.dockerVolumeDetails;
                }
            });
        },

        close() {
            this.$emit("close");
        },

        /**
         * Validate the form and emit the volume's compose configuration
         * @returns {void}
         */
        submit() {
            if (this.draft.type === "external") {
                if (!this.draft.external) {
                    this.$root.toastError(this.$t("selectVolumeRequired"));
                    return;
                }
                this.$emit("submit", {
                    originalName: this.volumeName,
                    name: this.draft.external,
                    config: { external: true },
                });
                return;
            }

            const name = this.draft.name.toLowerCase();
            if (!name) {
                this.$root.toastError(this.$t("volumeNameRequired"));
                return;
            }
            if (!VOLUME_NAME_PATTERN.test(name)) {
                this.$root.toastError(this.$t("volumeNameInvalid"));
                return;
            }
            if (name !== this.volumeName && name in this.volumes) {
                this.$root.toastError(this.$t("volumeNameExists"));
                return;
            }
            const options = parseDriverOptions(this.draft.options);
            if (options === null) {
                this.$root.toastError(this.$t("driverOptionsInvalid"));
                return;
            }

            this.$emit("submit", {
                originalName: this.volumeName,
                name,
                config: this.buildConfig(options),
            });
        },

        /**
         * Build the volume's compose configuration, keeping any settings
         * the form does not show (labels, name, ...)
         * @param {object} options Parsed driver options
         * @returns {object} Volume configuration
         */
        buildConfig(options) {
            const original = this.isAdd ? {} : (this.volumes[this.volumeName] ?? {});
            const config = JSON.parse(JSON.stringify(original ?? {}));

            // "local" is the default, so only write it when it was already there
            if (this.draft.driver === "local" && !original?.driver) {
                delete config.driver;
            } else {
                config.driver = this.draft.driver;
            }

            if (Object.keys(options).length > 0) {
                config.driver_opts = options;
            } else {
                delete config.driver_opts;
            }

            return config;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/drawer.scss";
</style>
