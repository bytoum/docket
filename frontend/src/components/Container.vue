<template>
    <div class="container-card">
        <div class="card-top">
            <div class="identity">
                <div class="name">{{ name }}</div>
                <div v-if="envsubstService.image" class="image"><span class="image-name">{{ imageName }}:</span>{{ imageTag }}</div>
            </div>

            <div class="function">
                <template v-if="!isEditMode">
                    <div v-if="hasServiceActions" class="service-actions" role="group">
                        <router-link v-if="isRunning" class="action" :to="terminalRouteLink">
                            <AssetIcon :src="icons.terminal" width="9.97917" height="8.89583" :box="13" tone="neutral" />
                            Bash
                        </router-link>
                        <button
                            v-if="serviceCount > 1 && !isRunning"
                            class="action"
                            :disabled="processing"
                            @click="startService"
                        >
                            <font-awesome-icon icon="play" class="play-icon" />
                            {{ $t("startStack") }}
                        </button>
                        <button
                            v-if="serviceCount > 1 && (isRunning || status === 'unhealthy')"
                            class="action"
                            :disabled="processing"
                            @click="restartService"
                        >
                            <AssetIcon :src="icons.restart" width="11.0625" height="11.0625" :box="13" tone="neutral" />
                            {{ $t("restartStack") }}
                        </button>
                        <button
                            v-if="serviceCount > 1 && (isRunning || status === 'unhealthy')"
                            class="action"
                            :disabled="processing"
                            @click="stopService"
                        >
                            <AssetIcon :src="icons.stop" width="8.89583" height="8.89583" :box="13" tone="neutral" />
                            {{ $t("stopStack") }}
                        </button>
                    </div>
                    <button class="icon-btn" :title="$t('Edit')" @click="editService">
                        <AssetIcon :src="icons.pen" width="13.0569" height="13.0569" :box="14" tone="neutral" />
                    </button>
                </template>

                <template v-else>
                    <button class="btn btn-sm btn-normal" @click="editService">
                        <font-awesome-icon icon="edit" class="me-1" />
                        {{ $t("Edit") }}
                    </button>
                    <button class="btn btn-sm btn-danger" @click="remove">
                        <font-awesome-icon icon="trash" class="me-1" />
                        {{ $t("deleteContainer") }}
                    </button>
                </template>
            </div>
        </div>

        <div v-if="!isEditMode" class="card-bottom">
            <div class="pills">
                <span class="pill" :class="statusClass">
                    <img v-if="isRunning" :src="icons.dotSuccess" width="6" height="6" alt="" />
                    <img v-else-if="status !== 'unhealthy'" :src="icons.dotNeutral" width="6" height="6" alt="" />
                    <span v-else class="dot"></span>
                    {{ status }}
                </span>
                <a v-for="port in (ports ?? envsubstService.ports)" :key="port" :href="parsePort(port).url" target="_blank" class="pill pill-port">
                    <img :src="icons.dotNeutral" width="6" height="6" alt="" />{{ parsePort(port).display }}
                </a>
            </div>

            <div v-if="statsInstances.length > 0" class="metrics">
                <div class="metric">
                    <div class="metric-label">{{ $t("CPU") }}</div>
                    <div class="metric-value">{{ statsInstances[0].CPUPerc }}</div>
                </div>
                <div class="metric metric-memory">
                    <div class="metric-label">{{ $t("memory") }}</div>
                    <div class="metric-value">{{ statsInstances[0].MemUsage }}</div>
                    <div class="bar"><span :style="{ width: memoryPercent }"></span></div>
                </div>
                <button v-if="statsInstances.length > 1" class="icon-btn" @click="expandedStats = !expandedStats">
                    <font-awesome-icon :icon="expandedStats ? 'chevron-up' : 'chevron-down'" />
                </button>
            </div>
        </div>

        <transition name="slide-fade" appear>
            <div v-if="!isEditMode && expandedStats" class="d-flex flex-column gap-3 mt-3">
                <DockerStat
                    v-for="stat in statsInstances"
                    :key="stat.Name"
                    :stat="stat"
                />
            </div>
        </transition>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort } from "../../../common/util-common";
import DockerStat from "./DockerStat.vue";
import AssetIcon from "./AssetIcon.vue";
import iconTerminal from "../assets/stack/terminal-sm.svg";
import iconRestart from "../assets/stack/restart-sm.svg";
import iconStop from "../assets/stack/stop-sm.svg";
import iconPen from "../assets/stack/pen-sm.svg";
import iconDotSuccess from "../assets/stack/dot-success.svg";
import iconDotNeutral from "../assets/stack/dot-neutral.svg";

// Icons exported from the Figma design
const icons = {
    terminal: iconTerminal,
    restart: iconRestart,
    stop: iconStop,
    pen: iconPen,
    dotSuccess: iconDotSuccess,
    dotNeutral: iconDotNeutral,
};

