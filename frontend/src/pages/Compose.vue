<template>
    <transition name="slide-fade" appear>
        <div class="stack-page">
            <!-- Header -->
            <div v-if="isAdd" class="stack-header">
                <span class="state-pill accent"><img :src="icons.dotAccent" width="6" height="6" alt="" />{{ $t("newBadge") }}</span>
                <h1>{{ $t("newStack") }}</h1>
                <span class="meta">{{ $t("newStackSubtitle") }}</span>
            </div>
            <div v-else-if="isEditMode" class="stack-header">
                <span class="state-pill accent"><img :src="icons.dotAccent" width="6" height="6" alt="" />{{ $t("editingBadge") }}</span>
                <h1>{{ stack.name }}</h1>
                <span class="meta">{{ stack.composeFileName || "compose.yaml" }}</span>
            </div>
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
                    <!-- Save = save and deploy; the menu saves without deploying -->
                    <div class="save-group">
                        <button class="btn btn-primary toolbar-btn save-main" :disabled="processing" @click="deployStack">
                            {{ isAdd ? $t("deployStack") : $t("Save") }}
                        </button>
                        <BDropdown right no-caret variant="primary" class="save-more" toggle-class="toolbar-btn save-toggle" :disabled="processing">
                            <template #button-content>
                                <font-awesome-icon icon="chevron-down" />
                                <span class="visually-hidden">{{ $t("saveWithoutDeploying") }}</span>
                            </template>
                            <BDropdownItem @click="saveStack">
                                {{ $t("saveWithoutDeploying") }}
                            </BDropdownItem>
                        </BDropdown>
                    </div>

                    <button v-if="isAdd" class="btn btn-light-outline toolbar-btn" :disabled="processing" @click="$router.push('/')">{{ $t("cancel") }}</button>
                    <button v-else class="btn btn-light-outline toolbar-btn" :disabled="processing" @click="discardStack">{{ $t("discardStack") }}</button>

                    <span v-if="isDirty" class="state-pill warning ms-auto">
                        <img :src="icons.dotWarning" width="6" height="6" alt="" />{{ $t("unsavedChanges") }}
                    </span>
                </template>

                <template v-else>
                    <button class="btn btn-primary toolbar-btn" :disabled="processing" @click="openContainerDrawer()">
                        <AssetIcon :src="icons.plusOnAccent" width="10.8333" height="10.8333" />
                        {{ $t("addContainer") }}
                    </button>

                    <div class="action-group" role="group">
                        <button v-if="!active" class="action" :disabled="processing" @click="startStack">
                            <font-awesome-icon icon="play" class="play-icon" />
                            {{ $t("startStack") }}
                        </button>

                        <button v-if="active" class="action" :disabled="processing" @click="restartStack">
                            <AssetIcon :src="icons.restart" width="13.5" height="13.5" tone="neutral" />
                            {{ $t("restartStack") }}
                        </button>

                        <button class="action" :disabled="processing" @click="updateStack">
                            <AssetIcon :src="icons.update" width="14.8324" height="13.4997" tone="neutral" />
                            {{ $t("updateStack") }}
                        </button>

                        <button v-if="active" class="action" :disabled="processing" @click="stopStack">
                            <AssetIcon :src="icons.stop" width="10.8333" height="10.8333" tone="neutral" />
                            {{ $t("stopStack") }}
                        </button>

                        <BDropdown right no-caret variant="link" class="more-dropdown" toggle-class="action action-more">
                            <template #button-content>
                                <AssetIcon :src="icons.chevronDown" width="9.5" height="5.5" tone="neutral" />
                            </template>
                            <BDropdownItem @click="downStack">
                                <font-awesome-icon icon="stop" class="me-1" />
                                {{ $t("downStack") }}
                            </BDropdownItem>
                        </BDropdown>
                    </div>

                    <button class="btn btn-soft-danger toolbar-btn ms-auto" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                        <AssetIcon :src="icons.trash" width="13.5" height="14.8333" />
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

            <!-- View mode -->
            <div v-if="stack.isManagedByDockge && !isEditMode">
                <!-- Containers -->
                <div class="section-head">
                    <h2 class="section-title">{{ $tc("container", 2) }}</h2>
                    <button class="btn btn-light-outline toolbar-btn" @click="editComposeFile">
                        <AssetIcon :src="icons.file" width="12" height="14.6667" tone="neutral" />
                        {{ $t("editComposeFile", [ stack.composeFileName || "compose.yaml" ]) }}
                    </button>
                </div>

                <div ref="containerList">
                    <Container
                        v-for="(service, name) in jsonConfig.services"
                        :key="name"
                        :name="name"
                        :first="name === Object.keys(jsonConfig.services)[0]"
                        :serviceStatus="serviceStatusList[name]"
                        :dockerStats="dockerStats"
                        @start-service="startService"
                        @stop-service="stopService"
                        @restart-service="restartService"
                        @edit-service="openContainerDrawer"
                        @delete-service="deleteContainer"
                    />
                </div>

                <!-- Networks (view mode) -->
                <div class="networks-section">
                    <div class="section-head">
                        <h2 class="section-title">{{ $tc("network", 2) }}</h2>
                        <button class="btn btn-light-outline toolbar-btn" @click="openNetworkDrawer()">
                            <AssetIcon :src="icons.plus" width="10.8333" height="10.8333" tone="neutral" />
                            {{ $t("addNetwork") }}
                        </button>
                    </div>

                    <template v-for="group in networkGroups" :key="group.key">
                        <div v-if="group.items.length > 0" class="network-group">
                            <div class="group-label">{{ group.label }}</div>
                            <div v-for="network in group.items" :key="network.name" class="network-row">
                                <span class="network-icon" :class="{ external: group.key === 'external' }">
                                    <AssetIcon :src="group.key === 'external' ? icons.networkExternal : icons.network" width="16.5" height="16.5" :box="18" />
                                </span>
                                <div class="network-body">
                                    <div class="network-name">{{ network.name }}</div>
                                    <div class="network-used">
                                        <template v-if="network.usedBy.length > 0">{{ $t("usedBy", [ network.usedBy.join(", ") ]) }}</template>
                                        <template v-else>{{ $t("notUsedByAnyContainer") }}</template>
                                    </div>
                                </div>
                                <div class="tags">
                                    <span v-if="network.driver" class="tag-pill"><img :src="icons.dotNeutral" width="6" height="6" alt="" />{{ network.driver }}</span>
                                    <span v-if="group.key === 'external'" class="tag-pill tag-blue"><img :src="icons.dotAccent" width="6" height="6" alt="" />{{ $t("externalNetwork") }}</span>
                                </div>
                                <button class="icon-btn" :title="$t('Edit')" @click="openNetworkDrawer(network.name)">
                                    <AssetIcon :src="icons.pen" width="14.7317" height="14.7317" tone="neutral" />
                                </button>
                            </div>
                            <div class="group-hint">{{ group.hint }}</div>
                        </div>
                    </template>
                </div>
            </div>

            <!-- Edit mode: compose.yaml / .env editor -->
            <div v-if="stack.isManagedByDockge && isEditMode" class="edit-view">
                <!-- New stack: name, starting point and agent -->
                <div v-if="isAdd" class="setup-row">
                    <div class="setup-field stack-name-field">
                        <label for="name" class="field-label">{{ $t("stackName") }}</label>
                        <input id="name" v-model="stack.name" type="text" class="form-control setup-input" required placeholder="e.g. my-stack" autocomplete="off" @blur="stackNameToLowercase">
                        <p class="field-hint">{{ $t("stackNameHint") }}</p>
                    </div>

                    <div class="setup-field">
                        <span class="field-label">{{ $t("startFrom") }}</span>
                        <div class="choice-chips" role="radiogroup">
                            <button
                                v-for="option in startFromOptions" :key="option.value" type="button" class="choice-chip"
                                role="radio" :aria-checked="startFrom === option.value" :class="{ selected: startFrom === option.value }"
                                @click="applyStartFrom(option.value)"
                            >
                                {{ $t(option.label) }}
                            </button>
                        </div>
                        <p class="field-hint">{{ $t("startFromHint") }}</p>
                    </div>

                    <div v-if="$root.agentCount > 1" class="setup-field">
                        <label for="endpoint" class="field-label">{{ $t("dockgeAgent") }}</label>
                        <select id="endpoint" v-model="stack.endpoint" class="form-select setup-input">
                            <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint" :disabled="$root.agentStatusList[agentEndpoint] != 'online'">
                                ({{ $root.agentStatusList[agentEndpoint] }}) {{ (agent.name !== '') ? agent.name : agent.url || $t("Current") }}
                            </option>
                        </select>
                    </div>
                </div>

                <!-- Start from docker run -->
                <div v-if="isAdd && startFrom === 'dockerRun'" class="docker-run-row">
                    <textarea v-model="dockerRunCommand" class="form-control docker-run-input" rows="2" spellcheck="false" placeholder="docker run -d --name my-app -p 8080:80 nginx:latest"></textarea>
                    <button type="button" class="btn btn-primary toolbar-btn" :disabled="!dockerRunCommand.trim()" @click="convertDockerRun">
                        {{ $t("Convert to Compose") }}
                    </button>
                </div>

                <div class="edit-content" :class="{ 'with-panel': isAdd }">
                    <!-- New stack: containers, in sync with compose.yaml -->
                    <div v-if="isAdd" class="containers-panel">
                        <div class="section-head">
                            <div>
                                <h2 class="section-title">{{ $tc("container", 2) }}</h2>
                                <p class="field-hint">{{ $t("containersSyncHint") }}</p>
                            </div>
                            <button class="btn btn-light-outline toolbar-btn" @click="openContainerDrawer()">
                                <AssetIcon :src="icons.plus" width="10.8333" height="10.8333" tone="neutral" />
                                {{ $t("addContainer") }}
                            </button>
                        </div>

                        <div class="service-rows">
                            <div v-for="(service, name) in jsonConfig.services" :key="name" class="service-row">
                                <span class="service-icon"><AssetIcon :src="icons.cubeLarge" width="15" height="16.4985" :box="18" /></span>
                                <div class="service-info">
                                    <div class="service-name">{{ name }}</div>
                                    <div v-if="service?.image" class="service-image">{{ service.image }}</div>
                                </div>
                                <span v-if="firstPort(service)" class="tag-pill"><img :src="icons.dotNeutral" width="6" height="6" alt="" />{{ firstPort(service) }}</span>
                                <button type="button" class="row-btn" :title="$t('Edit')" @click="openContainerDrawer(name)">
                                    <AssetIcon :src="icons.penRow" width="12.8902" height="12.8902" :box="14" tone="neutral" />
                                </button>
                                <button type="button" class="row-btn danger" :title="$t('deleteContainer')" @click="deleteContainer(name)">
                                    <AssetIcon :src="icons.trashRow" width="11.6667" height="12.8333" :box="14" />
                                </button>
                            </div>
                            <p v-if="serviceCount === 0" class="field-hint">{{ $t("noContainersYet") }}</p>
                        </div>
                    </div>

                    <div class="editor-card">
                        <div class="editor-header">
                            <div class="file-tabs" role="tablist">
                                <button
                                    v-for="file in editorFiles" :key="file.key" type="button" class="file-tab" role="tab"
                                    :aria-selected="activeFile === file.key" :class="{ active: activeFile === file.key }"
                                    @click="activeFile = file.key"
                                >
                                    <AssetIcon :src="icons.fileTab" width="12" height="14.6667" tone="neutral" />
                                    {{ file.label }}
                                    <img v-if="file.dirty" :src="icons.dotWarning" width="6" height="6" alt="" :title="$t('unsavedChanges')" />
                                </button>
                            </div>

                            <span class="spacer"></span>

                            <template v-if="activeFile === 'yaml'">
                                <span v-if="yamlError" class="state-pill danger"><span class="dot"></span>{{ $t("invalidYaml") }}</span>
                                <span v-else class="state-pill success"><img :src="icons.dotSuccess" width="6" height="6" alt="" />{{ $t("validYaml") }}</span>

                                <button type="button" class="format-btn" :title="$t('formatYaml') + ' (Shift+Alt+F)'" @click="formatYAML">
                                    <AssetIcon :src="icons.format" width="13.3333" height="13.3333" />
                                    {{ $t("formatYaml") }}
                                    <kbd class="shortcut">Shift+Alt+F</kbd>
                                </button>
                            </template>
                        </div>

                        <div class="editor-body" @keydown="onEditorKeydown">
                            <code-mirror
                                v-show="activeFile === 'yaml'"
                                ref="editor"
                                v-model="stack.composeYAML"
                                :extensions="extensions"
                                minimal
                                wrap="true"
                                :dark="$root.isDark"
                                tab="true"
                                :hasFocus="editorFocus"
                                @change="yamlCodeChange"
                            />
                            <code-mirror
                                v-show="activeFile === 'env'"
                                ref="envEditor"
                                v-model="stack.composeENV"
                                :extensions="extensionsEnv"
                                minimal
                                wrap="true"
                                :dark="$root.isDark"
                                tab="true"
                                :hasFocus="editorFocus"
                                @change="yamlCodeChange"
                            />
                        </div>

                        <div class="status-bar">
                            <span>{{ activeFile === "yaml" ? "YAML" : ".env" }}</span>
                            <span>{{ $t("spacesIndent", [ 2 ]) }}</span>
                            <span>UTF-8</span>
                            <span>{{ $t("cursorPosition", [ cursor.line, cursor.col ]) }}</span>
                            <span class="spacer"></span>
                            <span v-if="activeFile === 'yaml' && yamlError" class="validation danger" :title="yamlError">{{ yamlError }}</span>
                            <span v-else class="validation success">
                                <AssetIcon :src="icons.check" width="10.7917" height="7.875" :box="14" />
                                {{ $t("noProblemsFound") }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Combined container logs, docked to the bottom of the page -->
            <ConsoleDock
                v-if="!isAdd && !isEditMode && stack.name"
                :name="combinedTerminalName"
                :endpoint="endpoint"
                :services="Object.keys(jsonConfig.services ?? {})"
                :container-names="containerNames"
                :live="active"
            />

            <!-- Add / edit network drawer -->
            <NetworkDrawer
                :open="networkDrawer.open"
                :network-name="networkDrawer.networkName"
                :json-config="jsonConfig"
                :stack-name="stack.name"
                :endpoint="endpoint"
                :busy="processing && !isEditMode"
                @close="networkDrawer.open = false"
                @submit="applyNetworkDrawer"
                @delete="deleteNetwork"
            />

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
                @delete="deleteContainer"
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
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter, EditorView, Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
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
import ContainerDrawer from "../components/ContainerDrawer.vue";
import NetworkDrawer from "../components/NetworkDrawer.vue";
import AssetIcon from "../components/AssetIcon.vue";
import ConsoleDock from "../components/ConsoleDock.vue";
import iconPlusOnAccent from "../assets/stack/plus-on-accent.svg";
import iconPlus from "../assets/stack/plus.svg";
import iconRestart from "../assets/stack/restart.svg";
import iconUpdate from "../assets/stack/update.svg";
import iconStop from "../assets/stack/stop.svg";
import iconChevronDown from "../assets/stack/chevron-down.svg";
import iconTrash from "../assets/stack/trash.svg";
import iconFile from "../assets/stack/file.svg";
import iconNetwork from "../assets/stack/network.svg";
import iconNetworkExternal from "../assets/stack/network-external.svg";
import iconPen from "../assets/stack/pen.svg";
import iconDotNeutral from "../assets/stack/dot-neutral.svg";
import iconDotAccent from "../assets/stack/dot-accent.svg";
import iconDotSuccess from "../assets/stack/dot-success.svg";
import iconDotWarning from "../assets/stack/dot-warning.svg";
import iconFileTab from "../assets/stack/file-tab.svg";
import iconFormat from "../assets/stack/format.svg";
import iconCheck from "../assets/stack/check.svg";
import iconCubeLarge from "../assets/stack/cube-lg.svg";
import iconPenRow from "../assets/stack/pen-row.svg";
import iconTrashRow from "../assets/stack/trash-row.svg";
import dotenv from "dotenv";
import { ref } from "vue";

// Icons exported from the Figma design
const icons = {
    plusOnAccent: iconPlusOnAccent,
    plus: iconPlus,
    restart: iconRestart,
    update: iconUpdate,
    stop: iconStop,
    chevronDown: iconChevronDown,
    trash: iconTrash,
    file: iconFile,
    network: iconNetwork,
    networkExternal: iconNetworkExternal,
    pen: iconPen,
    dotNeutral: iconDotNeutral,
    dotAccent: iconDotAccent,
    dotSuccess: iconDotSuccess,
    dotWarning: iconDotWarning,
    fileTab: iconFileTab,
    format: iconFormat,
    check: iconCheck,
    cubeLarge: iconCubeLarge,
    penRow: iconPenRow,
    trashRow: iconTrashRow,
};

// Editor syntax colours, styled through these classes in the page CSS
const editorHighlighting = syntaxHighlighting(HighlightStyle.define([
    {
        tag: tags.definition(tags.propertyName),
        class: "tok-key",
    },
    {
        tag: [ tags.comment, tags.lineComment ],
        class: "tok-comment",
    },
    {
        tag: [ tags.labelName, tags.typeName, tags.meta ],
        class: "tok-meta",
    },
]));

// Highlight ${VARIABLE} and $VARIABLE references to the .env file
const variableDecorator = new MatchDecorator({
    regexp: /\$\{[^}\n]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g,
    decoration: Decoration.mark({ class: "tok-var" }),
});
const variableHighlighter = ViewPlugin.define((view) => ({
    decorations: variableDecorator.createDeco(view),
    update(update) {
        this.decorations = variableDecorator.updateDeco(update, this.decorations);
    },
}), {
    decorations: (plugin) => plugin.decorations,
});

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const blankTemplate = "services: {}\n";
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;

export default {
    components: {
        ContainerDrawer,
        NetworkDrawer,
        AssetIcon,
        ConsoleDock,
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

        // Cursor position for the status bar
        const cursor = ref({
            line: 1,
            col: 1,
        });
        const cursorTracker = EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged || update.focusChanged) {
                const head = update.state.selection.main.head;
                const line = update.state.doc.lineAt(head);
                cursor.value = {
                    line: line.number,
                    col: head - line.from + 1,
                };
            }
        });

        const common = [
            lineNumbers(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            editorHighlighting,
            variableHighlighter,
            cursorTracker,
            EditorView.focusChangeEffect.of(focusEffectHandler),
        ];

        const extensions = [ yaml(), ...common ];
        const extensionsEnv = [ python(), ...common ];

        return {
            extensions,
            extensionsEnv,
            editorFocus,
            cursor,
        };
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
            icons,
            activeFile: "yaml",
            startFrom: "template",
            startYAML: "",
            dockerRunCommand: "",
            startFromOptions: [
                {
                    value: "blank",
                    label: "startBlank",
                },
                {
                    value: "template",
                    label: "startTemplate",
                },
                {
                    value: "dockerRun",
                    label: "startDockerRun",
                },
            ],
            savedYAML: "",
            savedENV: "",
            hostNetworkDrivers: {},
            networkDrawer: {
                open: false,
                networkName: "",
            },
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
         * Whether the compose file or .env differ from what was last loaded or saved
         * @returns {boolean} True if there are unsaved changes
         */
        isDirty() {
            return this.isYAMLDirty || this.isENVDirty;
        },

        isYAMLDirty() {
            return (this.stack.composeYAML ?? "") !== this.savedYAML;
        },

        isENVDirty() {
            return (this.stack.composeENV ?? "") !== this.savedENV;
        },

        /**
         * Tabs of the editor card
         * @returns {object[]} Files with their key, label and unsaved state
         */
        editorFiles() {
            return [
                {
                    key: "yaml",
                    label: this.stack.composeFileName || "compose.yaml",
                    dirty: this.isYAMLDirty,
                },
                {
                    key: "env",
                    label: ".env",
                    dirty: this.isENVDirty,
                },
            ];
        },

        /**
         * Custom container names ("container_name"), keyed by service name
         * @returns {object} Container names
         */
        containerNames() {
            const names = {};
            for (const [ serviceName, service ] of Object.entries(this.envsubstJSONConfig.services ?? {})) {
                if (service?.container_name) {
                    names[serviceName] = service.container_name;
                }
            }
            return names;
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
                    driver: config.driver ?? (config.external ? (this.hostNetworkDrivers[config.name ?? name] ?? "") : "bridge"),
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
                // Converted from a docker run command on the home page
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
                this.startFrom = "dockerRun";
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
            // After the editor sync has normalised the YAML
            this.$nextTick(() => {
                this.markSaved();
                this.startYAML = this.stack.composeYAML;
            });

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
        this.loadHostNetworkDrivers();
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
                    this.markSaved();
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
                    this.markSaved();
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
                    this.markSaved();
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
         * Switch to edit mode and show the compose file editor
         * @returns {void}
         */
        editComposeFile() {
            this.activeFile = "yaml";
            this.enableEditMode();
        },

        /**
         * Replace compose.yaml with a starting point (new stacks only).
         * Asks first if the current file was changed by the user.
         * @param {string} option "blank", "template" or "dockerRun"
         * @returns {void}
         */
        applyStartFrom(option) {
            if (option === this.startFrom) {
                return;
            }
            if (option !== "dockerRun" && this.stack.composeYAML !== this.startYAML && !confirm(this.$t("replaceComposeConfirm"))) {
                return;
            }

            this.startFrom = option;
            if (option === "blank") {
                this.setStartYAML(blankTemplate);
            } else if (option === "template") {
                this.setStartYAML(template);
            }
        },

        /**
         * Put a starting compose file in the editor
         * @param {string} yamlText Compose file
         * @returns {void}
         */
        setStartYAML(yamlText) {
            this.stack.composeYAML = yamlText;
            this.yamlCodeChange();
            this.$nextTick(() => {
                this.startYAML = this.stack.composeYAML;
            });
        },

        /**
         * Convert the docker run command to a compose file (done by the backend)
         * @returns {void}
         */
        convertDockerRun() {
            if (this.stack.composeYAML !== this.startYAML && !confirm(this.$t("replaceComposeConfirm"))) {
                return;
            }
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.setStartYAML(res.composeTemplate);
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * First port mapping of a service, for the containers panel
         * @param {object} service Compose service
         * @returns {string} Port mapping, or an empty string
         */
        firstPort(service) {
            const port = service?.ports?.[0];
            if (port === undefined || port === null) {
                return "";
            }
            if (typeof port === "object") {
                return port.published ? `${port.published}:${port.target}` : String(port.target ?? "");
            }
            return String(port);
        },

        /**
         * Remember the current compose file and .env as saved
         * @returns {void}
         */
        markSaved() {
            this.savedYAML = this.stack.composeYAML ?? "";
            this.savedENV = this.stack.composeENV ?? "";
        },

        /**
         * Re-indent the compose file, keeping comments
         * @returns {void}
         */
        formatYAML() {
            const doc = parseDocument(this.stack.composeYAML ?? "");
            if (doc.errors.length > 0) {
                this.$root.toastError(doc.errors[0].message);
                return;
            }
            this.stack.composeYAML = doc.toString({ indent: 2 });
            this.yamlCodeChange();
        },

        /**
         * Editor keyboard shortcuts: Shift+Alt+F formats the compose file
         * @param {KeyboardEvent} event Key event from the editor
         * @returns {void}
         */
        onEditorKeydown(event) {
            if (event.shiftKey && event.altKey && event.code === "KeyF" && this.activeFile === "yaml") {
                event.preventDefault();
                this.formatYAML();
            }
        },

        /**
         * Load the drivers of the networks on the host, to show them for
         * external networks. Older agents without this event are ignored.
         * @returns {void}
         */
        loadHostNetworkDrivers() {
            if (this.isAdd) {
                return;
            }
            this.$root.emitAgent(this.endpoint, "getDockerNetworkDetails", (res) => {
                if (res.ok) {
                    const drivers = {};
                    for (const network of res.dockerNetworkDetails) {
                        drivers[network.name] = network.driver;
                    }
                    this.hostNetworkDrivers = drivers;
                }
            });
        },

        /**
         * Open the network drawer
         * @param {string} [networkName] Network to edit; omit to add one
         * @returns {void}
         */
        openNetworkDrawer(networkName = "") {
            this.networkDrawer.networkName = typeof networkName === "string" ? networkName : "";
            this.networkDrawer.open = true;
        },

        /**
         * Rename a network in every service that uses it
         * @param {string} from Old network name
         * @param {string|null} to New network name, or null to detach it
         * @returns {void}
         */
        renameServiceNetwork(from, to) {
            for (const service of Object.values(this.jsonConfig.services ?? {})) {
                const networks = service?.networks;
                if (Array.isArray(networks)) {
                    const list = networks.filter((name) => name !== from);
                    if (to && list.length !== networks.length && !list.includes(to)) {
                        list.push(to);
                    }
                    if (list.length > 0) {
                        service.networks = list;
                    } else {
                        delete service.networks;
                    }
                } else if (networks && from in networks) {
                    const value = networks[from];
                    delete networks[from];
                    if (to) {
                        networks[to] = value;
                    }
                    if (Object.keys(networks).length === 0) {
                        delete service.networks;
                    }
                }
            }
        },

        /**
         * Deploy right away in view mode; in edit mode the change stays in the editor
         * @returns {void}
         */
        deployIfViewing() {
            if (!this.isEditMode) {
                // Wait for the jsonConfig watcher to regenerate the YAML, then deploy
                this.$nextTick(() => this.deployStack());
            }
        },

        /**
         * Apply the network drawer's result to the compose file
         * @param {object} result Values emitted by the drawer
         * @returns {void}
         */
        applyNetworkDrawer({ originalName, name, config }) {
            const networks = this.jsonConfig.networks ?? {};

            if (originalName && originalName !== name) {
                // Rename while keeping the order
                const renamed = {};
                for (const [ key, value ] of Object.entries(networks)) {
                    if (key === originalName) {
                        renamed[name] = config;
                    } else {
                        renamed[key] = value;
                    }
                }
                if (!(originalName in networks)) {
                    renamed[name] = config;
                }
                this.jsonConfig.networks = renamed;
                this.renameServiceNetwork(originalName, name);
            } else {
                networks[name] = config;
                this.jsonConfig.networks = networks;
            }

            this.networkDrawer.open = false;
            this.deployIfViewing();
        },

        /**
         * Remove a network from the stack and from every service using it
         * @param {string} networkName Network to remove
         * @returns {void}
         */
        deleteNetwork(networkName) {
            const networks = this.jsonConfig.networks ?? {};
            delete networks[networkName];
            if (Object.keys(networks).length === 0) {
                delete this.jsonConfig.networks;
            }
            this.renameServiceNetwork(networkName, null);

            this.networkDrawer.open = false;
            this.deployIfViewing();
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
         * Remove a service from the compose file and from other services'
         * dependencies. In view mode the stack is deployed right away, which
         * removes the container (deploy uses --remove-orphans).
         * @param {string} serviceName Service to remove
         * @returns {void}
         */
        deleteContainer(serviceName) {
            const services = this.jsonConfig.services ?? {};
            if (!(serviceName in services)) {
                return;
            }
            delete services[serviceName];

            for (const other of Object.values(services)) {
                const dependsOn = other?.depends_on;
                if (Array.isArray(dependsOn)) {
                    other.depends_on = dependsOn.filter((dep) => dep !== serviceName);
                    if (other.depends_on.length === 0) {
                        delete other.depends_on;
                    }
                } else if (dependsOn && serviceName in dependsOn) {
                    delete dependsOn[serviceName];
                    if (Object.keys(dependsOn).length === 0) {
                        delete other.depends_on;
                    }
                }
            }

            this.containerDrawer.open = false;

            if (!this.isEditMode) {
                // Wait for the jsonConfig watcher to regenerate the YAML, then deploy
                this.$nextTick(() => this.deployStack());
            }
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

// Header
.stack-page {
    display: flex;
    flex-direction: column;
}

.stack-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 28px;

    h1 {
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.42px;
        margin: 0;
    }

    .meta {
        font-size: 14px;
        color: $muted;
    }
}

// Toolbar
.action-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 28px;
}

.toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    line-height: normal;
}

.action-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background-color: $surface-raised;
    border: 1px solid $surface-border;
    border-radius: 10px;

    .action,
    :deep(.action) {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 14px;
        border: none;
        border-radius: 7px;
        background: transparent;
        font-size: 14px;
        font-weight: 500;
        line-height: normal;
        color: #0f172a;
        text-decoration: none;

        &:hover {
            background-color: #fff;
        }

        &:disabled {
            opacity: 0.5;
        }
    }

    :deep(.action-more) {
        padding: 7px 8px;
    }

    .play-icon {
        width: 16px;
        font-size: 12px;
        color: $text-secondary;
    }
}

.btn-light-outline {
    color: #0f172a;
    background-color: $surface-raised;
    border: 1px solid $border-strong;

    &:hover {
        background-color: darken($surface-raised, 3%);
    }
}

.btn-soft-danger {
    padding-left: 16px;
    padding-right: 16px;
    color: $danger-strong;
    background-color: #fef2f2;
    border: none;

    &:hover {
        color: $danger-strong;
        background-color: #fee2e2;
    }
}

.url-pill {
    font-size: 12px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 999px;
    text-decoration: none;
    color: $primary;
    background-color: $accent-subtle;

    &:hover {
        background-color: #dbeafe;
    }
}

// Sections
.section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;

    .section-title {
        margin-bottom: 0;
    }
}

