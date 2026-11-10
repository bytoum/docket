<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'" class="home">
            <header class="mb-4">
                <h1 class="mb-1">{{ $t("home") }}</h1>
                <p class="subtitle mb-0">{{ $t("homeSubtitle") }}</p>
            </header>

            <div class="row g-4">
                <!-- Left -->
                <div class="col-lg-7 col-xl-8">
                    <!-- Stats -->
                    <div class="row g-3 mb-4">
                        <div v-for="stat in stats" :key="stat.key" class="col-sm-4">
                            <div class="card-box stat-card h-100">
                                <div class="stat-label">
                                    <span class="stat-icon" :class="stat.key">
                                        <font-awesome-icon :icon="stat.icon" />
                                    </span>
                                    {{ $t(stat.key) }}
                                </div>
                                <div class="stat-num">{{ stat.num }}</div>
                                <div class="stat-caption">{{ $t(stat.caption) }}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Docker Run -->
                    <section class="card-box">
                        <h2 class="card-title">{{ $t("Docker Run") }}</h2>
                        <p class="card-desc">{{ $t("dockerRunDescription") }}</p>
                        <textarea v-model="dockerRunCommand" class="form-control docker-run mb-3" rows="4" spellcheck="false" :placeholder="'docker run -d --name my-app -p 8080:80 nginx:latest'"></textarea>
                        <button class="btn btn-primary" :disabled="!dockerRunCommand.trim()" @click="convertDockerRun">
                            {{ $t("Convert to Compose") }}
                            <font-awesome-icon icon="arrow-right" class="ms-1" />
                        </button>
                    </section>
                </div>

                <!-- Right -->
                <div class="col-lg-5 col-xl-4">
                    <!-- Agent List -->
                    <section class="card-box">
                        <h2 class="card-title">
                            {{ $tc("dockgeAgent", 2) }}
                            <span class="pill pill-beta ms-1"><span class="dot"></span>beta</span>
                        </h2>
                        <p class="card-desc">{{ $t("agentsDescription") }}</p>

                        <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="agent">
                            <span class="agent-icon"><font-awesome-icon icon="server" /></span>

                            <div class="agent-body">
                                <div class="agent-name">
                                    <template v-if="endpoint === '' && agentItem.name === ''">{{ $t("thisInstance") }}</template>
                                    <template v-else-if="agentItem.name === ''">{{ endpoint }}</template>
                                    <template v-else>{{ agentItem.name }}</template>
                                </div>
                                <div class="agent-host">{{ endpoint === '' ? currentHost : endpoint }}</div>

                                <div class="mt-2">
                                    <template v-if="$root.agentStatusList[endpoint]">
                                        <span v-if="$root.agentStatusList[endpoint] === 'online'" class="pill pill-online me-1"><span class="dot"></span>{{ $t("agentOnline") }}</span>
                                        <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="pill pill-offline me-1"><span class="dot"></span>{{ $t("agentOffline") }}</span>
                                        <span v-else class="pill me-1"><span class="dot"></span>{{ $t($root.agentStatusList[endpoint]) }}</span>
                                    </template>
                                    <span v-if="endpoint === ''" class="pill"><span class="dot"></span>{{ $t("currentEndpoint") }}</span>
                                </div>
                            </div>

                            <div class="agent-actions">
                                <!-- Edit Name -->
                                <button v-if="agentItem.name !== ''" class="icon-btn" :title="$t('Update Name')" @click="showEditAgentNameDialog[agentItem.name] = true">
                                    <font-awesome-icon icon="pen-to-square" />
                                </button>
                                <!-- Remove -->
                                <button v-if="endpoint !== ''" class="icon-btn danger" :title="$t('removeAgent')" @click="showRemoveAgentDialog[agentItem.url] = true">
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </div>

                            <!-- Edit Dialog -->
                            <BModal v-model="showEditAgentNameDialog[agentItem.name]" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('Update Name')" okVariant="info" @ok="updateName(agentItem.url, agentItem.updatedName)">
                                <label for="updatedName" class="form-label">Current value: {{ $t(agentItem.name) }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="form-control" optional>
                            </BModal>

                            <!-- Remove Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agentItem.url]" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agentItem.url)">
                                <p>{{ agentItem.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </div>

                        <button v-if="!showAgentForm" class="btn btn-normal w-100 mt-1" @click="showAgentForm = true">
                            <font-awesome-icon icon="plus" class="me-1" />
                            {{ $t("addAgent") }}
                        </button>

                        <!-- Add Agent Form -->
                        <form v-if="showAgentForm" class="mt-3" @submit.prevent="addAgent">
                            <div class="mb-3">
                                <label for="url" class="form-label">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="agent.url" type="url" class="form-control" required placeholder="http://">
                            </div>

                            <div class="mb-3">
                                <label for="username" class="form-label">{{ $t("Username") }}</label>
                                <input id="username" v-model="agent.username" type="text" class="form-control" required>
                            </div>

                            <div class="mb-3">
                                <label for="password" class="form-label">{{ $t("Password") }}</label>
                                <input id="password" v-model="agent.password" type="password" class="form-control" required autocomplete="new-password">
                            </div>

                            <div class="mb-3">
                                <label for="name" class="form-label">{{ $t("Friendly Name") }}</label>
                                <input id="name" v-model="agent.name" type="text" class="form-control" optional>
                            </div>

                            <div class="d-flex gap-2">
                                <button type="submit" class="btn btn-primary" :disabled="connectingAgent">
                                    <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                                    <template v-else>{{ $t("connect") }}</template>
                                </button>
                                <button type="button" class="btn btn-normal" @click="showAgentForm = false">{{ $t("cancel") }}</button>
                            </div>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import { statusNameShort } from "../../../common/util-common";

export default {
    components: {

    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            dockerRunCommand: "",
            showAgentForm: false,
            showRemoveAgentDialog: {},
            showEditAgentNameDialog: {},
            connectingAgent: false,
            agent: {
                url: "http://",
                username: "",
                password: "",
                name: "",
                updatedName: "",
            }
        };
    },

    computed: {
        activeNum() {
            return this.getStatusNum("active");
        },
        inactiveNum() {
            return this.getStatusNum("inactive");
        },
        exitedNum() {
            return this.getStatusNum("exited");
        },

        /**
         * Data for the three stat cards
         * @returns {object[]} One entry per stack status
         */
        stats() {
            return [
                { key: "active",
                    icon: "heartbeat",
                    num: this.activeNum,
                    caption: "stacksRunning" },
                { key: "exited",
                    icon: "times-circle",
                    num: this.exitedNum,
                    caption: "stacksStopped" },
                { key: "inactive",
                    icon: "stop",
                    num: this.inactiveNum,
                    caption: "stacksNotStarted" },
            ];
        },

        /**
         * Hostname of the Docket instance this page was loaded from
         * @returns {string} Hostname
         */
        currentHost() {
            return location.hostname;
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {

        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.agent, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                    };
                }

                this.connectingAgent = false;
            });
        },

        removeAgent(url) {
            this.$root.getSocket().emit("removeAgent", url, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    let urlObj = new URL(url);
                    let endpoint = urlObj.host;

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },

        updateName(url, updatedName) {
            this.$root.getSocket().emit("updateAgent", url, updatedName, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        updatedName: "",
                    };
                }
            });
        },

        getStatusNum(statusName) {
            let num = 0;

            for (let stackName in this.$root.completeStackList) {
                const stack = this.$root.completeStackList[stackName];
                if (statusNameShort(stack.status) === statusName) {
                    num += 1;
                }
            }
            return num;
        },

        convertDockerRun() {
            if (this.dockerRunCommand.trim() === "docker run") {
                throw new Error("Please enter a docker run command");
            }

            // composerize is working in dev, but after "vite build", it is not working
            // So pass to backend to do the conversion
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars";

$card-border: #e7eaf0;
$muted: #6b7280;

.home {
    h1 {
        font-size: 1.75rem;
        font-weight: 700;
    }
}

.subtitle,
.card-desc,
.stat-caption,
.agent-host {
    color: $muted;
}

.subtitle {
    font-size: 14px;
}

.card-box {
    background: $bg-surface;
    border: 1px solid $card-border;
    border-radius: 12px;
    padding: 20px;
}

.card-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
}

