// ============================================================ SETTINGS (saved on the device)
const SETTINGS_KEY = 'nullrite.settings.v1';
const SETTINGS = { sfx: 0.8, ambience: 0.7, haptics: true, fps: false };
(function loadSettings() {
  try { const raw = typeof localStorage !== 'undefined' && localStorage.getItem(SETTINGS_KEY); if (raw) Object.assign(SETTINGS, JSON.parse(raw)); }
  catch (e) { /* defaults */ }
})();
function saveSettings() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* ignore */ } }
function hasSaveGame() { try { return typeof localStorage !== 'undefined' && !!localStorage.getItem(INV_SAVE_KEY); } catch (e) { return false; } }
