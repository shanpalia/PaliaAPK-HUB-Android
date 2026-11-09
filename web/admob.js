/* PaliaAPK HUB - native AdMob integration (Capacitor 6). */
(function () {
  "use strict";

  const IDS = {
    banner: "ca-app-pub-1717784184671933/3652485645",
    interstitial: "ca-app-pub-1717784184671933/6280704320",
    rewarded: "ca-app-pub-1717784184671933/4175229823"
  };

  // Keep test requests enabled while validating the APK. Switch to false only
  // after testing is complete and the app has been approved for ad serving.
  const TEST_MODE = true;
  let plugin = null;
  let initPromise = null;
  let interstitialReady = false;
  let rewardedReady = false;

  function getPlugin() {
    const cap = window.Capacitor;
    if (!cap) return null;
    try {
      const native = typeof cap.isNativePlatform === "function"
        ? cap.isNativePlatform()
        : (typeof cap.getPlatform === "function" && cap.getPlatform() !== "web");
      if (!native) return null;
      return cap.Plugins && cap.Plugins.AdMob
        ? cap.Plugins.AdMob
        : (typeof cap.registerPlugin === "function" ? cap.registerPlugin("AdMob") : null);
    } catch (error) {
      console.warn("[PaliaAds] Native AdMob plugin unavailable", error);
      return null;
    }
  }

  async function initialize() {
    if (initPromise) return initPromise;
    plugin = getPlugin();
    if (!plugin) return false;

    initPromise = (async function () {
      try {
        // UMP consent information is refreshed before requesting ads.
        let consent = null;
        if (typeof plugin.requestConsentInfo === "function") {
          consent = await plugin.requestConsentInfo();
          if (consent && consent.isConsentFormAvailable && consent.status === "REQUIRED") {
            consent = await plugin.showConsentForm();
          }
          if (consent && (consent.status === "REQUIRED" || consent.status === "UNKNOWN")) {
            console.info("[PaliaAds] Consent is not ready; ads will not be requested.");
            return false;
          }
        }

        await plugin.initialize();
        await plugin.showBanner({
          adId: IDS.banner,
          adSize: "ADAPTIVE_BANNER",
          position: "BOTTOM_CENTER",
          margin: 74,
          isTesting: TEST_MODE
        });

        // Reserve space for the native banner above the app's bottom navigation.
        if (!document.getElementById("palia-admob-layout")) {
          const style = document.createElement("style");
          style.id = "palia-admob-layout";
          style.textContent = "body{padding-bottom:calc(160px + env(safe-area-inset-bottom))!important}";
          document.head.appendChild(style);
        }

        try {
          await plugin.prepareInterstitial({ adId: IDS.interstitial, isTesting: TEST_MODE });
          interstitialReady = true;
        } catch (error) {
          console.warn("[PaliaAds] Interstitial preload failed", error);
        }

        try {
          await plugin.prepareRewardVideoAd({ adId: IDS.rewarded, isTesting: TEST_MODE });
          rewardedReady = true;
        } catch (error) {
          console.warn("[PaliaAds] Rewarded preload failed", error);
        }

        console.info("[PaliaAds] Banner active; full-screen ad units initialized in test mode.");
        return true;
      } catch (error) {
        console.warn("[PaliaAds] Initialization failed", error);
        return false;
      }
    })();

    return initPromise;
  }

  window.PaliaAds = {
    initialize,
    async showInterstitial() {
      if (!plugin || !interstitialReady) return false;
      try {
        interstitialReady = false;
        await plugin.showInterstitial();
        try {
          await plugin.prepareInterstitial({ adId: IDS.interstitial, isTesting: TEST_MODE });
          interstitialReady = true;
        } catch (error) {
          console.warn("[PaliaAds] Interstitial reload failed", error);
        }
        return true;
      } catch (error) {
        console.warn("[PaliaAds] Interstitial show failed", error);
        return false;
      }
    },
    async showRewarded() {
      if (!plugin || !rewardedReady) return null;
      try {
        rewardedReady = false;
        const reward = await plugin.showRewardVideoAd();
        try {
          await plugin.prepareRewardVideoAd({ adId: IDS.rewarded, isTesting: TEST_MODE });
          rewardedReady = true;
        } catch (error) {
          console.warn("[PaliaAds] Rewarded reload failed", error);
        }
        return reward || null;
      } catch (error) {
        console.warn("[PaliaAds] Rewarded ad show failed", error);
        return null;
      }
    },
    async hideBanner() {
      if (plugin && typeof plugin.hideBanner === "function") {
        try { await plugin.hideBanner(); } catch (error) { console.warn(error); }
      }
    },
    async showBanner() {
      if (!plugin) return false;
      try {
        await plugin.showBanner({
          adId: IDS.banner,
          adSize: "ADAPTIVE_BANNER",
          position: "BOTTOM_CENTER",
          margin: 74,
          isTesting: TEST_MODE
        });
        return true;
      } catch (error) {
        console.warn("[PaliaAds] Banner show failed", error);
        return false;
      }
    }
  };

  function startWhenReady() {
    initialize();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWhenReady, { once: true });
  } else {
    startWhenReady();
  }
})();
