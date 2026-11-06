<template>
    <Teleport to="body">
        <transition name="drawer-fade">
            <div v-if="open" class="drawer-scrim" :class="$root.theme" @click="close"></div>
        </transition>

        <transition name="drawer-slide">
            <aside v-if="open" class="side-drawer" :class="$root.theme" role="dialog" aria-modal="true" @keydown.esc="close">
                <!-- Header -->
                <header class="drawer-header">
                    <div class="drawer-title">
                        <h2>{{ isAdd ? $t("addNewContainer") : $t("editContainer") }}</h2>
                        <p v-if="isAdd">{{ $t("addContainerSubtitle", [ stackName ]) }}</p>
                        <p v-else>{{ $t("editContainerSubtitle", [ serviceName, stackName ]) }}</p>
                    </div>
                    <button type="button" class="square-btn" :aria-label="$t('cancel')" @click="close">
                        <span class="icon"><img :src="iconClose" alt="" width="9.5" height="9.5" /></span>
                    </button>
                </header>

                <!-- Body -->
                <form id="container-drawer-form" class="drawer-body" @submit.prevent="submit">
                    <!-- Container name -->
                    <div class="field">
                        <label class="field-label" for="drawer-container-name">{{ $t("containerName") }}</label>
                        <input id="drawer-container-name" ref="nameInput" v-model.trim="draft.name" class="field-input" placeholder="e.g. web-app" autocomplete="off" @blur="draft.name = draft.name.toLowerCase()" />
                        <p class="field-hint">{{ $t("containerNameHint") }}</p>
                    </div>

                    <!-- Image -->
                    <div class="field">
                        <label class="field-label" for="drawer-image">{{ $t("dockerImage") }}</label>
                        <input id="drawer-image" v-model.trim="draft.image" class="field-input" placeholder="nginx:latest" autocomplete="off" />
                        <p class="field-hint">{{ $t("imageHint") }}</p>
                    </div>

                    <!-- Ports, volumes, restart policy -->
                    <template v-for="list in simpleLists" :key="list.key">
                        <div v-if="list.key === 'restart'" class="field">
                            <span class="field-label">{{ $t("restartPolicy") }}</span>
                            <div class="chips" role="radiogroup">
                                <button
                                    v-for="option in restartOptions" :key="option.value" type="button" class="choice-chip"
                                    role="radio" :aria-checked="draft.restart === option.value" :class="{ selected: draft.restart === option.value }"
                                    @click="draft.restart = option.value"
                                >
                                    {{ $t(option.label) }}
                                </button>
                            </div>
                            <p class="field-hint">{{ $t("restartPolicyHint") }}</p>
                        </div>

                        <div v-else class="field">
                            <span class="field-label">{{ $tc(list.label, 2) }}</span>
                            <div v-if="draft[list.key].length > 0" class="rows">
                                <div v-for="(item, index) in draft[list.key]" :key="index" class="row-line">
                                    <input v-model.trim="draft[list.key][index]" class="field-input" :placeholder="list.placeholder" />
                                    <button type="button" class="square-btn" :aria-label="$t('remove')" @click="draft[list.key].splice(index, 1)">
                                        <span class="icon"><img :src="iconClose" alt="" width="9.5" height="9.5" /></span>
                                    </button>
                                </div>
                            </div>
                            <button type="button" class="add-row" @click="draft[list.key].push('')">
                                <span class="icon"><img :src="iconPlus" alt="" width="10.8333" height="10.8333" /></span>
                                {{ $t(list.addLabel) }}
                            </button>
                            <p class="field-hint">{{ $t(list.hint) }}</p>
                        </div>
                    </template>

                    <!-- Networks -->
                    <div class="field field-networks">
                        <span class="field-label">{{ $tc("network", 2) }}</span>

                        <div class="sub-field">
                            <label class="group-label" for="drawer-internal-network">{{ $t("internalNetworkLabel") }}</label>
                            <div class="select-wrapper">
                                <select id="drawer-internal-network" v-model="draft.internalNetwork" class="field-input">
                                    <option v-for="name in internalNetworkOptions" :key="name" :value="name">{{ name }}</option>
                                </select>
                                <span class="icon select-chevron"><img :src="iconChevron" alt="" width="9.5" height="5.5" /></span>
                            </div>
                        </div>

                        <div class="sub-field">
                            <span class="group-label">{{ $t("externalOnHostLabel") }}</span>
                            <div v-if="externalNetworkOptions.length === 0" class="field-hint">{{ $t("No External Networks") }}</div>
                            <div v-for="name in externalNetworkOptions" :key="name" class="network-toggle">
                                <div class="info">
                                    <div class="name">{{ name }}</div>
                                    <div v-if="hostNetworkInfo[name]?.driver" class="meta">{{ hostNetworkInfo[name].driver }} · {{ $tc("containerCount", hostNetworkInfo[name].containers) }}</div>
                                    <div v-else-if="externalUsedBy(name).length > 0" class="meta">{{ $t("usedBy", [ externalUsedBy(name).join(", ") ]) }}</div>
                                </div>
                                <button
                                    type="button" class="switch" role="switch" :aria-checked="!!draft.externalNetworks[name]" :aria-label="name"
                                    @click="draft.externalNetworks[name] = !draft.externalNetworks[name]"
                                >
                                    <img :src="draft.externalNetworks[name] ? iconSwitchOn : iconSwitchOff" alt="" width="44" height="26" />
                                </button>
                            </div>
                        </div>

                        <p class="field-hint">{{ $t("networksHint") }}</p>
                    </div>

                    <!-- Container dependency -->
                    <div class="field">
                        <span class="field-label">{{ $tc("dependsOn", 1) }}</span>
                        <div v-if="draft.dependsOn.length > 0" class="rows">
                            <div v-for="(item, index) in draft.dependsOn" :key="index" class="row-line">
                                <input v-model.trim="draft.dependsOn[index]" class="field-input" :placeholder="$t('containerName')" list="drawer-service-names" />
                                <button type="button" class="square-btn" :aria-label="$t('deleteContainer')" @click="draft.dependsOn.splice(index, 1)">
                                    <span class="icon"><img :src="iconClose" alt="" width="9.5" height="9.5" /></span>
                                </button>
                            </div>
                        </div>
                        <datalist id="drawer-service-names">
                            <option v-for="name in otherServiceNames" :key="name" :value="name" />
                        </datalist>
                        <button type="button" class="add-row" @click="draft.dependsOn.push('')">
                            <span class="icon"><img :src="iconPlus" alt="" width="10.8333" height="10.8333" /></span>
                            {{ $t("addDependency") }}
                        </button>
                        <p class="field-hint">{{ $t("dependsOnHint") }}</p>
                    </div>

                    <!-- Extra -->
                    <div class="divider-label">
                        <span>{{ $t("extra") }}</span>
                        <span class="line"></span>
                    </div>

                    <!-- URLs -->
                    <div class="field">
                        <span class="field-label">{{ $tc("url", 2) }}</span>
                        <div v-if="draft.urls.length > 0" class="rows">
                            <div v-for="(item, index) in draft.urls" :key="index" class="row-line">
                                <input v-model.trim="draft.urls[index]" class="field-input" placeholder="https://" />
                                <button type="button" class="square-btn" :aria-label="$t('deleteContainer')" @click="draft.urls.splice(index, 1)">
                                    <span class="icon"><img :src="iconClose" alt="" width="9.5" height="9.5" /></span>
                                </button>
                            </div>
                        </div>
                        <button type="button" class="add-row" @click="draft.urls.push('')">
                            <span class="icon"><img :src="iconPlus" alt="" width="10.8333" height="10.8333" /></span>
                            {{ $t("addUrl") }}
                        </button>
                        <p class="field-hint">{{ $t("urlsHint") }}</p>
                    </div>
                </form>

                <!-- Footer -->
                <footer class="drawer-footer">
                    <button v-if="!isAdd" type="button" class="footer-btn danger" :disabled="busy" @click="showDeleteDialog = true">
                        <AssetIcon :src="iconTrash" width="13.5" height="14.8333" />
                        {{ $t("deleteContainerTitle") }}
                    </button>
                    <span class="footer-spacer"></span>
                    <button type="button" class="footer-btn secondary" @click="close">{{ $t("cancel") }}</button>
                    <button type="submit" form="container-drawer-form" class="footer-btn primary" :disabled="busy">
                        <span v-if="isAdd" class="icon"><img :src="iconPlusOnAccent" alt="" width="10.8333" height="10.8333" /></span>
                        {{ isAdd ? $t("addContainer") : $t("saveChanges") }}
                    </button>
                </footer>

                <!-- Delete confirmation -->
                <BModal
                    v-model="showDeleteDialog" :title="$t('deleteContainerTitle')" :cancelTitle="$t('cancel')"
                    :okTitle="$t('deleteContainer')" okVariant="danger" @ok="$emit('delete', serviceName)"
                >
                    {{ $t("deleteContainerMsg", [ serviceName ]) }}
                </BModal>
            </aside>
        </transition>
    </Teleport>