.section-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
}

.networks-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 32px;
    margin-bottom: 32px;

    .section-head {
        margin-bottom: 0;
    }
}

.network-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.group-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.88px;
    text-transform: uppercase;
    color: $muted;
}

.group-hint {
    font-size: 12px;
    color: $muted;
}

// Network rows
.network-row {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 64px;
    padding: 14px 16px;
    background-color: #fff;
    border: 1px solid $surface-border;
    border-radius: 14px;
}

.network-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background-color: $accent-subtle;

    &.external {
        background-color: $surface-raised;
    }
}

.network-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.network-name {
    font-size: 14px;
    font-weight: 600;
}

.network-used {
    font-size: 13px;
    color: $muted;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tags {
    display: flex;
    align-items: center;
    gap: 6px;
}

.tag-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: normal;
    color: $muted;
    background-color: $surface-raised;

    &.tag-blue {
        color: $primary;
        background-color: $accent-subtle;
    }
}

.icon-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background-color: $surface-raised;

    &:hover {
        background-color: darken($surface-raised, 4%);
    }
}

// State badges (Editing, Unsaved changes, Valid YAML)
.state-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: normal;
    white-space: nowrap;

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: currentColor;
    }

    &.accent {
        color: $primary;
        background-color: $accent-subtle;
    }

    &.warning {
        color: #b45309;
        background-color: #fef3c7;
    }

    &.success {
        color: $success;
        background-color: #dcfce7;
    }

    &.danger {
        color: $danger-strong;
        background-color: #fef2f2;
    }
}

