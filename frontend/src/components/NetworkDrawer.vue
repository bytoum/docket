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
                        <h2>{{ isAdd ? $t("addNetwork") : $t("editNetworkTitle") }}</h2>
                        <p v-if="isAdd">{{ $t("addNetworkSubtitle", [ stackName ]) }}</p>
                        <p v-else>{{ $t("editNetworkSubtitle", [ networkName, stackName ]) }}</p>
                    </div>
                    <button type="button" class="square-btn" :aria-label="$t('cancel')" @click="close">
                        <span class="icon"><img :src="icons.close" alt="" width="9.5" height="9.5" /></span>
                    </button>
                </header>

                <!-- Body -->
                <form id="network-drawer-form" class="drawer-body" @submit.prevent="submit">
                    <!-- Network type -->
                    <div class="field">
                        <span class="field-label">{{ $t("networkType") }}</span>
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
                        <p class="field-hint">{{ $t("networkTypeHint") }}</p>
                    </div>

                    <!-- New network -->
                    <template v-if="draft.type === 'new'">
                        <div class="field">
                            <label class="field-label" for="drawer-network-name">{{ $t("networkName") }}</label>
                            <input
                                id="drawer-network-name" ref="nameInput" v-model.trim="draft.name" class="field-input" placeholder="e.g. backend"
                                autocomplete="off" :disabled="networkName === 'default'" @blur="draft.name = draft.name.toLowerCase()"
                            />
                            <p class="field-hint">{{ $t("networkNameHint") }}</p>
                        </div>

                        <div class="field">
                            <label class="field-label" for="drawer-network-driver">{{ $t("networkDriver") }}</label>
                            <div class="select-wrapper">
                                <select id="drawer-network-driver" v-model="draft.driver" class="field-input">
                                    <option v-for="driver in driverOptions" :key="driver" :value="driver">{{ driver }}</option>
                                </select>
                                <span class="icon select-chevron"><img :src="icons.chevronDown" alt="" width="9.5" height="5.5" /></span>
                            </div>
                            <p class="field-hint">{{ $t("networkDriverHint") }}</p>
                        </div>

                        <div class="field">
                            <label class="field-label" for="drawer-network-subnet">{{ $t("subnet") }}</label>
                            <input id="drawer-network-subnet" v-model.trim="draft.subnet" class="field-input" placeholder="e.g. 172.20.0.0/16" autocomplete="off" />
                            <p class="field-hint">{{ $t("subnetHint") }}</p>
                        </div>
                    </template>

                    <!-- External network -->
                    <div v-else class="field">
                        <span class="field-label">{{ $t("existingNetworks") }}</span>
                        <input v-model.trim="search" class="field-input" :placeholder="$t('searchNetworks')" autocomplete="off" :aria-label="$t('searchNetworks')" />

                        <div class="host-options" role="radiogroup">
                            <button
                                v-for="network in filteredHostNetworks" :key="network.name" type="button" class="host-option"
                                role="radio" :aria-checked="draft.external === network.name" :class="{ selected: draft.external === network.name }"
                                @click="draft.external = network.name"
                            >
                                <img :src="draft.external === network.name ? icons.radioOn : icons.radioOff" alt="" width="18" height="18" />
                                <span class="info">
                                    <span class="name">{{ network.name }}</span>
                                    <span v-if="network.driver" class="meta">{{ network.driver }} · {{ $tc("containerCount", network.containers) }}</span>
                                </span>
                            </button>
                            <div v-if="filteredHostNetworks.length === 0" class="field-hint">{{ $t("noMatchingNetworks") }}</div>
                        </div>

                        <p class="field-hint">{{ $t("existingNetworksHint") }}</p>
                    </div>
                </form>

                <!-- Footer -->
                <footer class="drawer-footer">
                    <span class="footer-spacer"></span>
                    <button type="button" class="footer-btn secondary" @click="close">{{ $t("cancel") }}</button>
                    <button type="submit" form="network-drawer-form" class="footer-btn primary" :disabled="busy">
                        <span v-if="isAdd" class="icon"><img :src="icons.plusOnAccent" alt="" width="10.8333" height="10.8333" /></span>
                        {{ isAdd ? $t("addNetwork") : $t("saveChanges") }}
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

// Network names allowed by Docker Compose
const NETWORK_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;

// IPv4 or IPv6 CIDR, e.g. 172.20.0.0/16
const SUBNET_PATTERN = /^[0-9a-fA-F:.]+\/\d{1,3}$/;

// Networks Compose cannot attach as external
const UNSUPPORTED_EXTERNAL = [ "none", "host", "bridge" ];

/**
 * Side drawer to add a network to the stack (new or external) or edit one
 */
