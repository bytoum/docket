<template>
    <div class="login-page">
        <div class="login-left">
            <div class="login-theme-toggle" role="group" :aria-label="$t('Theme')">
                <button
                    v-for="option in themeOptions"
                    :key="option.value"
                    type="button"
                    class="login-theme-option"
                    :class="{ active: $root.theme === option.value }"
                    :aria-pressed="$root.theme === option.value"
                    :aria-label="$t(option.label)"
                    :title="$t(option.label)"
                    @click="$root.userTheme = option.value"
                >
                    <span class="login-theme-icon" :style="{ '--theme-icon': `url(&quot;${option.icon}&quot;)` }" />
                </button>
            </div>

            <div class="login-content">
                <div class="login-brand">
                    <img src="/icon.svg" width="32" height="32" alt="">
                    <span>Docket</span>
                </div>

                <!-- Step 1: username and password -->
                <form v-if="!tokenRequired" class="login-form" @submit.prevent="submit">
                    <div class="login-heading">
                        <h1>{{ $t("loginWelcome") }}</h1>
                        <p>{{ $t("loginSubtitle") }}</p>
                    </div>

                    <div class="login-fields">
                        <div class="login-field">
                            <label for="login-username">{{ $t("Username") }}</label>
                            <input id="login-username" v-model="username" type="text" :placeholder="$t('loginUsernamePlaceholder')" autocomplete="username" required>
                        </div>
                        <div class="login-field">
                            <label for="login-password">{{ $t("Password") }}</label>
                            <input id="login-password" v-model="password" type="password" :placeholder="$t('loginPasswordPlaceholder')" autocomplete="current-password" required>
                        </div>
                    </div>

                    <label class="login-remember">
                        <input v-model="$root.remember" type="checkbox" class="form-check-input">
                        <span>{{ $t("Remember me") }}</span>
                    </label>

                    <button class="login-btn login-btn-primary" type="submit" :disabled="processing">
                        {{ $t("Sign in") }}
                    </button>

                    <div v-if="res && !res.ok" class="login-error" role="alert">
                        {{ $t(res.msg) }}
                    </div>

                    <p class="login-hint">{{ $t("loginForgotPassword") }}</p>
                </form>

                <!-- Step 2: two-factor code -->
                <form v-else class="login-form" @submit.prevent="submit">
                    <div class="login-heading">
                        <h1 class="login-heading-2fa">{{ $t("Two Factor Authentication") }}</h1>
                        <p>{{ $t("loginTwoFASubtitle") }}</p>
                    </div>

                    <div class="login-code" @click="focusCode">
                        <input
                            id="otp"
                            ref="otp"
                            :value="token"
                            type="text"
                            inputmode="numeric"
                            maxlength="6"
                            autocomplete="one-time-code"
                            :aria-label="$t('Token')"
                            required
                            @input="onCodeInput"
                            @focus="codeFocused = true"
                            @blur="codeFocused = false"
                        >
                        <div
                            v-for="i in codeLength"
                            :key="i"
                            class="login-digit"
                            :class="{ active: codeFocused && i - 1 === activeDigit }"
                            aria-hidden="true"
                        >
                            <template v-if="token[i - 1]">{{ token[i - 1] }}</template>
                            <span v-else-if="codeFocused && i - 1 === activeDigit" class="login-caret" />
                        </div>
                    </div>

                    <button class="login-btn login-btn-primary" type="submit" :disabled="processing || token.length !== codeLength">
                        {{ $t("Verify Token") }}
                    </button>

                    <div v-if="res && !res.ok" class="login-error" role="alert">
                        {{ $t(res.msg) }}
                    </div>

                    <button class="login-btn login-btn-secondary" type="button" @click="backToSignIn">
                        {{ $t("Back to sign in") }}
                    </button>
                </form>
            </div>
        </div>

        <aside class="login-brand-panel" aria-hidden="true">
            <p class="login-brand-title">{{ $t("loginBrandTitle") }}</p>
            <p class="login-brand-subtitle">{{ $t("loginBrandSubtitle") }}</p>
            <div class="login-mascot">
                <img class="mascot-waves" :src="wavesSvg" alt="">
                <span class="mascot-container" style="left: 40.234%; top: 20%;" />
                <span class="mascot-container" style="left: 47.266%; top: 20%;" />
                <span class="mascot-container" style="left: 54.297%; top: 20%;" />
                <span class="mascot-container" style="left: 61.328%; top: 20%;" />
                <span class="mascot-container" style="left: 47.266%; top: 8.889%;" />
                <span class="mascot-container" style="left: 54.297%; top: 8.889%;" />
                <img class="mascot-body" :src="bodySvg" alt="">
                <img class="mascot-belly" :src="bellySvg" alt="">
                <img class="mascot-mouth" :src="mouthSvg" alt="">
                <img class="mascot-eye" :src="eyeSvg" alt="">
            </div>
        </aside>
    </div>
