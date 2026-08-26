import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./ipc";

/**
 * Checks GitHub Releases for a newer version and, with the user's consent,
 * downloads, installs and relaunches. Silent when already up to date or when
 * the check fails (e.g. offline).
 */
export async function checkForUpdates(interactive: boolean): Promise<void> {
  if (!isTauri) return;
  try {
    const update = await check();
    if (!update) {
      if (interactive) {
        await ask("You are on the latest version.", {
          title: "Check for updates",
          kind: "info",
          okLabel: "OK",
          cancelLabel: "Close",
        });
      }
      return;
    }
    const yes = await ask(
      `Version ${update.version} is available. Update now?\nThe app will restart after updating.`,
      { title: "Update available", kind: "info", okLabel: "Update", cancelLabel: "Later" },
    );
    if (!yes) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    console.warn("update check failed:", err);
  }
}