.card-desc {
    font-size: 13px;
    margin-bottom: 16px;
}

// Stats
.stat-label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    text-transform: capitalize;
}

.stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    font-size: 13px;

    &.active {
        color: $primary;
        background: rgba($primary, 0.15);
    }

    &.exited {
        color: $danger;
        background: rgba($danger, 0.12);
    }

    &.inactive {
        color: $muted;
        background: rgba($muted, 0.12);
    }
}

.stat-num {
    font-size: 34px;
    font-weight: 700;
    line-height: 1;
    margin: 18px 0 8px;
}

.stat-caption {
    font-size: 13px;
}

// Docker Run
.docker-run {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    background: #f7f8fa;
    border: 1px solid $card-border;
    border-radius: 8px;
    resize: vertical;
    min-height: 110px;
}

// Pills
.pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 50rem;
    font-size: 11px;
    font-weight: 500;
    color: $status-neutral;
    background: $status-neutral-subtle;

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
    }
}

.pill-beta {
    color: $status-warning;
    background: $status-warning-subtle;
}

.pill-online {
    color: $status-success;
    background: $status-success-subtle;
}

.pill-offline {
    color: $status-danger;
    background: $status-danger-subtle;
}

// Agents
.agent {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid $card-border;
    border-radius: 10px;
}

.agent-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    color: $muted;
    background: rgba($muted, 0.1);
}

.agent-body {
    flex: 1;
    min-width: 0;
}

.agent-name {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.agent-host {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.agent-actions {
    display: flex;
    gap: 2px;
}

.icon-btn {
    border: none;
    background: none;
    padding: 4px 6px;
    border-radius: 6px;
    color: $muted;
    font-size: 13px;

    &:hover {
        background: rgba($muted, 0.12);
    }

    &.danger:hover {
        color: $danger;
    }
}

// Dark theme
.dark {
    .card-box,
    .agent {
        border-color: $dark-border-color;
    }

    .card-box {
        background: $dark-bg;
    }

    .subtitle,
    .card-desc,
    .stat-caption,
    .agent-host {
        color: $dark-font-color3;
    }

    .docker-run {
        background: $dark-bg2;
        border-color: $dark-border-color;
        color: $dark-font-color;
    }

    .pill-beta {
        color: $warning;
    }
}
</style>
