<template>
    <span :class="className">{{ statusName }}</span>
</template>

<script>
import { statusColor, statusNameShort } from "../../../common/util-common";

export default {
    props: {
        stack: {
            type: Object,
            default: null,
        },
        fixedWidth: {
            type: Boolean,
            default: false,
        },
    },

    computed: {
        uptime() {
            return this.$t("notAvailableShort");
        },

        color() {
            return statusColor(this.stack?.status);
        },

        statusName() {
            return this.$t(statusNameShort(this.stack?.status));
        },

        className() {
            let className = `status-pill status-${this.color}`;

            if (this.fixedWidth) {
                className += " fixed-width";
            }
            return className;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: normal;
    text-transform: capitalize;
    white-space: nowrap;
    color: $status-neutral;
    background-color: $status-neutral-subtle;

    &::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: currentColor;
    }
}

// Running
.status-primary {
    color: $success;
    background-color: $status-success-subtle;
}

.status-danger {
    color: $status-danger;
    background-color: $status-danger-subtle;
}

.status-dark {
    color: $status-neutral;
    background-color: $status-neutral-subtle;

    .dark & {
        color: $dark-font-color;
        background-color: rgba($dark-font-color, 0.12);
    }
}

.fixed-width {
    width: 72px;
    justify-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
