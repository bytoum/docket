<template>
    <div class="dashboard">
        <aside v-if="!$root.isMobile" class="sidebar">
            <router-link to="/compose" class="btn btn-primary compose-btn"><AssetIcon :src="iconPlus" width="10.8333" height="10.8333" /> {{ $t("compose") }}</router-link>
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
import AssetIcon from "../components/AssetIcon.vue";
import iconPlus from "../assets/stack/plus-on-accent.svg";

export default {
    components: {
        StackList,
        AssetIcon,
    },
    data() {
        return {
            height: 0,
            iconPlus,
        };
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

$header-height: 64px;
$sidebar-width: 320px;

.dashboard {
    display: flex;
    align-items: flex-start;
}

.sidebar {
    flex: 0 0 $sidebar-width;
    width: $sidebar-width;
    height: calc(100vh - #{$header-height} - var(--console-dock-height, 0px));
    position: sticky;
    top: $header-height;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background-color: $bg-surface;
    border-right: 1px solid $surface-border;

    .dark & {
        background-color: $dark-header-bg;
        border-right-color: $dark-border-color;
    }
}

.compose-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
}

.content {
    flex: 1;
    min-width: 0;
    padding: 32px 32px calc(32px + var(--console-dock-height, 0px));

    .mobile & {
        padding: 16px;
    }
}
</style>