// Save + "save without deploying" menu
.save-group {
    display: inline-flex;

    .save-main {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }

    :deep(.save-toggle) {
        height: 100%;
        padding: 11px 12px;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-left: 1px solid rgba(255, 255, 255, 0.35);
        font-size: 12px;
    }
}

// Editor card
.editor-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #fff;
    border: 1px solid $surface-border;
    border-radius: 16px;
}

.editor-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px 12px 20px;
    border-bottom: 1px solid $surface-border;
}

.file-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
}

.file-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    margin-left: -8px;
    border: none;
    border-radius: 8px;
    background: none;
    font-size: 14px;
    font-weight: 500;
    color: $muted;

    & + .file-tab {
        margin-left: 4px;
    }

    &:hover {
        background-color: #f8fafc;
    }

    &.active {
        color: #0f172a;
    }
}

.spacer {
    flex: 1;
}

.format-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
    background-color: $accent-subtle;

    &:hover {
        background-color: #dbeafe;
    }

    .shortcut {
        padding: 2px 6px;
        border-radius: 5px;
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        color: $text-secondary;
        background-color: #fff;
        box-shadow: none;
    }
}

.editor-body {
    height: calc(100vh - 380px);
    min-height: 320px;
    overflow: hidden;

    :deep(.vue-codemirror),
    :deep(.cm-editor) {
        height: 100%;
    }

    :deep(.cm-editor) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: #0f172a;
        background-color: #fff !important;

        &.cm-focused {
            outline: none;
        }
    }

    :deep(.cm-scroller) {
        font-family: inherit;
        line-height: 22px;
    }

    :deep(.cm-content) {
        padding: 16px 0;
        caret-color: #0f172a;
    }

    :deep(.cm-line) {
        padding: 0 20px;
    }

    :deep(.cm-gutters) {
        min-height: 100%;
        padding: 0 14px 0 16px;
        color: $muted;
        background-color: #f8fafc;
        border-right: 1px solid $surface-border;
    }

    :deep(.cm-gutter.cm-lineNumbers .cm-gutterElement) {
        padding: 0;
    }

    :deep(.cm-gutters .cm-gutterElement:first-child) {
        margin-top: 16px;
    }

    :deep(.cm-activeLine) {
        background-color: rgba($accent-subtle, 0.7) !important;
    }

    :deep(.cm-activeLineGutter) {
        background-color: transparent;
        color: #0f172a;
    }

    :deep(.cm-cursor) {
        border-left: 2px solid #0f172a;
    }

    :deep(.tok-key) {
        color: $primary;
    }

    :deep(.tok-var) {
        color: #b45309;
    }

    :deep(.tok-comment) {
        color: $muted;
        font-style: italic;
    }

    :deep(.tok-meta) {
        color: #7c3aed;
    }
}