</template>

<script>
import wavesSvg from "../assets/login/waves.svg";
import bodySvg from "../assets/login/body.svg";
import bellySvg from "../assets/login/belly.svg";
import mouthSvg from "../assets/login/mouth.svg";
import eyeSvg from "../assets/login/eye.svg";
import sunSvg from "../assets/login/sun.svg";
import moonSvg from "../assets/login/moon.svg";

export default {
    data() {
        return {
            processing: false,
            username: "",
            password: "",
            token: "",
            res: null,
            tokenRequired: false,
            codeFocused: false,
            codeLength: 6,
            wavesSvg,
            bodySvg,
            bellySvg,
            mouthSvg,
            eyeSvg,
            themeOptions: [
                {
                    value: "light",
                    label: "Light",
                    icon: sunSvg,
                },
                {
                    value: "dark",
                    label: "Dark",
                    icon: moonSvg,
                },
            ],
        };
    },

    computed: {
        /**
         * Index of the code box the next digit goes into
         * @returns {number} Box index
         */
        activeDigit() {
            return Math.min(this.token.length, this.codeLength - 1);
        },
    },

    mounted() {
        document.title += " - Login";
    },

    unmounted() {
        document.title = document.title.replace(" - Login", "");
    },

    methods: {
        /**
         * Submit the user details and attempt to log in
         * @returns {void}
         */
        submit() {
            if (this.processing) {
                return;
            }
            this.processing = true;

            this.$root.login(this.username, this.password, this.token, (res) => {
                this.processing = false;

                if (res.tokenRequired) {
                    this.tokenRequired = true;
                    this.res = null;
                    this.token = "";
                    this.$nextTick(() => this.focusCode());
                } else {
                    this.res = res;
                    if (!res.ok && this.tokenRequired) {
                        this.token = "";
                        this.$nextTick(() => this.focusCode());
                    }
                }
            });
        },

        /**
         * Keep only digits in the code and submit once all of them are in
         * @param {Event} event Input event of the code field
         * @returns {void}
         */
        onCodeInput(event) {
            const digits = event.target.value.replace(/\D/g, "").slice(0, this.codeLength);
            this.token = digits;
            event.target.value = digits;

            if (digits.length === this.codeLength) {
                this.submit();
            }
        },

        /**
         * Focus the hidden code input
         * @returns {void}
         */
        focusCode() {
            this.$refs.otp?.focus();
        },

        /**
         * Leave the code step and return to the username and password form
         * @returns {void}
         */
        backToSignIn() {
            this.tokenRequired = false;
            this.token = "";
            this.res = null;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

// Full-screen sign-in page, above the app header
.login-page {
    position: fixed;
    inset: 0;
    z-index: 1010;
    display: flex;
    background-color: $bg-app;
    overflow-y: auto;
}

.login-left {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 16px;
    background-color: $bg-surface;

    .dark & {
        background-color: $dark-bg-surface;
    }
}

// Light / dark switch in the top-right corner of the form side
.login-theme-toggle {
    position: absolute;
    top: 24px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background-color: $bg-input;

    .dark & {
        background-color: $dark-bg-input;
    }

    @media (max-width: 575.98px) {
        top: 16px;
        right: 16px;
    }
}

.login-theme-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    color: $text-muted;
    background-color: transparent;

    &:hover {
        color: $text-primary;
    }

    &.active {
        color: $text-primary;
        background-color: $bg-surface;
    }

    .dark & {
        color: $dark-text-muted;

        &:hover,
        &.active {
            color: $dark-text-primary;
        }

        &.active {
            background-color: $dark-bg-surface;
        }
    }
}

// The SVG is a mask, so the icon takes the button's text colour
.login-theme-icon {
    width: 16px;
    height: 16px;
    background-color: currentColor;
    mask: var(--theme-icon) center / auto no-repeat;
    -webkit-mask: var(--theme-icon) center / auto no-repeat;
}

.login-content,
.login-form {
    display: flex;
    flex-direction: column;
    gap: 28px;
    width: 100%;
}

.login-content {
    max-width: 400px;
}

.login-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 20px;
    font-weight: 700;
    line-height: normal;
    color: $text-primary;

    .dark & {
        color: $dark-text-primary;
    }
}

.login-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;

    h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        line-height: normal;
        color: $text-primary;

        &.login-heading-2fa {
            font-size: 26px;
        }

        .dark & {
            color: $dark-text-primary;
        }
    }

    p {
        margin: 0;
        font-size: 14px;
        line-height: normal;
        color: $text-muted;

        .dark & {
            color: $dark-text-muted;
        }
    }
}