export default defineComponent({
    components: {
        FontAwesomeIcon,
        DockerStat,
        AssetIcon,
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
        first: {
            type: Boolean,
            default: false,
        },
        serviceStatus: {
            type: Object,
            default: null,
        },
        dockerStats: {
            type: Object,
            default: null
        }
    },
    emits: [
        "start-service",
        "stop-service",
        "restart-service",
        "edit-service",
    ],
    data() {
        return {
            icons,
            expandedStats: false,
        };
    },
    computed: {

        isRunning() {
            return this.status === "running" || this.status === "healthy";
        },

        statusClass() {
            if (this.isRunning) {
                return "pill-running";
            } else if (this.status === "unhealthy") {
                return "pill-danger";
            } else {
                return "";
            }
        },

        /**
         * Whether the service action button group has any button to show
         * @returns {boolean} True if at least one action is available
         */
        hasServiceActions() {
            return this.isRunning || this.serviceCount > 1;
        },

        /**
         * Memory usage of the first instance as a CSS width
         * @returns {string} Percentage, e.g. "3.2%"
         */
        memoryPercent() {
            const percent = parseFloat(this.statsInstances[0]?.MemPerc);
            if (isNaN(percent)) {
                return "0%";
            }
            return Math.min(Math.max(percent, 0), 100) + "%";
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        stackName() {
            return this.$parent.$parent.stack.name;
        },

        service() {
            if (!this.jsonObject.services[this.name]) {
                return {};
            }
            return this.jsonObject.services[this.name];
        },

        serviceCount() {
            return Object.keys(this.jsonObject.services).length;
        },

        jsonObject() {
            return this.$parent.$parent.jsonConfig;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageName() {
            if (this.envsubstService.image) {
                return this.envsubstService.image.split(":")[0];
            } else {
                return "";
            }
        },

        imageTag() {
            if (this.envsubstService.image) {
                let tag = this.envsubstService.image.split(":")[1];

                if (tag) {
                    return tag;
                } else {
                    return "latest";
                }
            } else {
                return "";
            }
        },
        statsInstances() {
            if (!this.serviceStatus) {
                return [];
            }

            return this.serviceStatus
                .map(s => this.dockerStats[s.name])
                .filter(s => !!s)
                .sort((a, b) => a.Name.localeCompare(b.Name));
        },
        status() {
            if (!this.serviceStatus) {
                return "N/A";
            }
            return this.serviceStatus[0].status;
        }
    },
    mounted() {
        if (this.first) {
            //this.showConfig = true;
        }
    },
    methods: {
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        remove() {
            delete this.jsonObject.services[this.name];
        },
        startService() {
            this.$emit("start-service", this.name);
        },
        stopService() {
            this.$emit("stop-service", this.name);
        },
        restartService() {
            this.$emit("restart-service", this.name);
        },
        /**
         * Open this container's settings in the edit drawer
         * @returns {void}
         */
        editService() {
            this.$emit("edit-service", this.name);
        },

    }
});
</script>

<style scoped lang="scss">
@import "../styles/vars";

.container-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
    padding: 14px 16px;
    background-color: #fff;
    border: 1px solid $surface-border;
    border-radius: 14px;
}

.card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.identity {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;

    .name {
        font-size: 16px;
        font-weight: 600;
    }

    .image {
        font-size: 12px;
        color: $muted;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        .image-name {
            color: $text-secondary;
        }
    }
}

.function {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
}

.service-actions {
    display: inline-flex;
    padding: 3px;
    border-radius: 8px;
    background-color: $surface-raised;

    .action {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        border: none;
        border-radius: 6px;
        background: transparent;
        font-size: 12px;
        font-weight: 500;
        line-height: normal;
        color: $text-secondary;
        text-decoration: none;

        &:hover {
            background-color: #fff;
        }
    }

    .play-icon {
        width: 13px;
        font-size: 10px;
    }
}

.icon-btn {
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
}

.card-bottom {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 24px;
}

.pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    line-height: normal;
    text-decoration: none;
    text-transform: capitalize;
    color: $muted;
    background-color: $surface-raised;

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: currentColor;
    }

    &.pill-running {
        color: $success;
        background-color: #dcfce7;
    }

    &.pill-danger {
        color: $danger-strong;
        background-color: #fef2f2;
    }

    &.pill-port:hover {
        background-color: darken($surface-raised, 4%);
    }
}

.metrics {
    display: flex;
    align-items: center;
    gap: 24px;
}

.metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.metric-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: $muted;
}

.metric-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #0f172a;
}

.metric-memory .bar {
    width: 130px;
    height: 4px;
    border-radius: 2px;
    background-color: $surface-border;
    overflow: hidden;

    span {
        display: block;
        height: 100%;
        background-color: $primary;
    }
}

.dark {
    .container-card {
        background-color: $dark-bg;
        border-color: $dark-border-color;
    }

    .service-actions,
    .icon-btn {
        background-color: $dark-header-bg;
    }

    .service-actions .action {
        color: $dark-font-color;

        &:hover {
            background-color: $dark-bg2;
        }
    }

    .icon-btn:hover {
        background-color: $dark-bg2;
    }

    .identity .image .image-name,
    .metric-value {
        color: $dark-font-color;
    }

    .pill {
        color: $dark-font-color;
        background-color: $dark-header-bg;
    }

    .pill-running {
        color: #4ade80;
        background-color: #0f2619;
    }

    .metric-memory .bar {
        background-color: $dark-border-color;
    }
}
</style>