</template>

<script>
import iconClose from "../assets/drawer/close.svg";
import iconPlus from "../assets/drawer/plus.svg";
import iconPlusOnAccent from "../assets/drawer/plus-on-accent.svg";
import iconChevron from "../assets/drawer/chevron-down.svg";
import iconSwitchOn from "../assets/drawer/switch-on.svg";
import iconSwitchOff from "../assets/drawer/switch-off.svg";
import iconTrash from "../assets/stack/trash.svg";
import AssetIcon from "./AssetIcon.vue";
import { BModal } from "bootstrap-vue-next";

// Service names allowed by Docker Compose
const SERVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;

/**
 * Names of the networks a service is attached to
 * @param {object} service Compose service
 * @returns {string[]|null} Network names, or null when the service has no "networks" key
 */
function networksOf(service) {
    const list = service?.networks;
    if (!list) {
        return null;
    }
    return Array.isArray(list) ? list : Object.keys(list);
}

export default {
    components: {
        AssetIcon,
        BModal,
    },
    props: {
        /** Whether the drawer is shown */
        open: {
            type: Boolean,
            default: false,
        },
        /** Name of the service to edit, or an empty string to add a new one */
        serviceName: {
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
        /** Disables the submit button while the parent is working */
        busy: {
            type: Boolean,
            default: false,
        },
    },
    emits: [ "close", "submit", "delete" ],
    data() {
        return {
            iconClose,
            iconPlus,
            iconPlusOnAccent,
            iconChevron,
            iconSwitchOn,
            iconSwitchOff,
            iconTrash,
            showDeleteDialog: false,
            hostNetworks: [],
            hostNetworkInfo: {},
            draft: this.emptyDraft(),
            simpleLists: [
                {
                    key: "ports",
                    composeKey: "ports",
                    label: "port",
                    addLabel: "addPort",
                    hint: "portsHint",
                    placeholder: "8080:80",
                },
                {
                    key: "volumes",
                    composeKey: "volumes",
                    label: "volume",
                    addLabel: "addVolume",
                    hint: "volumesHint",
                    placeholder: "app-data:/data",
                },
                {
                    key: "restart",
                },
            ],
            restartOptions: [
                {
                    value: "no",
                    label: "restartPolicyNo",
                },
                {
                    value: "always",
                    label: "restartPolicyAlways",
                },
                {
                    value: "unless-stopped",
                    label: "restartPolicyUnlessStopped",
                },
                {
                    value: "on-failure",
                    label: "restartPolicyOnFailure",
                },
            ],
        };
    },
    computed: {
        isAdd() {
            return this.serviceName === "";
        },

        services() {
            return this.jsonConfig.services ?? {};
        },

        /**
         * Networks defined by this stack, plus the implicit "default" network
         * @returns {string[]} Network names
         */
        internalNetworkOptions() {
            const names = Object.entries(this.jsonConfig.networks ?? {})
                .filter(([ , config ]) => !config?.external)
                .map(([ name ]) => name);
            if (!names.includes("default")) {
                names.unshift("default");
            }
            return names;
        },

        /**
         * External networks: the ones on the host plus the ones already
         * declared as external in the compose file
         * @returns {string[]} Network names
         */
        externalNetworkOptions() {
            const declared = Object.entries(this.jsonConfig.networks ?? {})
                .filter(([ , config ]) => config?.external)
                .map(([ name ]) => name);
            return [ ...new Set([ ...declared, ...this.hostNetworks ]) ];
        },

        otherServiceNames() {
            return Object.keys(this.services).filter((name) => name !== this.serviceName);
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
        /**
         * A blank form
         * @returns {object} Draft values
         */
        emptyDraft() {
            return {
                name: "",
                image: "",
                ports: [],
                volumes: [],
                restart: "unless-stopped",
                internalNetwork: "default",
                externalNetworks: {},
                dependsOn: [],
                urls: [],
            };
        },

        /**
         * Fill the form from the service being edited, or reset it for a new one
         * @returns {void}
         */
        load() {
            const draft = this.emptyDraft();
            const urls = this.jsonConfig["x-dockge"]?.urls;
            draft.urls = Array.isArray(urls) ? [ ...urls ] : [];

            if (!this.isAdd) {
                const service = this.services[this.serviceName] ?? {};
                draft.name = this.serviceName;
                draft.image = service.image ?? "";
                draft.ports = (service.ports ?? []).filter((p) => typeof p !== "object").map(String);
                draft.volumes = (service.volumes ?? []).filter((v) => typeof v !== "object").map(String);
                draft.restart = service.restart ?? "";

                const declared = this.jsonConfig.networks ?? {};
                const attached = networksOf(service) ?? [];
                for (const name of attached) {
                    if (declared[name]?.external) {
                        draft.externalNetworks[name] = true;
                    } else if (draft.internalNetwork === "default") {
                        draft.internalNetwork = name;
                    }
                }

                const dependsOn = service.depends_on;
                draft.dependsOn = Array.isArray(dependsOn) ? [ ...dependsOn ] : Object.keys(dependsOn ?? {});
            }

            this.draft = draft;
        },

        /**
         * Load the networks that already exist on the Docker host
         * @returns {void}
         */
        loadHostNetworks() {
            // Skip this stack's own networks and the ones Compose does not support
            const usable = (name) => !(this.stackName && name.startsWith(this.stackName + "_"))
                && ![ "none", "host", "bridge" ].includes(name);

            this.$root.emitAgent(this.endpoint, "getDockerNetworkDetails", (res) => {
                if (res.ok) {
                    const info = {};
                    for (const network of res.dockerNetworkDetails) {
                        info[network.name] = network;
                    }
                    this.hostNetworkInfo = info;
                    this.hostNetworks = res.dockerNetworkDetails.map((network) => network.name).filter(usable);
                    return;
                }

                // Older agents only list names
                this.$root.emitAgent(this.endpoint, "getDockerNetworkList", (listRes) => {
                    if (listRes.ok) {
                        this.hostNetworks = listRes.dockerNetworkList.filter(usable);
                    }
                });
            });
        },

        /**
         * Other services of this stack attached to an external network
         * @param {string} networkName Network name
         * @returns {string[]} Service names
         */
        externalUsedBy(networkName) {
            return this.otherServiceNames.filter((name) => (networksOf(this.services[name]) ?? []).includes(networkName));
        },

        close() {
            this.$emit("close");
        },

        /**
         * Validate the form and emit the resulting compose service
         * @returns {void}
         */
        submit() {
            const name = this.draft.name.toLowerCase();

            if (!name) {
                this.$root.toastError(this.$t("containerNameRequired"));
                return;
            }
            if (!SERVICE_NAME_PATTERN.test(name)) {
                this.$root.toastError(this.$t("containerNameInvalid"));
                return;
            }
            if (name !== this.serviceName && this.services[name]) {
                this.$root.toastError(this.$t("containerNameExists"));
                return;
            }
            if (this.isAdd && !this.draft.image) {
                this.$root.toastError(this.$t("imageRequired"));
                return;
            }

            this.$emit("submit", {
                originalName: this.serviceName,
                name,
                service: this.buildService(),
                urls: this.draft.urls.filter((url) => url !== ""),
                externalNetworks: Object.keys(this.draft.externalNetworks).filter((n) => this.draft.externalNetworks[n]),
                internalNetwork: this.draft.internalNetwork,
            });
        },

        /**
         * Build the compose service from the form, keeping any settings
         * the form does not show (and long-syntax entries) untouched
         * @returns {object} Compose service
         */
        buildService() {
            const original = this.isAdd ? {} : (this.services[this.serviceName] ?? {});
            const service = JSON.parse(JSON.stringify(original));
            const setOrDelete = (key, value, isEmpty) => {
                if (isEmpty) {
                    delete service[key];
                } else {
                    service[key] = value;
                }
            };

            setOrDelete("image", this.draft.image, !this.draft.image);
            setOrDelete("restart", this.draft.restart, !this.draft.restart);

            // Ports and volumes: keep long-syntax objects, replace the short ones.
            // Environment variables are edited in the env drawer and kept as they are.
            for (const list of this.simpleLists.filter((item) => item.composeKey)) {
                const longSyntax = (original[list.composeKey] ?? []).filter((item) => typeof item === "object");
                const values = [ ...this.draft[list.key].filter((item) => item !== ""), ...longSyntax ];
                setOrDelete(list.composeKey, values, values.length === 0);
            }

            // Networks: "default" alone is the same as no "networks" key
            const external = Object.keys(this.draft.externalNetworks).filter((n) => this.draft.externalNetworks[n]);
            const networkNames = [ this.draft.internalNetwork, ...external ];
            if (external.length === 0 && this.draft.internalNetwork === "default") {
                delete service.networks;
            } else if (original.networks && !Array.isArray(original.networks)) {
                const networks = {};
                for (const name of networkNames) {
                    networks[name] = original.networks[name] ?? null;
                }
                service.networks = networks;
            } else {
                service.networks = networkNames;
            }

            // Dependencies: keep the original form (list or map with conditions)
            const dependsOn = this.draft.dependsOn.filter((name) => name !== "");
            if (original.depends_on && !Array.isArray(original.depends_on)) {
                const map = {};
                for (const name of dependsOn) {
                    map[name] = original.depends_on[name] ?? { condition: "service_started" };
                }
                setOrDelete("depends_on", map, dependsOn.length === 0);
            } else {
                setOrDelete("depends_on", dependsOn, dependsOn.length === 0);
            }

            return service;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/drawer.scss";
</style>