.status-bar {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 20px;
    font-size: 12px;
    color: $muted;
    background-color: #f8fafc;
    border-top: 1px solid $surface-border;

    .validation {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &.success {
            color: $success;
        }

        &.danger {
            color: $danger-strong;
        }
    }
}

// New stack: setup row
.setup-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px 32px;
    margin-bottom: 28px;
}

.setup-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.stack-name-field {
    width: 420px;
    max-width: 100%;
}

.field-label {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
}

.field-hint {
    font-size: 12px;
    color: $muted;
    margin: 0;
}

.setup-input {
    height: 44px;
    padding: 11px 14px;
    font-size: 14px;
    border-color: $border-strong;
    border-radius: 10px;

    &::placeholder {
        color: $muted;
    }
}

.choice-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.choice-chip {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    line-height: normal;
    color: $text-secondary;
    background-color: #fff;
    border: 1px solid $border-strong;
    border-radius: 999px;

    &:hover {
        background-color: #f8fafc;
    }

    &.selected {
        color: $primary;
        background-color: $accent-subtle;
        border-color: $primary;
    }
}

.docker-run-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin: -12px 0 28px;

    .docker-run-input {
        flex: 1;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        border-color: $border-strong;
        border-radius: 10px;
        resize: vertical;
    }
}

