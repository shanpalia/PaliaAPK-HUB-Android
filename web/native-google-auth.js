// Native Google Sign-In bridge for PaliaAPK HUB (Capacitor 6).
// Custom native plugins registered by MainActivity are exposed through Capacitor.Plugins.
(function () {
  function getPlugin() {
    const cap = window.Capacitor;
    if (!cap) {
      throw new Error('This screen is not running inside the PaliaAPK HUB Android app. Please open the installed app and try again.');
    }

    // Capacitor 6 global bridge: native plugins registered by MainActivity are under Plugins.
    const plugin = cap.Plugins && cap.Plugins.PaliaGoogleAuth;
    if (plugin && typeof plugin.signIn === 'function') return plugin;

    // Keep compatibility with builds that expose the modern registerPlugin API.
    if (typeof cap.registerPlugin === 'function') {
      return cap.registerPlugin('PaliaGoogleAuth');
    }

    throw new Error('Google sign-in service is not connected to this app build. Please update PaliaAPK HUB and try again.');
  }

  window.PaliaNativeGoogle = {
    async signIn() {
      const plugin = getPlugin();
      const result = await plugin.signIn();
      if (!result || !result.idToken) {
        throw new Error('Google did not return an ID token. Check the Google sign-in configuration.');
      }
      return result;
    }
  };
})();
