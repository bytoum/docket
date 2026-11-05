<template>
    <transition name="slide-fade" appear>
        <div class="stack-page">
            <!-- Header -->
            <h1 v-if="isAdd" class="mb-3">{{ $t("compose") }}</h1>
            <div v-else class="stack-header">
                <Uptime :stack="globalStack" />
                <h1>{{ stack.name }}</h1>
                <span v-if="stack.isManagedByDockge" class="meta">{{ $tc("containerCount", serviceCount) }}</span>
                <span v-if="$root.agentCount > 1 && endpoint !== ''" class="meta">
                    ({{ endpointDisplay }})
                </span>
            </div>

            <!-- Actions -->
            <div v-if="stack.isManagedByDockge" class="action-bar">
                <template v-if="isEditMode">
                    <button class="btn btn-primary" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ $t("deployStack") }}
                    </button>

                    <button class="btn btn-light-outline" :disabled="processing" @click="saveStack">
                        <font-awesome-icon icon="save" class="me-1" />
                        {{ $t("saveStackDraft") }}
                    </button>

                    <button v-if="!isAdd" class="btn btn-light-outline" :disabled="processing" @click="discardStack">{{ $t("discardStack") }}</button>
                </template>

                <template v-else>
                    <button class="btn btn-primary" :disabled="processing" @click="openContainerDrawer()">
                        <font-awesome-icon icon="plus" class="me-1" />
                        {{ $t("addContainer") }}
                    </button>

                    <div class="btn-group action-group" role="group">
                        <button v-if="!active" class="btn" :disabled="processing" @click="startStack">
                            <font-awesome-icon icon="play" class="me-1" />
                            {{ $t("startStack") }}
                        </button>

                        <button v-if="active" class="btn" :disabled="processing" @click="restartStack">
                            <font-awesome-icon icon="rotate" class="me-1" />
                            {{ $t("restartStack") }}
                        </button>

                        <button class="btn" :disabled="processing" @click="updateStack">
                            <font-awesome-icon icon="cloud-arrow-down" class="me-1" />
                            {{ $t("updateStack") }}
                        </button>

                        <button v-if="active" class="btn" :disabled="processing" @click="stopStack">
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("stopStack") }}
                        </button>

                        <BDropdown right text="" variant="link" class="more-dropdown">
                            <BDropdownItem @click="downStack">
                                <font-awesome-icon icon="stop" class="me-1" />
                                {{ $t("downStack") }}
                            </BDropdownItem>
                        </BDropdown>
                    </div>

                    <button class="btn btn-soft-danger ms-auto" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                        <font-awesome-icon icon="trash" class="me-1" />
                        {{ $t("deleteStack") }}
                    </button>
                </template>
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3 d-flex flex-wrap gap-2">
                <a v-for="(urlItem, index) in urls" :key="index" target="_blank" :href="urlItem.url" class="url-pill">
                    <font-awesome-icon icon="link" class="me-1" />{{ urlItem.display }}
                </a>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>

            <div v-if="stack.isManagedByDockge" class="row">
                <div :class="isEditMode ? 'col-lg-6' : 'col-12'">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h2 class="section-title">{{ $t("general") }}</h2>
                        <div class="shadow-box big-padding mb-4">
                            <!-- Stack Name -->
                            <div>
                                <label for="name" class="form-label">{{ $t("stackName") }}</label>
                                <input id="name" v-model="stack.name" type="text" class="form-control" required @blur="stackNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select v-model="stack.endpoint" class="form-select">
                                    <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint" :disabled="$root.agentStatusList[agentEndpoint] != 'online'">
                                        ({{ $root.agentStatusList[agentEndpoint] }}) {{ (agent.name !== '') ? agent.name : agent.url || $t("Current") }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Containers -->
                    <div class="section-head">
                        <h2 class="section-title">{{ $tc("container", 2) }}</h2>
                        <button v-if="!isEditMode" class="btn btn-light-outline btn-sm-flat" @click="editComposeFile">
                            <font-awesome-icon icon="file" class="me-1" />
                            {{ $t("editComposeFile", [ stack.composeFileName || "compose.yaml" ]) }}
                        </button>
                        <button v-else class="btn btn-light-outline btn-sm-flat" @click="openContainerDrawer()">
                            <font-awesome-icon icon="plus" class="me-1" />
                            {{ $t("addContainer") }}
                        </button>
                    </div>

                    <div ref="containerList">
                        <Container
                            v-for="(service, name) in jsonConfig.services"
                            :key="name"
                            :name="name"
                            :is-edit-mode="isEditMode"
                            :first="name === Object.keys(jsonConfig.services)[0]"
                            :serviceStatus="serviceStatusList[name]"
                            :dockerStats="dockerStats"
                            @start-service="startService"
                            @stop-service="stopService"
                            @restart-service="restartService"
                            @edit-service="openContainerDrawer"
                        />
                    </div>

                    <!-- Extra -->
                    <div v-if="isEditMode">
                        <h2 class="section-title">{{ $t("extra") }}</h2>
                        <div class="shadow-box big-padding mb-3">
                            <!-- URLs -->
                            <div class="mb-4">
                                <label class="form-label">
                                    {{ $tc("url", 2) }}
                                </label>
                                <ArrayInput name="urls" :display-name="$t('url')" placeholder="https://" object-type="x-dockge" />
                            </div>
                        </div>
                    </div>

                    <!-- Networks (view mode) -->
                    <div v-if="!isEditMode" class="mt-4">
                        <div class="section-head">
                            <h2 class="section-title">{{ $tc("network", 2) }}</h2>
                            <button class="btn btn-light-outline btn-sm-flat" @click="editNetworks">
                                <font-awesome-icon icon="plus" class="me-1" />
                                {{ $t("addNetwork") }}
                            </button>
                        </div>

                        <template v-for="group in networkGroups" :key="group.key">
                            <div v-if="group.items.length > 0" class="mb-4">
                                <div class="group-label">{{ group.label }}</div>
                                <div v-for="network in group.items" :key="network.name" class="network-row shadow-box">
                                    <span class="network-icon" :class="{ external: group.key === 'external' }">
                                        <font-awesome-icon icon="sitemap" />
                                    </span>
                                    <div class="network-body">
                                        <div class="network-name">{{ network.name }}</div>
                                        <div class="network-used">
                                            <template v-if="network.usedBy.length > 0">{{ $t("usedBy", [ network.usedBy.join(", ") ]) }}</template>
                                            <template v-else>{{ $t("notUsedByAnyContainer") }}</template>
                                        </div>
                                    </div>
                                    <span v-if="network.driver" class="tag-pill">{{ network.driver }}</span>
                                    <span v-if="group.key === 'external'" class="tag-pill tag-blue">{{ $t("externalNetwork") }}</span>
                                    <button class="icon-btn" :title="$t('Edit')" @click="editNetworks">
                                        <font-awesome-icon icon="pen" />
                                    </button>
                                </div>
                                <div class="group-hint">{{ group.hint }}</div>
                            </div>
                        </template>
                    </div>

                    <!-- Combined Terminal Output -->
                    <div v-show="!isEditMode" class="mt-2">
                        <h2 class="section-title">{{ $t("terminal") }}</h2>
                        <Terminal
                            ref="combinedTerminal"
                            class="mb-3 terminal"
                            :name="combinedTerminalName"
                            :endpoint="endpoint"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            style="height: 315px;"
                        ></Terminal>
                    </div>
                </div>

                <div v-if="isEditMode" class="col-lg-6">
                    <h2 ref="yamlEditorTitle" class="section-title">{{ stack.composeFileName }}</h2>

                    <!-- YAML editor -->
                    <div class="shadow-box mb-3 editor-box edit-mode">
                        <code-mirror
                            ref="editor"
                            v-model="stack.composeYAML"
                            :extensions="extensions"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                        />
                    </div>
                    <div class="mb-3">
                        {{ yamlError }}
                    </div>

                    <!-- ENV editor -->
                    <h2 class="section-title">.env</h2>
                    <div class="shadow-box mb-3 editor-box edit-mode">
                        <code-mirror
                            ref="editor"
                            v-model="stack.composeENV"
                            :extensions="extensionsEnv"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                        />
                    </div>

                    <!-- Networks -->
                    <h2 ref="networkEditorTitle" class="section-title">{{ $tc("network", 2) }}</h2>
                    <div class="shadow-box big-padding mb-3">
                        <NetworkInput />
                    </div>
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Add / edit container drawer -->
            <ContainerDrawer
                :open="containerDrawer.open"
                :service-name="containerDrawer.serviceName"
                :json-config="jsonConfig"
                :stack-name="stack.name"
                :endpoint="endpoint"
                :busy="processing && !isEditMode"
                @close="containerDrawer.open = false"
                @submit="applyContainerDrawer"
            />

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteStack')" okVariant="danger" @ok="deleteDialog">
                {{ $t("deleteStackMsg") }}
            </BModal>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView } from "@codemirror/view";
