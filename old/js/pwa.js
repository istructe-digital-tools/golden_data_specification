(function () {
  "use strict";

  const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
  const INSTALL_FLAG_KEY = "gt-pwa-installed";
  const UPDATE_DISMISS_KEY = "gt-pwa-update-dismiss";
  const VERSION_URL = new URL("./version.json", window.location.href).href;
  let deferredPrompt = null;
  let refreshing = false;
  let appInstalledKnown = false;
  let pageVersion = null;
  let pendingRemoteVersion = null;

  function isStandalone() {
    if (window.navigator.standalone === true) return true;
    return window.matchMedia(
      "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)"
    ).matches;
  }

  function applyStandaloneClass() {
    document.documentElement.classList.toggle("pwa-standalone", isStandalone());
  }

  function isDownloadPage() {
    return document.body.classList.contains("download-page");
  }

  function markAppInstalled() {
    appInstalledKnown = true;
    try {
      localStorage.setItem(INSTALL_FLAG_KEY, "1");
    } catch {
      /* private browsing */
    }
  }

  function hasInstallFlag() {
    try {
      return localStorage.getItem(INSTALL_FLAG_KEY) === "1";
    } catch {
      return false;
    }
  }

  function isInstalledSync() {
    return isStandalone() || hasInstallFlag() || appInstalledKnown;
  }

  async function isAppInstalled() {
    if (isInstalledSync()) return true;
    if (!navigator.getInstalledRelatedApps) return false;
    try {
      const apps = await navigator.getInstalledRelatedApps();
      return apps.length > 0;
    } catch {
      return false;
    }
  }

  async function refreshInstalledState() {
    if (isInstalledSync()) {
      appInstalledKnown = true;
      return true;
    }
    const installed = await isAppInstalled();
    if (installed) markAppInstalled();
    return installed;
  }

  function redirectToMainApp() {
    window.location.replace("./");
  }

  function centeredPopupFeatures(width, height) {
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    return [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "noopener",
    ].join(",");
  }

  function isEmbeddedContext() {
    if (window.frameElement !== null) return true;
    if (window.parent !== window.self) return true;
    try {
      if (window.top !== window.self) return true;
    } catch {
      return true;
    }
    return new URLSearchParams(window.location.search).get("embed") === "1";
  }

  function isIosSafari() {
    const ua = window.navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
    return isIos && isSafari;
  }

  function installUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("install", "1");
    url.searchParams.delete("embed");
    return url.toString();
  }

  function downloadPopupUrl() {
    const url = new URL("./download.html", window.location.href);
    url.searchParams.set("popup", "1");
    url.searchParams.set("install", "1");
    return url.href;
  }

  function openMainAppPopup() {
    const url = new URL("./", window.location.href).href;
    const features = centeredPopupFeatures(440, 560);
    const popup = window.open(url, "gt-spec-app", features);
    if (popup) {
      popup.opener = null;
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function openDownloadPopup() {
    const features = centeredPopupFeatures(440, 560);
    const popup = window.open(downloadPopupUrl(), "gt-spec-download", features);
    if (popup) {
      popup.opener = null;
      return;
    }
    window.open(downloadPopupUrl(), "_blank", "noopener");
  }

  function getInstallControl() {
    return document.getElementById("btn-install") || document.getElementById("btn-download-primary");
  }

  function showInstallModal(title, message) {
    let modal = document.getElementById("install-help-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "install-help-modal";
      modal.className = "ios-install-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-labelledby", "install-help-title");
      modal.innerHTML =
        '<div class="ios-install-dialog">' +
        '<h2 id="install-help-title"></h2>' +
        '<p id="install-help-message"></p>' +
        '<button type="button" class="ios-install-close">Close</button>' +
        "</div>";
      document.body.appendChild(modal);
      modal.querySelector(".ios-install-close").addEventListener("click", () => {
        modal.hidden = true;
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.hidden = true;
      });
    }
    modal.querySelector("#install-help-title").textContent = title;
    modal.querySelector("#install-help-message").innerHTML = message;
    modal.hidden = false;
  }

  function showIosInstallModal() {
    showInstallModal(
      "Install on iOS",
      "Tap <strong>Share</strong> in Safari, then choose <strong>Add to Home Screen</strong>."
    );
  }

  function showTopLevelInstallModal() {
    showInstallModal(
      "Download",
      "Use your browser menu (<strong>⋮</strong> or <strong>…</strong>) and choose " +
        "<strong>Install app</strong>, or look for the install icon in the address bar."
    );
  }

  function configureDownloadPage() {
    if (!isDownloadPage()) return;

    const iosEl = document.querySelector(".download-ios");
    const chromeEl = document.querySelector(".download-chrome");
    if (iosEl) iosEl.hidden = !isIosSafari();
    if (chromeEl) chromeEl.hidden = isIosSafari() || Boolean(deferredPrompt);
  }

  function setDownloadStatus(message) {
    const status = document.getElementById("download-status");
    if (!status) return;
    if (message) {
      status.textContent = message;
      status.hidden = false;
    } else {
      status.textContent = "";
      status.hidden = true;
    }
  }

  function configureInstallControl() {
    const control = getInstallControl();
    if (!control) return;

    applyStandaloneClass();

    if (isInstalledSync()) {
      if (isDownloadPage()) {
        redirectToMainApp();
        return;
      }
      control.setAttribute("hidden", "");
      control.setAttribute("aria-hidden", "true");
      return;
    }

    control.removeAttribute("hidden");
    control.removeAttribute("aria-hidden");
    control.classList.remove("is-disabled");

    if (isDownloadPage()) {
      control.textContent = isIosSafari() ? "Add to Home Screen" : "Download";
      control.setAttribute(
        "aria-label",
        "Download IStructE Golden Data Specification"
      );
      configureDownloadPage();
      return;
    }

    if (isEmbeddedContext()) {
      control.textContent = "Download";
      control.setAttribute(
        "aria-label",
        "Download IStructE Golden Data Specification"
      );
      return;
    }

    if (isIosSafari()) {
      control.textContent = "Add to Home Screen";
      control.setAttribute("aria-label", "Add IStructE Golden Data Specification to your home screen");
    } else {
      control.textContent = "Download";
      control.setAttribute("aria-label", "Download IStructE Golden Data Specification");
    }
  }

  async function handleTopLevelInstallClick() {
    if (isIosSafari()) {
      if (isDownloadPage()) {
        configureDownloadPage();
        return;
      }
      showIosInstallModal();
      return;
    }

    if (!deferredPrompt) {
      if (isDownloadPage()) {
        configureDownloadPage();
        return;
      }
      showTopLevelInstallModal();
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    configureInstallControl();

    if (outcome === "accepted") {
      markAppInstalled();
      if (isDownloadPage()) {
        redirectToMainApp();
        return;
      }
      const control = getInstallControl();
      if (control) {
        control.textContent = "Installed";
        control.classList.add("is-disabled");
      }
    }
  }

  function maybeAutoInstall() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("install") !== "1" || isEmbeddedContext() || isInstalledSync()) return;

    if (deferredPrompt) {
      handleTopLevelInstallClick();
      return;
    }

    window.addEventListener(
      "beforeinstallprompt",
      () => {
        setTimeout(() => handleTopLevelInstallClick(), 50);
      },
      { once: true }
    );
  }

  async function readAppVersion() {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  }

  function isUpdateDismissed(version) {
    if (!version) return false;
    try {
      return sessionStorage.getItem(UPDATE_DISMISS_KEY) === version;
    } catch {
      return false;
    }
  }

  function dismissUpdate(version) {
    if (!version) return;
    try {
      sessionStorage.setItem(UPDATE_DISMISS_KEY, version);
    } catch {
      /* private browsing */
    }
  }

  function activateWaitingWorker(registration) {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  function showUpdateBanner(registration) {
    if (document.getElementById("pwa-update-banner")) return;

    const bannerVersion = pendingRemoteVersion || pageVersion;
    if (isUpdateDismissed(bannerVersion)) return;

    const banner = document.createElement("div");
    banner.id = "pwa-update-banner";
    banner.className = "pwa-update-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML =
      '<span class="pwa-update-text">Update available</span>' +
      '<button type="button" class="pwa-update-reload">Reload</button>' +
      '<button type="button" class="pwa-update-dismiss" aria-label="Dismiss">×</button>';

    banner.querySelector(".pwa-update-reload").addEventListener("click", () => {
      activateWaitingWorker(registration);
    });

    banner.querySelector(".pwa-update-dismiss").addEventListener("click", () => {
      dismissUpdate(bannerVersion);
      banner.remove();
    });

    document.body.appendChild(banner);
  }

  async function reconcileWaitingWorker(registration) {
    if (!registration.waiting) return;

    const remoteVersion = await readAppVersion();
    if (!remoteVersion) return;

    if (pageVersion === null) {
      pageVersion = remoteVersion;
    }

    // Waiting worker matches the current deploy — activate silently (fixes stuck banners).
    if (remoteVersion === pageVersion) {
      activateWaitingWorker(registration);
      return;
    }

    pendingRemoteVersion = remoteVersion;
    if (!isUpdateDismissed(remoteVersion)) {
      showUpdateBanner(registration);
    }
  }

  async function pollVersion(registration) {
    if (!navigator.onLine || !navigator.serviceWorker.controller) return;

    try {
      const remoteVersion = await readAppVersion();
      if (!remoteVersion) return;

      if (pageVersion === null) {
        pageVersion = remoteVersion;
        await reconcileWaitingWorker(registration);
        return;
      }

      if (remoteVersion === pageVersion) {
        return;
      }

      pendingRemoteVersion = remoteVersion;
      await registration.update();
      await reconcileWaitingWorker(registration);
    } catch {
      /* offline or fetch failed */
    }
  }

  function scheduleUpdateChecks(registration) {
    const run = () => {
      pollVersion(registration);
    };

    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") run();
    });

    if (navigator.onLine) {
      setInterval(run, UPDATE_INTERVAL_MS);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then(async (registration) => {
        pageVersion = await readAppVersion();

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              reconcileWaitingWorker(registration);
            }
          });
        });

        try {
          await registration.update();
        } catch {
          /* offline */
        }
        await reconcileWaitingWorker(registration);
        scheduleUpdateChecks(registration);

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          try {
            sessionStorage.removeItem(UPDATE_DISMISS_KEY);
          } catch {
            /* private browsing */
          }
          window.location.reload();
        });
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
  }

  async function init() {
    applyStandaloneClass();
    appInstalledKnown = hasInstallFlag();

    if (isDownloadPage() && isInstalledSync()) {
      redirectToMainApp();
      return;
    }

    const control = getInstallControl();
    if (control) {
      control.addEventListener("click", async (e) => {
        e.preventDefault();
        if (control.classList.contains("is-disabled")) return;

        if (isEmbeddedContext()) {
          if (await refreshInstalledState()) {
            openMainAppPopup();
            return;
          }
          openDownloadPopup();
          return;
        }

        handleTopLevelInstallClick();
      });
    }

    const closeBtn = document.getElementById("btn-download-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        window.close();
      });
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      configureInstallControl();
      maybeAutoInstall();
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      markAppInstalled();
      if (isDownloadPage()) {
        redirectToMainApp();
        return;
      }
      configureInstallControl();
    });

    configureInstallControl();
    maybeAutoInstall();
    registerServiceWorker();

    if (await refreshInstalledState()) {
      if (isDownloadPage()) {
        redirectToMainApp();
        return;
      }
      configureInstallControl();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
