<template>
    <div class="dashboard">
        <aside v-if="!$root.isMobile" class="sidebar">
            <router-link to="/compose" class="btn btn-primary w-100 mb-3"><font-awesome-icon icon="plus" class="me-1" /> {{ $t("compose") }}</router-link>
            <StackList :scrollbar="true" />
        </aside>

        <div ref="container" class="content">
            <!-- Add :key to disable vue router re-use the same component -->
            <router-view :key="$route.fullPath" :calculatedHeight="height" />
        </div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0
        };
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

$header-height: 60px;
$sidebar-width: 270px;

.dashboard {
    display: flex;
    align-items: flex-start;
}

.sidebar {
    flex: 0 0 $sidebar-width;
    width: $sidebar-width;
    height: calc(100vh - #{$header-height});
    position: sticky;
    top: $header-height;
    display: flex;
    flex-direction: column;
    padding: 16px;
    background-color: #fff;
    border-right: 1px solid $surface-border;

    .dark & {
        background-color: $dark-header-bg;
        border-right-color: $dark-border-color;
    }
}

.content {
    flex: 1;
    min-width: 0;
    padding: 28px 32px 32px;

    .mobile & {
        padding: 16px;
    }
}
</style>
