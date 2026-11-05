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
    gap: 5px;
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 50rem;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    text-transform: capitalize;
    white-space: nowrap;
    color: $muted;
    background-color: rgba($muted, 0.12);

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
    color: #198754;
    background-color: rgba(#198754, 0.12);
}

.status-danger {
    color: $danger;
    background-color: rgba($danger, 0.12);
}

.status-dark {
    color: #374151;
    background-color: rgba(#374151, 0.1);

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
