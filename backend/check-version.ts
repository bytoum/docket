import { log } from "./log";
import compareVersions from "compare-versions";
import packageJSON from "../package.json";
import { Settings } from "./settings";

// How much time in ms to wait between update checks
const UPDATE_CHECKER_INTERVAL_MS = 1000 * 60 * 60 * 48;
// Releases of bytoum/docket on GitHub (newest first)
const CHECK_URL = "https://api.github.com/repos/bytoum/docket/releases?per_page=20";

interface GitHubRelease {
    tag_name : string;
    draft : boolean;
    prerelease : boolean;
}

/**
 * Pick the newest stable and pre-release versions from GitHub releases
 * @param {GitHubRelease[]} releases Releases, newest first
 * @returns {{ slow?: string, beta?: string }} Latest stable ("slow") and pre-release ("beta") versions
 */
function latestVersions(releases : GitHubRelease[]) : { slow? : string, beta? : string } {
    const result : { slow? : string, beta? : string } = {};
    for (const release of releases) {
        if (release.draft) {
            continue;
        }
        const version = release.tag_name.replace(/^v/, "");
        if (release.prerelease) {
            result.beta ??= version;
        } else {
            result.slow ??= version;
        }
    }
    return result;
}

class CheckVersion {
    version = packageJSON.version;
    latestVersion? : string;
    interval? : NodeJS.Timeout;

    async startInterval() {
        const check = async () => {
            if (await Settings.get("checkUpdate") === false) {
                return;
            }

            log.debug("update-checker", "Retrieving latest versions");

            try {
                const res = await fetch(CHECK_URL, {
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "User-Agent": `Docket/${this.version}`,
                    },
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data = latestVersions(await res.json());

                // For debug
                if (process.env.TEST_CHECK_VERSION === "1") {
                    data.slow = "1000.0.0";
                }

                const checkBeta = await Settings.get("checkBeta");

                if (checkBeta && data.beta) {
                    if (!data.slow || compareVersions.compare(data.beta, data.slow, ">")) {
                        this.latestVersion = data.beta;
                        return;
                    }
                }

                if (data.slow) {
                    this.latestVersion = data.slow;
                }

            } catch (_) {
                log.info("update-checker", "Failed to check for new versions");
            }

        };

        await check();
        this.interval = setInterval(check, UPDATE_CHECKER_INTERVAL_MS);
    }
}

const checkVersion = new CheckVersion();
export default checkVersion;
