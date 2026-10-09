// Native Google Sign-In bridge for PaliaAPK HUB.
// Uses Android Credential Manager; no browser redirect on Android.
(function () {
  function getPlugin() {
    if (!window.Capacitor || typeof window.Capacitor.registerPlugin !== 'function') {
      throw new Error('Capacitor runtime is not available.');
    }
    return window.Capacitor.registerPlugin('PaliaGoogleAuth');
  }

  window.PaliaNativeGoogle = {
    async signIn() {
      const plugin = getPlugin();
      const result = await plugin.signIn();
      if (!result || !result.idToken) {
        throw new Error('Google did not return an ID token.');
      }
      return result;
    }
  };
})();
