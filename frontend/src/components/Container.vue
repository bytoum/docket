<template>
    <div class="shadow-box mb-3 container-card">
        <div class="card-top">
            <div class="identity">
                <div class="name">{{ name }}</div>
                <div v-if="envsubstService.image" class="image">{{ imageName }}:{{ imageTag }}</div>
            </div>

            <div class="function">
                <template v-if="!isEditMode">
                    <div v-if="hasServiceActions" class="btn-group service-actions" role="group">
                        <router-link v-if="isRunning" class="btn" :to="terminalRouteLink">
                            <font-awesome-icon icon="terminal" class="me-1" />
                            Bash
                        </router-link>
                        <button
                            v-if="serviceCount > 1 && !isRunning"
                            class="btn"
                            :disabled="processing"
                            @click="startService"
                        >
                            <font-awesome-icon icon="play" class="me-1" />
                            {{ $t("startStack") }}
                        </button>
                        <button
                            v-if="serviceCount > 1 && (isRunning || status === 'unhealthy')"
                            class="btn"
                            :disabled="processing"
                            @click="restartService"
                        >
                            <font-awesome-icon icon="rotate" class="me-1" />
                            {{ $t("restartStack") }}
                        </button>
                        <button
                            v-if="serviceCount > 1 && (isRunning || status === 'unhealthy')"
                            class="btn"
                            :disabled="processing"
                            @click="stopService"
                        >
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("stopStack") }}
                        </button>
                    </div>
                    <button class="icon-btn" :title="$t('Edit')" @click="editService">
                        <font-awesome-icon icon="pen" />
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
                <span class="pill" :class="statusClass"><span class="dot"></span>{{ status }}</span>
                <a v-for="port in (ports ?? envsubstService.ports)" :key="port" :href="parsePort(port).url" target="_blank" class="pill pill-port">
                    <span class="dot"></span>{{ parsePort(port).display }}
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

export default defineComponent({
    components: {
        FontAwesomeIcon,
        DockerStat
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
    padding: 16px 18px;
}

.card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.identity {
    min-width: 0;

    .name {
        font-size: 15px;
        font-weight: 600;
    }

    .image {
        font-size: 12px;
        color: $muted;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.function {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
}

.service-actions {
    border: 1px solid $surface-border;
    border-radius: 8px;
    background-color: #f9fafb;

    .btn {
        font-size: 12px;
        padding: 3px 10px;
        border: none;
        color: #374151;

        &:hover {
            background-color: #eef0f3;
        }
    }
}

.icon-btn {
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

.card-bottom {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 16px 28px;
    margin-top: 12px;
}

.pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 50rem;
    font-size: 11px;
    font-weight: 500;
    text-decoration: none;
    text-transform: capitalize;
    color: #4b5563;
    background-color: rgba($muted, 0.12);

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: currentColor;
    }

    &.pill-running {
        color: #198754;
        background-color: rgba(#198754, 0.12);
    }

    &.pill-danger {
        color: $danger;
        background-color: rgba($danger, 0.12);
    }

    &.pill-port:hover {
        background-color: rgba($muted, 0.2);
    }
}

.metrics {
    display: flex;
    align-items: flex-end;
    gap: 28px;
}

.metric-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $muted;
}

.metric-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
}

.metric-memory {
    min-width: 160px;

    .bar {
        height: 4px;
        margin-top: 4px;
        border-radius: 2px;
        background-color: #eef0f3;
        overflow: hidden;

        span {
            display: block;
            height: 100%;
            background-color: $primary;
        }
    }
}

.dark {
    .service-actions,
    .icon-btn {
        background-color: $dark-bg2;
        border-color: $dark-border-color;
        color: $dark-font-color;
    }

    .service-actions .btn {
        color: $dark-font-color;
    }

    .service-actions .btn:hover,
    .icon-btn:hover {
        background-color: $dark-header-bg;
    }

    .pill {
        color: $dark-font-color;
    }

    .pill-running {
        color: #4ade80;
    }

    .metric-memory .bar {
        background-color: $dark-border-color;
    }
}
</style>
