<template>
    <div>
        <fieldset class="settings-field appearance-theme">
            <legend class="settings-field-label">{{ $t("Theme") }}</legend>
            <p class="settings-help">{{ $t("themeHelp") }}</p>
            <div class="theme-cards">
                <label
                    v-for="option in themeOptions"
                    :key="option.value"
                    class="theme-card"
                    :class="{ selected: $root.userTheme === option.value }"
                >
                    <input
                        v-model="$root.userTheme"
                        type="radio"
                        class="theme-card-input"
                        name="theme"
                        autocomplete="off"
                        :value="option.value"
                    />
                    <span class="theme-preview" :class="`theme-preview-${option.value}`" aria-hidden="true">
                        <span class="theme-preview-pane theme-preview-base">
                            <span class="theme-preview-bar"></span>
                            <span class="theme-preview-logo"></span>
                            <span class="theme-preview-line l1"></span>
                            <span class="theme-preview-line l2"></span>
                            <span class="theme-preview-line l3"></span>
                            <span class="theme-preview-box"></span>
                        </span>
                        <span v-if="option.value === 'auto'" class="theme-preview-pane theme-preview-half">
                            <span class="theme-preview-bar"></span>
                            <span class="theme-preview-logo"></span>
                            <span class="theme-preview-line l1"></span>
                            <span class="theme-preview-line l2"></span>
                            <span class="theme-preview-line l3"></span>
                            <span class="theme-preview-box"></span>
                        </span>
                    </span>
                    <span class="theme-card-footer">
                        <span class="theme-radio" aria-hidden="true"></span>
                        <span class="theme-card-label">{{ $t(option.label) }}</span>
                    </span>
                </label>
            </div>
        </fieldset>

        <div class="settings-field appearance-language">
            <label for="language">{{ $t("Language") }}</label>
            <select id="language" v-model="$root.language" class="form-select">
                <option
                    v-for="(lang, i) in $i18n.availableLocales"
                    :key="`Lang${i}`"
                    :value="lang"
                >
                    {{ $i18n.messages[lang].languageName }}
                </option>
            </select>
            <p class="settings-help">{{ $t("languageHelp") }}</p>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            // `value` is what $root.userTheme stores; `label` is an i18n key
            themeOptions: [
                {
                    value: "light",
                    label: "Light",
                },
                {
                    value: "dark",
                    label: "Dark",
                },
                {
                    value: "auto",
                    label: "System",
                },
            ],
        };
    },
};
</script>

<style lang="scss" scoped>
@import "../../styles/vars.scss";

// The previews always show the same fixed palettes, whatever theme is active,
// so they use literal colours (as in the Figma frame) except where a token matches.
$preview-dark-bg: #0f1117;
$preview-dark-bar: #1a1d26;
$preview-dark-line: #2e3340;
$preview-light-line: #d5dae1;

.appearance-theme {
    border: 0;
    padding: 0;
    min-width: 0;
    margin-bottom: 24px;
}

.appearance-language {
    max-width: 360px;
}

.theme-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.theme-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 200px;
    max-width: 100%;
    padding: 12px;
    border-radius: 4px;
    background: $bg-input;
    cursor: pointer;

    .dark & {
        background: $dark-bg-input;
    }

    &:hover:not(.selected) {
        background: $bg-surface-raised;

        .dark & {
            background: $dark-bg-surface-raised;
        }
    }

    &.selected {
        background: $accent-primary-subtle;

        .dark & {
            background: $dark-accent-primary-subtle;
        }
    }

    // Visible keyboard focus on the card; the input itself is visually hidden
    &:has(.theme-card-input:focus-visible) {
        outline: 2px solid $accent-primary;
        outline-offset: 2px;

        .dark & {
            outline-color: $dark-accent-primary;
        }
    }
}

.theme-card-input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
}

.theme-preview {
    position: relative;
    display: block;
    width: 100%;
    max-width: 176px;
    height: 72px;
    border-radius: 4px;
    overflow: hidden;
}

.theme-preview-pane {
    position: absolute;
    top: 0;
    left: 0;
    width: 176px;
    height: 72px;
    overflow: hidden;
    background: $bg-app;

    > span {
        position: absolute;
        display: block;
    }

    .theme-preview-bar {
        top: 0;
        left: 0;
        width: 176px;
        height: 16px;
        background: $bg-surface;
    }

    .theme-preview-logo {
        top: 5px;
        left: 8px;
        width: 18px;
        height: 6px;
        border-radius: 2px;
        background: $accent-primary;
    }

    .theme-preview-line {
        left: 8px;
        height: 6px;
        border-radius: 2px;
        background: $preview-light-line;

        &.l1 {
            top: 26px;
            width: 56px;
        }
        &.l2 {
            top: 38px;
            width: 100px;
        }
        &.l3 {
            top: 50px;
            width: 76px;
        }
    }

    .theme-preview-box {
        top: 26px;
        left: 128px;
        width: 40px;
        height: 38px;
        border-radius: 3px;
        background: $bg-surface;
    }
}

// Dark and System cards use the dark palette as the base pane
.theme-preview-dark .theme-preview-base,
.theme-preview-auto .theme-preview-base {
    background: $preview-dark-bg;

    .theme-preview-bar,
    .theme-preview-box {
        background: $preview-dark-bar;
    }

    .theme-preview-line {
        background: $preview-dark-line;
    }
}

// System: the light palette covers the left half
.theme-preview-half {
    width: 88px;
}

.theme-card-footer {
    display: flex;
    align-items: center;
    gap: 8px;
}

.theme-radio {
    flex: none;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid $border-strong;
    background: transparent;

    .dark & {
        border-color: $dark-border-strong;
    }

    .selected & {
        border: 4px solid $accent-primary;

        .dark & {
            border-color: $dark-accent-primary;
        }
    }
}

.theme-card-label {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;

    .dark & {
        color: $dark-text-primary;
    }

    .selected & {
        color: $accent-primary;

        .dark & {
            color: $dark-accent-primary;
        }
    }
}
</style>