// Containers panel next to the editor
.edit-content.with-panel {
    display: grid;
    grid-template-columns: 440px minmax(0, 1fr);
    gap: 24px;
    align-items: start;

    @media (max-width: 1200px) {
        grid-template-columns: minmax(0, 1fr);
    }

    .editor-body {
        height: calc(100vh - 470px);
    }
}

.containers-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .section-head {
        margin-bottom: 0;
    }

    .section-title {
        margin-bottom: 2px;
    }
}

.service-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.service-row {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 64px;
    padding: 12px 14px;
    background-color: #fff;
    border: 1px solid $surface-border;
    border-radius: 14px;
}

.service-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background-color: $accent-subtle;
}

.service-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.service-name {
    font-size: 15px;
    font-weight: 600;
}

.service-image {
    font-size: 13px;
    color: $muted;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.row-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background-color: $surface-raised;

    &:hover {
        background-color: darken($surface-raised, 4%);
    }

    &.danger {
        background-color: #fef2f2;

        &:hover {
            background-color: #fee2e2;
        }
    }
}

// Dark theme
.dark {
    .choice-chip {
        color: $dark-font-color;
        background-color: $dark-bg;
        border-color: #343c4d;

        &.selected {
            color: $highlight;
            background-color: rgba($primary, 0.2);
            border-color: $highlight;
        }
    }

    .service-row {
        background-color: $dark-bg;
        border-color: $dark-border-color;
    }

    .service-icon {
        background-color: rgba($primary, 0.2);
    }

    .row-btn {
        background-color: $dark-header-bg;

        &.danger {
            background-color: #2d1618;
        }
    }

    .state-pill {
        &.accent {
            color: $highlight;
            background-color: rgba($primary, 0.2);
        }

        &.warning {
            color: #f5a524;
            background-color: #2c2110;
        }

        &.success {
            color: #4ade80;
            background-color: #0f2619;
        }

        &.danger {
            color: #f87171;
            background-color: #2d1618;
        }
    }

    .editor-card {
        background-color: $dark-bg;
        border-color: $dark-border-color;
    }

    .editor-header {
        border-bottom-color: $dark-border-color;
    }

    .file-tab {
        color: $dark-font-color3;

        &:hover {
            background-color: $dark-header-bg;
        }

        &.active {
            color: #f1f5f9;
        }
    }

    .format-btn {
        color: $highlight;
        background-color: rgba($primary, 0.2);

        .shortcut {
            color: $dark-font-color;
            background-color: $dark-bg;
        }
    }

    .editor-body {
        :deep(.cm-editor) {
            color: #f1f5f9;
            background-color: $dark-bg !important;
        }

        :deep(.cm-content) {
            caret-color: #f1f5f9;
        }

        :deep(.cm-gutters) {
            background-color: #0d1016;
            border-right-color: $dark-border-color;
        }

        :deep(.cm-activeLine) {
            background-color: rgba($primary, 0.12) !important;
        }

        :deep(.cm-activeLineGutter) {
            color: #f1f5f9;
        }

        :deep(.cm-cursor) {
            border-left-color: #f1f5f9;
        }

        :deep(.tok-key) {
            color: $highlight;
        }

        :deep(.tok-var) {
            color: #f5a524;
        }
    }

    .status-bar {
        background-color: #0d1016;
        border-top-color: $dark-border-color;
    }

    .action-group {
        background-color: $dark-header-bg;
        border-color: $dark-border-color;
    }

    .action-group .action,
    .action-group :deep(.action) {
        color: $dark-font-color;

        &:hover {
            background-color: $dark-bg;
        }
    }

    .btn-light-outline,
    .icon-btn {
        color: $dark-font-color;
        background-color: $dark-header-bg;
        border-color: #343c4d;
    }

    .btn-light-outline:hover,
    .icon-btn:hover {
        background-color: $dark-bg2;
    }

    .btn-soft-danger {
        color: #f87171;
        background-color: #2d1618;
    }

    .network-row {
        background-color: $dark-bg;
        border-color: $dark-border-color;
    }

    .network-icon {
        background-color: rgba($primary, 0.2);

        &.external {
            background-color: $dark-header-bg;
        }
    }

    .tag-pill {
        color: $dark-font-color;
        background-color: $dark-header-bg;
    }

    .tag-blue {
        color: $highlight;
        background-color: rgba($primary, 0.2);
    }
}
</style>
