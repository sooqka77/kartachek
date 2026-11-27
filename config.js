/* Конфиг подключения к единому бэкенду geo-api (Timeweb Cloud Apps).
 * После деплоя sooqka77/geo-api просто впишите сюда ваш URL, например:
 *   backendUrl: 'https://sooqka77-geo-api-xxxx.twc1.net'
 * Также можно временно проверить любой URL, дописав в браузере ?api=https://...
 */
window.KARTA_CONFIG = {
  backendUrl: 'https://api.checkgeo.ru',
  metrikaId: null
};
(function () {
  try {
    var p = new URLSearchParams(window.location.search).get('api');
    if (p && /^https?:\/\//i.test(p)) {
      window.KARTA_CONFIG.backendUrl = p.replace(/\/+$/, '');
      sessionStorage.setItem('karta_api_override', window.KARTA_CONFIG.backendUrl);
    } else if (!window.KARTA_CONFIG.backendUrl) {
      var saved = sessionStorage.getItem('karta_api_override');
      if (saved) window.KARTA_CONFIG.backendUrl = saved;
    }
  } catch (_) {}
})();