export default {
    props: {
        /** Whether the drawer is shown */
        open: {
            type: Boolean,
            default: false,
        },
        /** Network to edit, or an empty string to add one */
        networkName: {
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
            hostNetworks: [],
            typeOptions: [
                {
                    value: "new",
                    label: "newNetwork",
                },
                {
                    value: "external",
                    label: "externalExisting",
                },
            ],
            driverOptions: [ "bridge", "overlay", "macvlan", "ipvlan" ],
        };
    },
    computed: {
        isAdd() {
            return this.networkName === "";
        },

        networks() {
            return this.jsonConfig.networks ?? {};
        },

        /**
         * Host networks that can be attached: not this stack's own networks,
         * not already in the compose file, and matching the search
         * @returns {object[]} Networks with name, driver and container count
         */
        filteredHostNetworks() {
            const search = this.search.toLowerCase();
            return this.hostNetworks.filter((network) =>
                !UNSUPPORTED_EXTERNAL.includes(network.name)
                && !(this.stackName && network.name.startsWith(this.stackName + "_"))
                && (network.name === this.draft.external || !(network.name in this.networks))
                && network.name.toLowerCase().includes(search));
        },
    },
    watch: {
        open(isOpen) {
            if (isOpen) {
                this.load();
                this.loadHostNetworks();
                this.$nextTick(() => this.$refs.nameInput?.focus());
            }
        },
    },
    methods: {
        emptyDraft() {
            return {
                type: "new",
                name: "",
                driver: "bridge",
                subnet: "",
                external: "",
            };
        },

        /**
         * Fill the form from the network being edited, or reset it
         * @returns {void}
         */
        load() {
            const draft = this.emptyDraft();
            this.search = "";

            if (!this.isAdd) {
                const config = this.networks[this.networkName] ?? {};
                if (config.external) {
                    draft.type = "external";
                    draft.external = config.name ?? this.networkName;
                } else {
                    draft.name = this.networkName;
                    draft.driver = config.driver ?? "bridge";
                    draft.subnet = config.ipam?.config?.[0]?.subnet ?? "";
                }
            }

            this.draft = draft;
        },

        /**
         * Load the networks on the Docker host. Falls back to names only
         * for agents that do not support the details event.
         * @returns {void}
         */
        loadHostNetworks() {
            this.$root.emitAgent(this.endpoint, "getDockerNetworkDetails", (res) => {
                if (res.ok) {
                    this.hostNetworks = res.dockerNetworkDetails;
                    return;
                }
                this.$root.emitAgent(this.endpoint, "getDockerNetworkList", (listRes) => {
                    if (listRes.ok) {
                        this.hostNetworks = listRes.dockerNetworkList.map((name) => ({
                            name,
                            driver: "",
                            containers: 0,
                        }));
                    }
                });
            });
        },

        close() {
            this.$emit("close");
        },

        /**
         * Validate the form and emit the network's compose configuration
         * @returns {void}
         */
        submit() {
            if (this.draft.type === "external") {
                if (!this.draft.external) {
                    this.$root.toastError(this.$t("selectNetworkRequired"));
                    return;
                }
                this.$emit("submit", {
                    originalName: this.networkName,
                    name: this.draft.external,
                    config: { external: true },
                });
                return;
            }

            const name = this.draft.name.toLowerCase();
            if (!name) {
                this.$root.toastError(this.$t("networkNameRequired"));
                return;
            }
            if (!NETWORK_NAME_PATTERN.test(name)) {
                this.$root.toastError(this.$t("networkNameInvalid"));
                return;
            }
            if (name !== this.networkName && name in this.networks) {
                this.$root.toastError(this.$t("networkNameExists"));
                return;
            }
            if (this.draft.subnet && !SUBNET_PATTERN.test(this.draft.subnet)) {
                this.$root.toastError(this.$t("subnetInvalid"));
                return;
            }

            this.$emit("submit", {
                originalName: this.networkName,
                name,
                config: this.buildConfig(),
            });
        },

        /**
         * Build the network's compose configuration, keeping any settings
         * the form does not show (labels, other IPAM entries, ...)
         * @returns {object} Network configuration
         */
        buildConfig() {
            const original = this.isAdd ? {} : (this.networks[this.networkName] ?? {});
            const config = JSON.parse(JSON.stringify(original));

            // "bridge" is the default, so only write it when it was already there
            if (this.draft.driver === "bridge" && !original.driver) {
                delete config.driver;
            } else {
                config.driver = this.draft.driver;
            }

            const ipamConfig = [ ...(config.ipam?.config ?? []) ];
            const first = { ...(ipamConfig[0] ?? {}) };
            if (this.draft.subnet) {
                first.subnet = this.draft.subnet;
            } else {
                delete first.subnet;
            }

            if (Object.keys(first).length > 0) {
                ipamConfig[0] = first;
            } else {
                ipamConfig.shift();
            }

            if (ipamConfig.length > 0) {
                config.ipam = {
                    ...(config.ipam ?? {}),
                    config: ipamConfig,
                };
            } else if (config.ipam) {
                delete config.ipam.config;
                if (Object.keys(config.ipam).length === 0) {
                    delete config.ipam;
                }
            }

            return config;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/drawer.scss";
</style>