import { parseDocument, Document } from "yaml";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments, envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import ContainerDrawer from "../components/ContainerDrawer.vue";
import dotenv from "dotenv";
import { ref } from "vue";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;

export default {
    components: {
        NetworkInput,
        ContainerDrawer,
        FontAwesomeIcon,
        CodeMirror,
        BModal,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensions = [
            editorTheme,
            yaml(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        const extensionsEnv = [
            editorTheme,
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return { extensions,
            extensionsEnv,
            editorFocus };
    },
    yamlDoc: null,  // For keeping the yaml comments
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            stack: {

            },
            serviceStatusList: {},
            dockerStats: {},
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            containerDrawer: {
                open: false,
                serviceName: "",
            },
            stopServiceStatusTimeout: false,
            stopDockerStatsTimeout: false,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        /**
         * Number of services (containers) defined in the compose file
         * @returns {number} Service count
         */
        serviceCount() {
            return Object.keys(this.jsonConfig.services ?? {}).length;
        },

        /**
         * Networks of this stack for the read-only view, split into networks
         * defined by the stack and external networks that already exist on the host.
         * The implicit "default" network is included when a service uses it.
         * @returns {object[]} Network groups with their items
         */
        networkGroups() {
            const services = this.jsonConfig.services ?? {};
            const networks = this.jsonConfig.networks ?? {};

            const networksOf = (service) => {
                const list = service?.networks;
                if (!list) {
                    return null;
                }
                return Array.isArray(list) ? list : Object.keys(list);
            };

            // A service without a "networks" key is attached to "default"
            const usedBy = (networkName) => Object.keys(services).filter((serviceName) => {
                const list = networksOf(services[serviceName]);
                return list ? list.includes(networkName) : networkName === "default";
            });

            const names = Object.keys(networks);
            if (!names.includes("default") && usedBy("default").length > 0) {
                names.unshift("default");
            }

            const stackItems = [];
            const externalItems = [];

            for (const name of names) {
                const config = networks[name] ?? {};
                const item = {
                    name,
                    driver: config.driver ?? (config.external ? "" : "bridge"),
                    usedBy: usedBy(name),
                };
                (config.external ? externalItems : stackItems).push(item);
            }

            return [
                {
                    key: "stack",
                    label: this.$t("stackNetworks"),
                    hint: this.$t("stackNetworksHint"),
                    items: stackItems,
                },
                {
                    key: "external",
                    label: this.$t("External Networks"),
                    hint: this.$t("externalNetworksHint"),
                    items: externalItems,
                },
            ];
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = template;
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    unmounted() {

    },
    methods: {
        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        startDockerStatsTimeout() {
            clearTimeout(dockerStatsTimeout);
            dockerStatsTimeout = setTimeout(async () => {
                this.requestDockerStats();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        requestDockerStats() {
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
                if (!this.stopDockerStatsTimeout) {
                    this.startDockerStatsTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            this.stopDockerStatsTimeout = true;
            clearTimeout(serviceStatusTimeout);
            clearTimeout(dockerStatsTimeout);

            // Leave Combined Terminal
            console.debug("leaveCombinedTerminal", this.endpoint, this.stack.name);
            this.$root.emitAgent(this.endpoint, "leaveCombinedTerminal", this.stack.name, () => {});
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                    this.bindTerminal();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        saveStack() {
            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        deleteDialog() {
            this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                }
            });
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (Array.isArray(config.services) || typeof config.services !== "object") {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;

                let env = dotenv.parse(this.stack.composeENV);
                let envYAML = envsubstYAML(this.stack.composeYAML, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        /**
         * Switch to edit mode and scroll the given element into view
         * @param {string} refName Name of the ref to scroll to
         * @returns {void}
         */
        editAndScrollTo(refName) {
            this.enableEditMode();
            this.$nextTick(() => {
                this.$refs[refName]?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                });
            });
        },

        /**
         * Switch to edit mode and show the compose file editor
         * @returns {void}
         */
        editComposeFile() {
            this.editAndScrollTo("yamlEditorTitle");
        },

        /**
         * Switch to edit mode and show the network editor
         * @returns {void}
         */
        editNetworks() {
            this.editAndScrollTo("networkEditorTitle");
        },

        /**
         * Open the container drawer
         * @param {string} [serviceName] Service to edit; omit to add a new container
         * @returns {void}
         */
        openContainerDrawer(serviceName = "") {
            this.containerDrawer.serviceName = typeof serviceName === "string" ? serviceName : "";
            this.containerDrawer.open = true;
        },

        /**
         * Apply the container drawer's result to the compose file.
         * In view mode the stack is deployed right away; in edit mode the
         * change stays in the editor until the user deploys or saves.
         * @param {object} result Values emitted by the drawer
         * @returns {void}
         */
        applyContainerDrawer({ originalName, name, service, urls, externalNetworks, internalNetwork }) {
            const config = this.jsonConfig;
            config.services = config.services ?? {};

            if (originalName && originalName !== name) {
                // Rename while keeping the service order
                const services = {};
                for (const [ key, value ] of Object.entries(config.services)) {
                    services[key === originalName ? name : key] = key === originalName ? service : value;
                }
                config.services = services;

                // Point other services' dependencies at the new name
                for (const other of Object.values(config.services)) {
                    const dependsOn = other?.depends_on;
                    if (Array.isArray(dependsOn)) {
                        other.depends_on = dependsOn.map((dep) => dep === originalName ? name : dep);
                    } else if (dependsOn && originalName in dependsOn) {
                        dependsOn[name] = dependsOn[originalName];
                        delete dependsOn[originalName];
                    }
                }
            } else {
                config.services[name] = service;
            }

            // Declare the networks the service now uses
            if (internalNetwork !== "default" || externalNetworks.length > 0) {
                config.networks = config.networks ?? {};
                if (internalNetwork !== "default" && !(internalNetwork in config.networks)) {
                    config.networks[internalNetwork] = {};
                }
                for (const networkName of externalNetworks) {
                    if (!config.networks[networkName]) {
                        config.networks[networkName] = { external: true };
                    }
                }
            }

            // URLs live in the stack-level "x-dockge" section
            if (urls.length > 0) {
                config["x-dockge"] = config["x-dockge"] ?? {};
                config["x-dockge"].urls = urls;
            } else if (config["x-dockge"]) {
                delete config["x-dockge"].urls;
                if (Object.keys(config["x-dockge"]).length === 0) {
                    delete config["x-dockge"];
                }
            }

            this.containerDrawer.open = false;

            if (!this.isEditMode) {
                // Wait for the jsonConfig watcher to regenerate the YAML, then deploy
                this.$nextTick(() => this.deployStack());
            }
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },

        startService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        stopService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        restartService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },
    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.terminal {
    height: 200px;
}

.editor-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
}

// Header
.stack-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 18px;

    h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
    }

    .meta {
        font-size: 13px;
        color: $muted;
    }
}

// Action bar
.action-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 28px;

    .btn {
        font-size: 14px;
        font-weight: 500;
        padding: 6px 14px;
        border-radius: 8px;
    }
}

.action-group {
    background-color: #fff;
    border: 1px solid $surface-border;
    border-radius: 8px;

    > .btn,
    :deep(.btn) {
        border: none;
        border-radius: 0 !important;
        color: #374151;
        background: transparent;
        padding: 6px 12px;

        &:hover {
            background-color: #f3f4f6;
        }
    }

    > .btn:first-child {
        border-top-left-radius: 8px !important;
        border-bottom-left-radius: 8px !important;
    }

    :deep(.more-dropdown .btn) {
        border-top-right-radius: 8px !important;
        border-bottom-right-radius: 8px !important;
        padding: 6px 10px;
    }
}

.btn-light-outline {
    color: #374151;
    background-color: #fff;
    border: 1px solid $surface-border;

    &:hover {
        background-color: #f3f4f6;
    }
}

.btn-sm-flat {
    font-size: 13px;
    font-weight: 500;
    padding: 5px 12px;
    border-radius: 8px;
}

.btn-soft-danger {
    color: $danger;
    background-color: rgba($danger, 0.1);
    border: none;

    &:hover {
        color: #fff;
        background-color: $danger;
    }
}

.url-pill {
    font-size: 12px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 50rem;
    text-decoration: none;
    color: $primary;
    background-color: rgba($primary, 0.1);

    &:hover {
        background-color: rgba($primary, 0.18);
    }
}

// Sections
.section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 14px;

    .section-title {
        margin-bottom: 0;
    }
}

.section-title {
    font-size: 1.05rem;
    font-weight: 600;
    margin-bottom: 14px;
}

.group-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $muted;
    margin-bottom: 8px;
}

.group-hint {
    font-size: 12px;
    color: $muted;
    margin-top: 2px;
}

// Network rows
.network-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    margin-bottom: 8px;
}

.network-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 13px;
    color: $primary;
    background-color: #e8ecff;

    &.external {
        color: $muted;
        background-color: rgba($muted, 0.12);
    }
}

.network-body {
    flex: 1;
    min-width: 0;
}

.network-name {
    font-size: 14px;
    font-weight: 600;
}

.network-used {
    font-size: 12px;
    color: $muted;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tag-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 50rem;
    font-size: 11px;
    font-weight: 500;
    color: #4b5563;
    background-color: rgba($muted, 0.12);

    &::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: currentColor;
    }

    &.tag-blue {
        color: $primary;
        background-color: rgba($primary, 0.12);
    }
}

.icon-btn {
    flex-shrink: 0;
    border: 1px solid $surface-border;
    background: #fff;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    font-size: 12px;
    color: #4b5563;

    &:hover {
        background-color: #f3f4f6;
    }
}

// Dark theme
.dark {
    .action-group,
    .btn-light-outline,
    .icon-btn {
        background-color: $dark-bg;
        border-color: $dark-border-color;
        color: $dark-font-color;
    }

    .action-group > .btn,
    .action-group :deep(.btn) {
        color: $dark-font-color;

        &:hover {
            background-color: $dark-bg2;
        }
    }

    .btn-light-outline:hover,
    .icon-btn:hover {
        background-color: $dark-bg2;
    }

    .network-icon {
        background-color: rgba($primary, 0.2);
        color: $highlight;
    }

    .tag-pill {
        color: $dark-font-color;
    }

    .tag-blue {
        color: $highlight;
    }
}
</style>