.login-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.login-field {
    display: flex;
    flex-direction: column;
    gap: 8px;

    label {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: normal;
        color: $text-primary;

        .dark & {
            color: $dark-text-primary;
        }
    }

    input {
        height: 44px;
        padding: 8px 10px;
        border: 0;
        border-radius: 4px;
        outline: none;
        font-size: 14px;
        color: $text-primary;
        background-color: $bg-input;

        &::placeholder {
            color: $text-muted;
        }

        &:focus {
            box-shadow: 0 0 0 3px rgba($accent-primary, 0.15);
        }

        .dark & {
            color: $dark-text-primary;
            background-color: $dark-bg-input;

            &::placeholder {
                color: $dark-text-muted;
            }

            &:focus {
                box-shadow: 0 0 0 3px rgba($dark-accent-primary, 0.25);
            }
        }
    }
}

.login-remember {
    display: flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    margin: 0;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    line-height: normal;
    color: $text-secondary;

    .form-check-input {
        width: 16px;
        height: 16px;
        margin: 0;
        border-radius: 3px;
        cursor: pointer;
    }

    .dark & {
        color: $dark-text-secondary;
    }
}

.login-btn {
    width: 100%;
    padding: 8px 14px;
    border: 0;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    line-height: normal;
    transition: background-color 0.15s;

    &:disabled {
        opacity: 0.65;
        cursor: default;
    }
}

.login-btn-primary {
    color: $text-on-accent;
    background-color: $accent-primary;

    &:not(:disabled):hover {
        background-color: $accent-primary-hover;
    }

    .dark & {
        color: $dark-text-on-accent;
        background-color: $dark-accent-primary;

        &:not(:disabled):hover {
            background-color: darken($dark-accent-primary, 8%);
        }
    }
}

.login-btn-secondary {
    color: $text-primary;
    background-color: $bg-surface-raised;

    &:hover {
        background-color: darken($bg-surface-raised, 4%);
    }

    .dark & {
        color: $dark-text-primary;
        background-color: $dark-bg-surface-raised;

        &:hover {
            background-color: lighten($dark-bg-surface-raised, 4%);
        }
    }
}

.login-error {
    margin-top: -12px;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 13px;
    color: $status-danger;
    background-color: $status-danger-subtle;

    .dark & {
        color: $dark-status-danger;
        background-color: $dark-status-danger-subtle;
    }
}

.login-hint {
    margin: 0;
    font-size: 12px;
    line-height: normal;
    text-align: center;
    color: $text-muted;

    .dark & {
        color: $dark-text-muted;
    }
}

// Six code boxes; one transparent input on top takes the typing, paste and autofill
.login-code {
    position: relative;
    display: flex;
    gap: 10px;

    input {
        position: absolute;
        inset: 0;
        width: 100%;
        opacity: 0;
        border: 0;
        cursor: text;
    }
}

.login-digit {
    flex: 1 1 0;
    min-width: 0;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 22px;
    font-weight: 600;
    line-height: normal;
    color: $text-primary;
    background-color: $bg-input;

    &.active {
        background-color: $accent-primary-subtle;
    }

    .dark & {
        color: $dark-text-primary;
        background-color: $dark-bg-input;

        &.active {
            background-color: $dark-accent-primary-subtle;
        }
    }
}

.login-caret {
    width: 2px;
    height: 24px;
    background-color: $accent-primary;
    animation: login-caret-blink 1s step-end infinite;

    .dark & {
        background-color: $dark-accent-primary;
    }
}

@keyframes login-caret-blink {
    50% {
        opacity: 0;
    }
}

// Brand panel on the right. It keeps the brand blue in both themes,
// because the mascot artwork is drawn for it.
.login-brand-panel {
    flex: 0 0 auto;
    width: min(640px, 45%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 32px;
    padding: 64px;
    background-color: $accent-primary;
    color: #ffffff;
    overflow: hidden;

    p {
        margin: 0;
        line-height: normal;
    }

    @media (max-width: 991.98px) {
        display: none;
    }
}

.login-brand-title {
    font-size: 34px;
    font-weight: 700;
}

.login-brand-subtitle {
    font-size: 15px;
}

// Mascot: positions are the Figma frame (512 × 270) in percent, so it scales
.login-mascot {
    position: relative;
    width: 100%;
    max-width: 512px;
    aspect-ratio: 512 / 270;

    > * {
        position: absolute;
        display: block;
    }

    img {
        max-width: none;
    }
}

.mascot-container {
    width: 6.25%;
    height: 9.63%;
    border-radius: 3px;
    background-color: #ffffff;
}

.mascot-waves {
    left: -0.391%;
    top: 90.785%;
    width: 100.781%;
    height: 3.62%;
}

.mascot-body {
    left: 14.453%;
    top: 31.852%;
    width: 71.111%;
    height: 52.593%;
}

.mascot-belly {
    left: 34.375%;
    top: 68.148%;
    width: 48.438%;
    height: 16.296%;
}

.mascot-mouth {
    left: 70.41%;
    top: 64.63%;
    width: 9.57%;
    height: 3.989%;
}

.mascot-eye {
    left: 72.266%;
    top: 52.593%;
    width: 1.953%;
    height: 3.704%;
}
</style>
