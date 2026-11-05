<template>
    <span class="asset-icon" :class="{ neutral: tone === 'neutral' }" :style="boxStyle" aria-hidden="true">
        <img :src="src" :width="width" :height="height" alt="" />
    </span>
</template>

<script>
/**
 * Shows an icon exported from the Figma design at its original size,
 * centred in a square box like the design's 16px / 13px icon frames.
 */
export default {
    props: {
        /** Imported SVG file */
        src: {
            type: String,
            required: true,
        },
        /** Width of the SVG, as exported */
        width: {
            type: [ Number, String ],
            required: true,
        },
        /** Height of the SVG, as exported */
        height: {
            type: [ Number, String ],
            required: true,
        },
        /** Size of the square icon frame in px */
        box: {
            type: Number,
            default: 16,
        },
        /** "neutral" icons are lightened in the dark theme */
        tone: {
            type: String,
            default: "",
        },
    },
    computed: {
        boxStyle() {
            return {
                width: `${this.box}px`,
                height: `${this.box}px`,
            };
        },
    },
};
</script>

<style lang="scss" scoped>
.asset-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    img {
        display: block;
    }
}

.dark .asset-icon.neutral img {
    filter: brightness(0) invert(0.8);
}
</style>
