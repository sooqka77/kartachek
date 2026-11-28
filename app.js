/* UI-контроллер CheckGeo v3 — чистый 1-кнопочный поток + автосбор Яндекс Карт / 2ГИС / сайта */
(function () {
  'use strict';

  const STORAGE_KEY = 'checkgeo_state_v3';
  const $ = (id) => document.getElementById(id);

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtRub(n) {
    return Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function copyText(text, successMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(successMsg || 'Скопировано в буфер');
    } catch (_) {
      showToast('Не удалось скопировать — выделите текст вручную');
    }
  }

  /* =====================================================================
   * РЕЖИМ 1: АВТОНОМНЫЙ «УМНЫЙ ПОМОЩНИК ОТЗЫВА» ДЛЯ КЛИЕНТА (?review=...)
   * ===================================================================== */
  function initCustomerReviewMode(token) {
    const data = KartaEngine.decodePayload(token);
    $('main-app').classList.add('hidden');
    const root = $('review-helper-view');
    root.classList.remove('hidden');

    if (!data || !data.n) {
      root.innerHTML = `<div class="review-card"><h1>Ссылка устарела</h1><p style="margin-top:8px;color:var(--muted);">Попросите у администратора свежий QR-код или вернитесь на главную страницу.</p><div class="btn-row"><a class="btn btn-primary" href="./">Открыть CheckGeo</a></div></div>`;
      return;
    }

    const niche = KartaData.NICHES[data.k] || KartaData.NICHES.other;
    const yandexLink = /^\d+$/.test(data.y || '')
      ? `https://yandex.ru/maps/org/${data.y}/reviews/?add-review=true`
      : (data.y || '');
    const gisLink = /^\d+$/.test(data.g || '')
      ? `https://2gis.ru/firm/${data.g}/tab/reviews/addreview`
      : (data.g || '');
    const contactLink = (data.c || '').trim();

    document.title = `Оставить отзыв — ${data.n}`;

    let mood = 'good';
    const selectedTags = new Set([niche.reviewTags[0], niche.reviewTags[1]]);
    let customNote = '';

    function buildDraftText() {
      const picked = Array.from(selectedTags);
      const parts = [];
      if (picked.length === 1) {
        parts.push(`Очень понравилось в «${data.n}»: ${picked[0].toLowerCase()}.`);
      } else if (picked.length >= 2) {
        const last = picked[picked.length - 1].toLowerCase();
        const rest = picked.slice(0, -1).map(t => t.toLowerCase()).join(', ');
        parts.push(`Отличные впечатления от «${data.n}» — ${rest} и ${last}.`);
      } else {
        parts.push(`Остались очень довольны визитом в «${data.n}»!`);
      }
      if (customNote.trim()) parts.push(customNote.trim());
      parts.push('Смело рекомендуем!');
      return parts.join(' ');
    }

    function renderHelper() {
      const draft = buildDraftText();
      const mapButtons = [];
      if (yandexLink) mapButtons.push(`<button type="button" class="btn btn-primary" style="width:100%;" data-open-map="${esc(yandexLink)}">Скопировать текст и открыть Яндекс Карты ↗</button>`);
      if (gisLink) mapButtons.push(`<button type="button" class="btn btn-dark" style="width:100%;" data-open-map="${esc(gisLink)}">Скопировать текст и открыть 2ГИС ↗</button>`);
      if (!mapButtons.length) mapButtons.push(`<button type="button" class="btn btn-primary" style="width:100%;" id="btn-only-copy">Скопировать текст отзыва</button>`);

      root.innerHTML = `
        <div class="review-card">
          <span class="eyebrow">Быстрый отзыв за 30 секунд</span>
          <h1>Как прошёл ваш визит в «${esc(data.n)}»?</h1>
          <div class="mood-grid">
            <button type="button" class="mood-btn ${mood === 'good' ? 'active' : ''}" data-mood="good">⭐ Всё отлично</button>
            <button type="button" class="mood-btn ${mood === 'issue' ? 'active' : ''}" data-mood="issue">💬 Есть замечание</button>
          </div>
          ${mood === 'good' ? `
            <p class="hint">Нажмите 2–3 пункта, что понравилось — мы соберём черновик, который можно поправить:</p>
            <div class="tag-cloud">
              ${niche.reviewTags.map(t => `<button type="button" class="tag-btn ${selectedTags.has(t) ? 'selected' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label for="rh-extra">Хотите добавить деталь? (необязательно)</label>
              <input type="text" id="rh-extra" placeholder="Например: имя мастера/педагога или любимая услуга" value="${esc(customNote)}">
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label for="rh-draft">Готовый текст отзыва (можно отредактировать)</label>
              <textarea id="rh-draft" rows="3">${esc(draft)}</textarea>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">${mapButtons.join('')}</div>
          ` : `
            <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;margin-bottom:14px;">
              <p style="font-weight:700;margin-bottom:6px;">Спасибо, что говорите прямо!</p>
              <p style="font-size:13.5px;color:var(--muted);">Напишите руководителю напрямую — так мы сможем разобраться и исправить ситуацию в тот же день.</p>
            </div>
            ${contactLink ? `<a class="btn btn-dark" style="width:100%;margin-bottom:10px;" href="${esc(contactLink)}" target="_blank" rel="noopener">Написать руководителю напрямую ↗</a>`
              : `<p class="hint" style="margin-bottom:10px;">Передайте замечание администратору точки — мы обязательно всё исправим.</p>`}
            ${(yandexLink || gisLink) ? `<p class="hint" style="text-align:center;margin-top:8px;">Вы также можете оставить публичный отзыв: ${yandexLink ? `<a href="${esc(yandexLink)}" target="_blank" rel="noopener">Яндекс Карты</a>` : ''}${(yandexLink && gisLink) ? ' · ' : ''}${gisLink ? `<a href="${esc(gisLink)}" target="_blank" rel="noopener">2ГИС</a>` : ''}</p>` : ''}
          `}
          <p class="hint" style="text-align:center;margin-top:18px;font-size:12px;">Сделано в <a href="./">CheckGeo</a> · Честные отзывы реальных клиентов</p>
        </div>
      `;

      root.querySelectorAll('[data-mood]').forEach(btn => btn.addEventListener('click', () => { mood = btn.getAttribute('data-mood'); renderHelper(); }));
      root.querySelectorAll('[data-tag]').forEach(btn => btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-tag');
        if (selectedTags.has(t)) selectedTags.delete(t); else selectedTags.add(t);
        renderHelper();
      }));
      const extraInput = $('rh-extra');
      if (extraInput) {
        extraInput.addEventListener('input', () => {
          customNote = extraInput.value;
          const draftEl = $('rh-draft');
          if (draftEl) draftEl.value = buildDraftText();
        });
      }
      root.querySelectorAll('[data-open-map]').forEach(btn => btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-open-map');
        const txt = ($('rh-draft') && $('rh-draft').value) || buildDraftText();
        await copyText(txt, 'Текст скопирован! Вставьте его в форму отзыва');
        window.open(url, '_blank', 'noopener');
      }));
      const onlyCopy = $('btn-only-copy');
      if (onlyCopy) onlyCopy.addEventListener('click', () => copyText(($('rh-draft') && $('rh-draft').value) || buildDraftText(), 'Текст отзыва скопирован!'));
    }

    renderHelper();
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('review')) {
    initCustomerReviewMode(urlParams.get('review'));
    return;
  }

  /* =====================================================================
   * РЕЖИМ 2: ОСНОВНОЕ ПРИЛОЖЕНИЕ CHECKGEO v3 (ФОКУСНЫЙ ПОТОК)
   * ===================================================================== */
  function createBlankPoint() {
    return {
      id: 'pt-' + Date.now(),
      isDemo: false,
      name: '',
      niche: 'other',
      city: '',
      district: '',
      yandexUrl: '',
      gisUrl: '',
      siteUrl: '',
      tgContact: '',
      rating: 4.7,
      reviewsCount: 18,
      recentReviews30d: 1,
      replyRate: 40,
      photosCount: 20,
      verified: false,
      rubricMatchesLeaders: false,
      servicesUpdated: false,
      hasOnlineBooking: false,
      hasNewsStories: false,
      hasCompetitorAds: false,
      hasDuplicates: false,
      hasOwnerAccess: true,
      has2gisSynced: false,
      hasOtherDirs: false,
      leaderRating: 5.0,
      leaderReviews: 90,
      avgCheck: 5000,
      ltvMonths: 6,
      monthlyDemand: 1000,
      doneSteps: {},
      lookupNotice: '',
      lookupOk: false
    };
  }

  function defaultState() {
    return {
      hasRunCheck: false,
      point: createBlankPoint(),
      findingFilter: 'all',
      activeProTab: 'qr',
      qrMode: 'helper',
      tentTheme: 'yellow',
      tentCta: 'Понравилось у нас? Поделитесь за 30 секунд!',
      shortScriptLink: true
    };
  }

  function loadState() {
    let st = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.point && !parsed.point.isDemo && (parsed.point.name || parsed.point.yandexUrl)) {
          st = Object.assign(st, parsed);
          st.point = Object.assign(createBlankPoint(), parsed.point);
        }
      }
    } catch (_) {}

    if (window.location.hash && window.location.hash.startsWith('#share=')) {
      const payload = KartaEngine.decodePayload(window.location.hash.slice(7));
      if (payload && payload.name) {
        st.point = Object.assign(createBlankPoint(), payload, { isDemo: false });
        st.hasRunCheck = true;
        history.replaceState(null, '', window.location.pathname + window.location.search);
        setTimeout(() => showToast(`Открыт отчёт по точке «${payload.name}»`), 300);
      }
    }
    return st;
  }

  let state = loadState();

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function getPoint() {
    if (!state.point) state.point = createBlankPoint();
    if (!state.point.doneSteps) state.point.doneSteps = {};
    return state.point;
  }

  function getBackendUrl() {
    return (window.KARTA_CONFIG && window.KARTA_CONFIG.backendUrl)
      ? window.KARTA_CONFIG.backendUrl.replace(/\/+$/, '')
      : '';
  }

  function trackEvent(event, meta) {
    const api = getBackendUrl();
    if (!api) return;
    try {
      fetch(`${api}/api/telemetry/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'kartachek', event, meta: meta || {} }),
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }

  function syncTapChipsVisual() {
    document.querySelectorAll('.tap-chip').forEach(lbl => {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) lbl.classList.toggle('checked', cb.checked);
    });
  }

  function initStaticControls() {
    $('f-niche').innerHTML = Object.values(KartaData.NICHES)
      .map(n => `<option value="${esc(n.id)}">${esc(n.label)}</option>`)
      .join('');
  }

  function populateFormFromPoint(pt) {
    $('quick-url').value = pt.yandexUrl || pt.gisUrl || '';
    $('quick-name').value = [pt.name, pt.city].filter(Boolean).join(', ');
    $('quick-site').value = pt.siteUrl || '';

    $('f-name').value = pt.name || '';
    $('f-niche').value = pt.niche || 'other';
    $('f-city').value = pt.city || '';
    $('f-district').value = pt.district || '';
    $('f-yandex-url').value = pt.yandexUrl || '';
    $('f-gis-url').value = pt.gisUrl || '';
    $('f-site-url').value = pt.siteUrl || '';
    $('f-rating').value = pt.rating != null ? pt.rating : '';
    $('f-reviews').value = pt.reviewsCount != null ? pt.reviewsCount : '';
    $('f-recent30').value = pt.recentReviews30d != null ? pt.recentReviews30d : '';
    $('f-reply-rate').value = pt.replyRate != null ? pt.replyRate : '';
    $('f-photos').value = pt.photosCount != null ? pt.photosCount : '';
    $('f-leader-reviews').value = pt.leaderReviews != null ? pt.leaderReviews : '';
    $('f-check').value = pt.avgCheck != null ? pt.avgCheck : '';
    $('f-tg').value = pt.tgContact || '';

    $('c-verified').checked = !!pt.verified;
    $('c-rubric').checked = !!pt.rubricMatchesLeaders;
    $('c-services').checked = !!pt.servicesUpdated;
    $('c-booking').checked = !!pt.hasOnlineBooking;
    $('c-news').checked = !!pt.hasNewsStories;
    $('c-owner').checked = !!pt.hasOwnerAccess;
    $('c-2gis').checked = !!pt.has2gisSynced;
    $('c-dirs').checked = !!pt.hasOtherDirs;
    $('c-comp-ads').checked = !!pt.hasCompetitorAds;
    $('c-dupes').checked = !!pt.hasDuplicates;
    syncTapChipsVisual();
  }

  function syncPointFromManualForm() {
    const pt = getPoint();
    const niche = KartaData.NICHES[$('f-niche').value] || KartaData.NICHES.other;
    pt.isDemo = false;
    pt.name = $('f-name').value.trim();
    pt.niche = niche.id;
    pt.city = $('f-city').value.trim() || 'Москва';
    pt.district = $('f-district').value.trim();
    pt.yandexUrl = $('f-yandex-url').value.trim();
    pt.gisUrl = $('f-gis-url').value.trim();
    pt.siteUrl = $('f-site-url').value.trim();
    pt.tgContact = $('f-tg').value.trim();
    pt.rating = Math.min(5, Math.max(0, parseFloat($('f-rating').value) || 0));
    pt.reviewsCount = Math.max(0, parseInt($('f-reviews').value, 10) || 0);
    pt.recentReviews30d = Math.max(0, parseInt($('f-recent30').value, 10) || 0);
    pt.replyRate = Math.min(100, Math.max(0, parseInt($('f-reply-rate').value, 10) || 0));
    pt.photosCount = Math.max(0, parseInt($('f-photos').value, 10) || 0);
    pt.leaderReviews = Math.max(1, parseInt($('f-leader-reviews').value, 10) || niche.defaultLeaderReviews);
    pt.avgCheck = Math.max(100, parseInt($('f-check').value, 10) || niche.defaultCheck);
    pt.ltvMonths = niche.defaultLtvMonths;
    pt.monthlyDemand = niche.defaultMonthlyDemand;

    pt.verified = $('c-verified').checked;
    pt.rubricMatchesLeaders = $('c-rubric').checked;
    pt.servicesUpdated = $('c-services').checked;
    pt.hasOnlineBooking = $('c-booking').checked;
    pt.hasNewsStories = $('c-news').checked;
    pt.hasOwnerAccess = $('c-owner').checked;
    pt.has2gisSynced = $('c-2gis').checked;
    pt.hasOtherDirs = $('c-dirs').checked;
    pt.hasCompetitorAds = $('c-comp-ads').checked;
    pt.hasDuplicates = $('c-dupes').checked;
    syncTapChipsVisual();
    saveState();
    return pt;
  }

  async function runOneClickCardCheck() {
    const errEl = $('form-error');
    errEl.classList.add('hidden');

    const rawUrlOrText = ($('quick-url').value || '').trim();
    const rawNameCity = ($('quick-name').value || '').trim();
    let rawSite = ($('quick-site').value || '').trim();

    if (!rawUrlOrText && !rawNameCity && !rawSite) {
      errEl.textContent = 'Вставьте ссылку на Яндекс Карты / 2ГИС или введите название компании и город.';
      errEl.classList.remove('hidden');
      $('quick-url').focus();
      return;
    }

    const pt = createBlankPoint();

    // Если пользователь вставил в поле ссылки целиком скопированный текст карточки — парсим его!
    if (rawUrlOrText.length > 140 || /\n/.test(rawUrlOrText)) {
      const parsed = KartaEngine.parsePastedCardText(rawUrlOrText);
      if (parsed.detected) Object.assign(pt, parsed.patch);
    } else if (/yandex\./i.test(rawUrlOrText)) {
      pt.yandexUrl = /^https?:\/\//i.test(rawUrlOrText) ? rawUrlOrText : 'https://' + rawUrlOrText;
    } else if (/2gis\./i.test(rawUrlOrText)) {
      pt.gisUrl = /^https?:\/\//i.test(rawUrlOrText) ? rawUrlOrText : 'https://' + rawUrlOrText;
    } else if (rawUrlOrText && /\.[a-zа-яё]{2,}/i.test(rawUrlOrText) && !rawSite) {
      rawSite = rawUrlOrText;
    } else if (rawUrlOrText && !rawNameCity) {
      pt.name = rawUrlOrText;
    }

    if (rawNameCity) {
      const parts = rawNameCity.split(',').map(s => s.trim()).filter(Boolean);
      if (!pt.name && parts[0]) pt.name = parts[0];
      if (parts.length > 1) pt.city = parts[1];
      if (parts.length > 2) pt.district = parts.slice(2).join(', ');
    }
    if (rawSite) {
      pt.siteUrl = /^https?:\/\//i.test(rawSite) ? rawSite : 'https://' + rawSite;
    }

    const btn = $('btn-check-card-now');
    btn.disabled = true;
    btn.textContent = 'Проверяем карточку на картах и сайте...';
    const chips = [];

    const api = getBackendUrl();
    if (api && (pt.yandexUrl || pt.name || pt.siteUrl)) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 16000);
        const r = await fetch(`${api}/api/geo/lookup`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yandexUrl: pt.yandexUrl,
            query: pt.name,
            city: pt.city,
            district: pt.district,
            niche: pt.niche,
            siteUrl: pt.siteUrl
          })
        });
        clearTimeout(t);
        const data = await r.json();
        if (r.ok && data.ok) {
          if (data.yandexCard && data.yandexCard.ok) {
            const m = data.yandexCard.meta || {};
            const sem = data.yandexCard.semantics || {};
            if (m.title && !pt.name) pt.name = m.title;
            if (m.address && !pt.district) pt.district = m.address;
            if (m.rating != null) pt.rating = Number(m.rating);
            if (m.reviewCount != null) pt.reviewsCount = Number(m.reviewCount);
            if (sem.recent30d != null) pt.recentReviews30d = Number(sem.recent30d);
            if (sem.replyRate != null) pt.replyRate = Number(sem.replyRate);
            if (m.photoCount != null) pt.photosCount = Number(m.photoCount);
            if (m.hasBooking) pt.hasOnlineBooking = true;
            if (m.hasCompetitorAds) pt.hasCompetitorAds = true;
            if (m.hasGoodPlace) pt.verified = true;
            if (!pt.siteUrl && Array.isArray(m.urls) && m.urls[0]) pt.siteUrl = m.urls[0];
            pt.lookupOk = true;
            pt.lookupNotice = `Данные загружены прямо с Яндекс Карт: рейтинг ${pt.rating}, ${pt.reviewsCount} отзывов (${pt.recentReviews30d} за 30 дней), ответы ${pt.replyRate}%.`;
            chips.push(`✓ Яндекс Карты: ${pt.rating} ★ · ${pt.reviewsCount} отз.`);
          } else if (pt.yandexUrl && data.yandexCard && data.yandexCard.captchaBlocked) {
            pt.lookupOk = false;
            pt.lookupNotice = 'Яндекс Карты запросили капчу при авточтении — QR-код уже готов, а для точного индекса уточните 4 цифры ниже или вставьте текст карточки.';
            chips.push('⚠ Яндекс запросил капчу — можно уточнить цифры вручную');
          } else if (!pt.yandexUrl) {
            pt.lookupOk = false;
            pt.lookupNotice = 'Показана базовая оценка — чтобы подтянуть точный рейтинг, отзывы и готовый QR-код, добавьте ссылку на Яндекс Карты или уточните 4 цифры в блоке ниже.';
          }

          if (data.twogis) {
            pt.has2gisSynced = true;
            if (data.twogis.gisUrl && !pt.gisUrl) pt.gisUrl = data.twogis.gisUrl;
            if (data.twogis.address && !pt.district) pt.district = data.twogis.address;
            chips.push(`✓ 2ГИС: ${data.twogis.rating || '—'} ★`);
          }

          if (data.siteReport) {
            const sr = data.siteReport;
            chips.push(sr.https ? `✓ Сайт HTTPS` : '⚠ Сайт без HTTPS');
            if (sr.links?.yandexUrl && !pt.yandexUrl) { pt.yandexUrl = sr.links.yandexUrl; chips.push('✓ Найдена карточка Яндекс Карт'); }
            if (sr.links?.gisUrl && !pt.gisUrl) { pt.gisUrl = sr.links.gisUrl; pt.has2gisSynced = true; chips.push('✓ Найден 2ГИС'); }
            if (sr.links?.zoonUrl || sr.links?.otzovikUrl || sr.links?.irecommendUrl) { pt.hasOtherDirs = true; chips.push('✓ Найдены отзовики'); }
            if (sr.links?.tgUrl && !pt.tgContact) pt.tgContact = sr.links.tgUrl;
          }
        }
      } catch (_) {
        pt.lookupNotice = 'Показан быстрый расчёт — вы можете уточнить рейтинг, отзывы и фото в блоке ниже.';
      }
    }

    if (!pt.name) pt.name = 'Ваша точка';
    if (!pt.city) pt.city = 'Москва';
    state.point = pt;
    state.hasRunCheck = true;
    saveState();
    populateFormFromPoint(pt);
    renderAll();

    $('paste-signals').innerHTML = chips.map(s => `<span class="sig-chip ${s.startsWith('⚠') ? 'warn' : ''}">${esc(s)}</span>`).join('');
    btn.disabled = false;
    btn.textContent = 'Проверить карточку бесплатно →';
    showToast('Проверка карточки готова!');
    $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderFindingsList(items) {
    if (!items.length) return '<p class="hint">В этой категории пунктов нет.</p>';
    return items.map(f => {
      const tagLabel = f.level === 'red' ? 'Критично' : f.level === 'yellow' ? 'Улучшить' : 'Хорошо';
      return `
        <div class="finding ${f.level}">
          <span class="f-tag ${f.level}">${tagLabel}</span>
          <div>
            <h4>${esc(f.title)}</h4>
            <p class="f-why">${esc(f.why)}</p>
            <div class="f-fix"><b>Что сделать:</b> ${esc(f.fix)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function getQrTargetUrl(pt, audit) {
    const basePage = window.location.origin === 'null' || window.location.protocol === 'file:'
      ? 'https://checkgeo.ru/'
      : (window.location.origin + window.location.pathname);
    if (state.qrMode === 'yandex') return audit.urls.yandexDirectReviewUrl || 'https://yandex.ru/maps/';
    if (state.qrMode === 'gis') return audit.urls.gisDirectReviewUrl || 'https://2gis.ru/';
    return KartaEngine.buildReviewHelperUrl(basePage, pt);
  }

  function renderQrStudio(pt, audit) {
    const targetUrl = getQrTargetUrl(pt, audit);
    $('qr-target-url').textContent = targetUrl;
    $('tent-biz-name').textContent = pt.name || 'Ваша точка';
    $('tent-cta-preview').textContent = state.tentCta;

    const tentEl = $('tent-preview');
    tentEl.className = 'tent-preview theme-' + (state.tentTheme || 'yellow');
    $('tent-themes').querySelectorAll('[data-tent-theme]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tent-theme') === (state.tentTheme || 'yellow'));
    });

    try {
      $('tent-qr-svg').innerHTML = KartaQR.toSVG(targetUrl, { sizePx: 196, quietZone: 4 });
    } catch (e) {
      $('tent-qr-svg').innerHTML = `<p class="hint" style="color:var(--pin);padding:16px;">${esc(e.message)}</p>`;
    }

    const chatLink = (state.shortScriptLink && audit.urls.yandexDirectReviewUrl)
      ? audit.urls.yandexDirectReviewUrl
      : targetUrl;

    const scripts = [
      { title: '1. Вслух на ресепшене / после визита', text: audit.niche.scripts.live },
      { title: '2. Сообщение в WhatsApp / Telegram через 2 часа', text: audit.niche.scripts.messenger },
      { title: '3. Пост в общий чат клиентов / родителей', text: audit.niche.scripts.chat }
    ].map(s => ({
      title: s.title,
      text: s.text.replace(/\[Название\]/g, pt.name || 'нашу точку').replace(/\[ССЫЛКА\]/g, chatLink)
    }));

    $('scripts-container').innerHTML = scripts.map((s, i) => `
      <div class="copy-block">
        <div class="copy-block-head">
          <strong>${esc(s.title)}</strong>
          <button type="button" class="btn btn-outline btn-sm" data-copy-script="${i}">Копировать</button>
        </div>
        <div class="copy-text">${esc(s.text)}</div>
      </div>
    `).join('');

    $('scripts-container').querySelectorAll('[data-copy-script]').forEach(btn => {
      btn.addEventListener('click', () => copyText(scripts[parseInt(btn.getAttribute('data-copy-script'), 10)].text, 'Скрипт скопирован!'));
    });
  }

  function renderReplies(pt, audit) {
    const res = KartaEngine.generateReviewReplies({
      reviewText: $('rep-text').value || 'Отличный специалист, всё подробно объяснили, очень понравилось!',
      clientName: $('rep-client').value,
      tone: $('rep-tone').value,
      businessName: pt.name,
      serviceKeyword: $('rep-kw').value || audit.niche.seoKeywords[0],
      district: pt.district,
      contactInfo: pt.tgContact || 'по телефону точки'
    });
    const toneName = res.tone === 'negative' ? 'Негативный' : res.tone === 'neutral' ? 'Смешанный' : 'Позитивный';
    $('replies-output').innerHTML = `<p class="hint" style="margin-bottom:8px;">Тональность: <b>${toneName}</b></p>` +
      res.variants.map((v, idx) => `
        <div class="copy-block">
          <div class="copy-block-head">
            <strong>Вариант ${idx + 1}: ${esc(v.style)}</strong>
            <button type="button" class="btn btn-outline btn-sm" data-copy-reply="${idx}">Копировать</button>
          </div>
          <div class="copy-text">${esc(v.text)}</div>
        </div>
      `).join('');

    $('replies-output').querySelectorAll('[data-copy-reply]').forEach(btn => {
      btn.addEventListener('click', () => copyText(res.variants[parseInt(btn.getAttribute('data-copy-reply'), 10)].text, 'Ответ скопирован!'));
    });
  }

  function renderProTools(pt, audit) {
    const svcs = (audit.niche.serviceTemplates || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    $('services-template-text').textContent = svcs;

    const tc = audit.titleCheck;
    $('title-compliance-box').innerHTML = tc.ok
      ? `<div class="finding green" style="grid-template-columns:1fr;"><div><h4>✓ Название «${esc(pt.name)}» безопасно</h4><p class="f-why">Соответствует правилам Яндекс Бизнеса и 2ГИС.</p></div></div>`
      : `<div class="finding red" style="grid-template-columns:1fr;"><div><h4>⚠ Есть риск блокировки правок</h4><ul style="margin:6px 0;padding-left:18px;font-size:13px;">${tc.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul><div class="f-fix"><b>Безопасный вариант:</b> ${esc(tc.cleanSuggestion)}</div></div></div>`;

    const utms = KartaEngine.buildUtmLinks(pt.siteUrl);
    $('utm-output').innerHTML = utms.length
      ? utms.map((u, idx) => `
          <div class="copy-block" style="padding:9px 11px;">
            <div class="copy-block-head">
              <strong>${esc(u.label)}</strong>
              <button type="button" class="btn btn-outline btn-sm" data-copy-utm="${idx}">Копировать</button>
            </div>
            <div class="mono" style="font-size:11.5px;word-break:break-all;color:var(--muted);">${esc(u.url)}</div>
          </div>
        `).join('')
      : `<p class="hint">Укажите сайт выше — здесь появятся готовые UTM-ссылки.</p>`;

    $('utm-output').querySelectorAll('[data-copy-utm]').forEach(btn => {
      btn.addEventListener('click', () => copyText(utms[parseInt(btn.getAttribute('data-copy-utm'), 10)].url, 'UTM-ссылка скопирована!'));
    });

    const q = encodeURIComponent(`${pt.name || ''} ${pt.city || ''}`.trim() || 'ваша компания');
    const dirs = [
      { name: 'Zoon.ru', desc: 'Один из главных источников локального SEO и нейросетей.', url: `https://zoon.ru/search/?q=${q}` },
      { name: 'Отзовик.ру', desc: 'Часто стоит в топ-3 Яндекса по запросу «[бренд] отзывы».', url: `https://otzovik.com/?search_text=${q}` },
      { name: 'IRecommend', desc: 'Сильный траст у поисковиков и ИИ по услугам.', url: `https://irecommend.ru/srch?query=${q}` }
    ];
    $('ext-dirs-strip').innerHTML = dirs.map(d => `
      <div class="dir-box">
        <div><strong>${esc(d.name)}</strong><p style="margin-top:3px;">${esc(d.desc)}</p></div>
        <a class="btn btn-outline btn-sm" href="${d.url}" target="_blank" rel="noopener">Проверить ↗</a>
      </div>
    `).join('');

    const doneMap = pt.doneSteps || {};
    $('plan-14-list').innerHTML = audit.plan14.map(step => {
      const done = !!doneMap[step.id];
      return `
        <label class="plan-item ${done ? 'done' : ''}">
          <input type="checkbox" data-plan-step="${esc(step.id)}" ${done ? 'checked' : ''}>
          <div>
            <span class="plan-day">${esc(step.day)} · ${esc(step.pillar)}</span>
            <div style="font-weight:700;font-size:14.5px;">${esc(step.title)}</div>
            <div style="font-size:13.5px;color:var(--muted);margin-top:2px;">${esc(step.action)}</div>
          </div>
        </label>
      `;
    }).join('');

    $('plan-14-list').querySelectorAll('[data-plan-step]').forEach(cb => {
      cb.addEventListener('change', () => {
        pt.doneSteps[cb.getAttribute('data-plan-step')] = cb.checked;
        saveState();
        renderProTools(pt, audit);
      });
    });
  }

  function renderAll() {
    const ws = $('results-workspace');
    ws.classList.toggle('hidden', !state.hasRunCheck);
    if (!state.hasRunCheck) return;

    const pt = getPoint();
    const safePt = Object.assign({}, pt, { name: pt.name || 'Ваша точка' });
    const audit = KartaEngine.runCardAudit(safePt);

    const notice = $('lookup-banner');
    if (pt.lookupNotice) {
      notice.className = 'info-strip no-print' + (pt.lookupOk ? ' ok' : '');
      notice.innerHTML = `<span>${esc(pt.lookupNotice)}</span>${pt.lookupOk ? '' : '<button type="button" class="btn btn-outline btn-sm" id="btn-open-tune-inline">Уточнить цифры ▾</button>'}`;
      notice.classList.remove('hidden');
      const tuneBtn = $('btn-open-tune-inline');
      if (tuneBtn) tuneBtn.addEventListener('click', () => { $('manual-drawer').open = true; $('f-rating').focus(); });
    } else {
      notice.classList.add('hidden');
    }

    $('yandex-url-hint').textContent = audit.urls.yandexOrgId
      ? `✓ Найден ID ${audit.urls.yandexOrgId} — прямая ссылка на отзыв готова`
      : 'Вставьте ссылку из браузера (/maps/org/.../ID/)';
    $('gis-url-hint').textContent = audit.urls.gisFirmId
      ? `✓ Найден 2ГИС ID ${audit.urls.gisFirmId} — ссылка готова`
      : 'Для QR-стенда и отзывов 2ГИС';

    $('res-point-title').textContent = safePt.name + (safePt.district ? ` · ${safePt.district}` : (safePt.city ? ` · ${safePt.city}` : ''));
    $('res-score').textContent = audit.totalScore;
    const badge = $('res-status-badge');
    badge.textContent = audit.status.label;
    badge.className = 'status-badge ' + audit.status.code;
    $('res-summary').textContent = audit.status.summary;

    const arc = $('gauge-arc');
    arc.style.strokeDashoffset = (314.16 * (1 - audit.totalScore / 100)).toFixed(1);
    arc.style.stroke = audit.status.code === 'good' ? '#15803D' : audit.status.code === 'mid' ? '#D97706' : '#B91C1C';

    $('res-traffic-counts').innerHTML = `
      <span class="t-pill red">● ${audit.counts.red} критично</span>
      <span class="t-pill yellow">● ${audit.counts.yellow} улучшить</span>
      <span class="t-pill green">● ${audit.counts.green} ок</span>
    `;

    $('res-pillars').innerHTML = audit.pillars.map(pl => {
      const pct = Math.round((pl.score / pl.max) * 100);
      const cls = pct >= 75 ? 'good' : pct >= 45 ? 'mid' : 'bad';
      return `
        <div class="pillar-row">
          <span>${esc(pl.label)}</span>
          <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
          <span class="mono" style="text-align:right;font-weight:700;">${pl.score}/${pl.max}</span>
        </div>
      `;
    }).join('');

    const topIssues = audit.findings.filter(f => f.level !== 'green').slice(0, 3);
    $('top-findings').innerHTML = renderFindingsList(topIssues.length ? topIssues : audit.findings.slice(0, 3));
    $('all-findings-label').textContent = `Показать все ${audit.findings.length} пунктов аудита (критично: ${audit.counts.red}, улучшить: ${audit.counts.yellow})`;

    const filtered = state.findingFilter === 'all' ? audit.findings : audit.findings.filter(f => f.level === state.findingFilter);
    $('res-findings').innerHTML = renderFindingsList(filtered);

    const c = audit.competitor;
    $('comp-desc').textContent = c.reviewGap === 0
      ? 'По числу отзывов вы на уровне лидера района — удерживайте регулярный поток!'
      : `Чтобы догнать лидера (${c.leaderReviews} отзывов), нужен белый поток ~${c.recommendedPace} отзывов в месяц.`;
    $('comp-stats').innerHTML = `
      <div class="stat-box"><span class="k">Ваши отзывы</span><span class="v">${safePt.reviewsCount}</span></div>
      <div class="stat-box"><span class="k">Лидер района</span><span class="v">${c.leaderReviews}</span></div>
      <div class="stat-box highlight"><span class="k">Разрыв</span><span class="v">−${c.reviewGap}</span></div>
      <div class="stat-box"><span class="k">Срок догона</span><span class="v">${c.monthsToCatch ? c.monthsToCatch + ' мес' : 'В топе'}</span></div>
    `;

    const r = audit.roi;
    $('roi-check-slider').value = Math.min(25000, Math.max(500, r.avgCheck));
    $('roi-check-label').textContent = fmtRub(r.avgCheck);
    $('roi-stats').innerHTML = `
      <div class="stat-box"><span class="k">Упущено обращений/мес</span><span class="v">~${r.missedLeadsMonth}</span></div>
      <div class="stat-box"><span class="k">Упущено клиентов/мес</span><span class="v">~${r.missedClientsMonth}</span></div>
      <div class="stat-box highlight"><span class="k">Потеря в 1-й месяц</span><span class="v">${fmtRub(r.missedFirstMonthRev)}</span></div>
      <div class="stat-box"><span class="k">Потеря с учётом LTV</span><span class="v">${fmtRub(r.missedLtvRev)}</span></div>
    `;

    renderQrStudio(safePt, audit);
    if (!$('rep-kw').value && audit.niche.seoKeywords[0]) $('rep-kw').placeholder = audit.niche.seoKeywords[0];
    $('appeal-text').textContent = KartaEngine.generateAppealTemplate(safePt.name, '[дата и имя автора]');
    if (!$('replies-output').innerHTML) renderReplies(safePt, audit);
    renderProTools(safePt, audit);
  }

  function runSmartPaste(rawText) {
    const parsed = KartaEngine.parsePastedCardText(rawText);
    const sigWrap = $('paste-signals');
    if (!parsed.detected) {
      sigWrap.innerHTML = `<span class="sig-chip warn">Мало данных — откройте карточку на Яндекс Картах или 2ГИС, нажмите Cmd/Ctrl+A → C и вставьте целиком.</span>`;
      return false;
    }
    const pt = Object.assign(createBlankPoint(), parsed.patch, {
      isDemo: false,
      lookupOk: true,
      lookupNotice: 'Карточка распознана из вставленного текста — все цифры и QR-код обновлены.'
    });
    state.point = pt;
    state.hasRunCheck = true;
    saveState();
    populateFormFromPoint(pt);
    renderAll();
    sigWrap.innerHTML = parsed.signals.map(s => `<span class="sig-chip ${s.startsWith('⚠') ? 'warn' : ''}">${esc(s)}</span>`).join('');
    showToast('Карточка распознана — результаты ниже!');
    setTimeout(() => $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
    return true;
  }

  function bindEvents() {
    $('quick-check-form').addEventListener('submit', (e) => {
      e.preventDefault();
      runOneClickCardCheck();
    });

    $('btn-toggle-paste').addEventListener('click', () => {
      const box = $('paste-box-wrap');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) $('smart-paste-input').focus();
    });

    $('btn-toggle-manual').addEventListener('click', () => {
      state.hasRunCheck = true;
      saveState();
      renderAll();
      $('manual-drawer').open = true;
      $('manual-drawer').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('f-name').focus();
    });

    $('smart-paste-input').addEventListener('paste', () => {
      setTimeout(() => {
        const val = $('smart-paste-input').value;
        if (val && val.trim().length > 20) runSmartPaste(val);
      }, 30);
    });
    $('btn-parse-paste').addEventListener('click', () => runSmartPaste($('smart-paste-input').value));
    $('btn-paste-clipboard').addEventListener('click', async () => {
      try {
        const clip = await navigator.clipboard.readText();
        if (!clip || !clip.trim()) { showToast('Буфер пуст — сначала скопируйте страницу карточки'); return; }
        $('smart-paste-input').value = clip;
        runSmartPaste(clip);
      } catch (_) {
        $('smart-paste-input').focus();
        showToast('Нажмите Cmd+V (или Ctrl+V) прямо в поле выше');
      }
    });

    $('btn-new-check').addEventListener('click', () => {
      state.point = createBlankPoint();
      state.hasRunCheck = false;
      saveState();
      populateFormFromPoint(state.point);
      $('paste-signals').innerHTML = '';
      renderAll();
      $('quick-url').focus();
      $('smart-input-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('audit-form').addEventListener('input', () => { syncPointFromManualForm(); renderAll(); });
    $('audit-form').addEventListener('change', () => { syncPointFromManualForm(); renderAll(); });

    $('roi-check-slider').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 5000;
      getPoint().avgCheck = val;
      $('f-check').value = val;
      saveState();
      renderAll();
    });

    $('btn-open-yandex-serp').addEventListener('click', () => {
      const pt = getPoint();
      const niche = KartaData.NICHES[pt.niche] || KartaData.NICHES.other;
      const q = `${niche.primaryRubrics[0]} ${pt.city || ''} ${pt.district || ''}`.trim();
      window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(q)}`, '_blank', 'noopener');
    });

    $('btn-share-report').addEventListener('click', () => {
      const pt = Object.assign({}, getPoint());
      delete pt.id;
      const base = window.location.origin + window.location.pathname;
      copyText(`${base}#share=${KartaEngine.encodePayload(pt)}`, 'Ссылка на отчёт скопирована!');
    });

    $('btn-print-report').addEventListener('click', () => {
      document.body.classList.remove('print-tent-only');
      window.print();
    });

    $('findings-filters').querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.findingFilter = btn.getAttribute('data-filter');
        $('findings-filters').querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
        renderAll();
      });
    });

    $('pro-tabs').querySelectorAll('[data-pro-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-pro-tab');
        state.activeProTab = tab;
        $('pro-tabs').querySelectorAll('[data-pro-tab]').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.pro-pane').forEach(p => p.classList.toggle('hidden', p.id !== 'pro-pane-' + tab));
      });
    });

    $('qr-mode').addEventListener('change', (e) => { state.qrMode = e.target.value; saveState(); renderAll(); });
    $('tent-cta').addEventListener('input', (e) => { state.tentCta = e.target.value; saveState(); $('tent-cta-preview').textContent = state.tentCta; });
    $('c-short-script-link').addEventListener('change', (e) => { state.shortScriptLink = e.target.checked; saveState(); renderAll(); });
    $('tent-themes').querySelectorAll('[data-tent-theme]').forEach(btn => {
      btn.addEventListener('click', () => { state.tentTheme = btn.getAttribute('data-tent-theme'); saveState(); renderAll(); });
    });

    $('btn-copy-qr-url').addEventListener('click', () => copyText($('qr-target-url').textContent, 'Ссылка скопирована!'));
    $('btn-shorten-clck').addEventListener('click', () => {
      const target = $('qr-target-url').textContent;
      copyText(target, 'Ссылка скопирована — открываем clck.ru!');
      window.open(`https://clck.ru/?url=${encodeURIComponent(target)}`, '_blank', 'noopener');
    });
    $('btn-open-helper-preview').addEventListener('click', () => {
      const pt = Object.assign({}, getPoint(), { name: getPoint().name || 'Ваша точка' });
      const url = getQrTargetUrl(pt, KartaEngine.runCardAudit(pt));
      window.open(url, '_blank', 'noopener');
    });
    $('btn-download-qr-png').addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      KartaQR.drawToCanvas(canvas, $('qr-target-url').textContent, { scale: 12, quietZone: 4 });
      const a = document.createElement('a');
      a.download = `qr-${(getPoint().name || 'tochka').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('QR-код сохранён в PNG');
    });
    $('btn-print-tent').addEventListener('click', () => {
      const slot = $('tent-print-slot');
      slot.innerHTML = $('tent-preview').outerHTML;
      document.body.classList.add('print-tent-only');
      window.print();
      setTimeout(() => { document.body.classList.remove('print-tent-only'); slot.innerHTML = ''; }, 300);
    });

    $('btn-gen-replies').addEventListener('click', async () => {
      const safe = Object.assign({}, getPoint(), { name: getPoint().name || 'Ваша точка' });
      const audit = KartaEngine.runCardAudit(safe);
      const api = getBackendUrl();
      const reviewText = $('rep-text').value.trim();
      if (api && reviewText.length >= 5) {
        const btn = $('btn-gen-replies');
        btn.disabled = true;
        btn.textContent = 'Генерируем живой ответ...';
        try {
          const r = await fetch(`${api}/api/reviews/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reviewText,
              clientName: $('rep-client').value,
              tone: $('rep-tone').value,
              businessName: safe.name,
              serviceKeyword: $('rep-kw').value || audit.niche.seoKeywords[0],
              district: safe.district
            })
          });
          const data = await r.json();
          if (r.ok && data.ok && Array.isArray(data.variants)) {
            $('replies-output').innerHTML = `<p class="hint" style="margin-bottom:8px;">✨ Живые ИИ-ответы (<b>${esc(data.provider)}</b>)</p>` +
              data.variants.map((v, idx) => `
                <div class="copy-block">
                  <div class="copy-block-head">
                    <strong>Вариант ${idx + 1}: ${esc(v.style || 'Живой ответ')}</strong>
                    <button type="button" class="btn btn-outline btn-sm" data-copy-ai-reply="${idx}">Копировать</button>
                  </div>
                  <div class="copy-text">${esc(v.text)}</div>
                </div>
              `).join('');
            $('replies-output').querySelectorAll('[data-copy-ai-reply]').forEach(b => {
              b.addEventListener('click', () => copyText(data.variants[Number(b.getAttribute('data-copy-ai-reply'))].text, 'Ответ скопирован!'));
            });
            showToast('Готово 3 живых ИИ-ответа!');
            btn.disabled = false;
            btn.textContent = 'Сгенерировать 3 ответа ИИ';
            return;
          }
        } catch (_) {}
        btn.disabled = false;
        btn.textContent = 'Сгенерировать 3 ответа ИИ';
      }
      renderReplies(safe, audit);
      showToast('Готово 3 варианта SEO-ответа');
    });
    $('btn-copy-appeal').addEventListener('click', () => copyText($('appeal-text').textContent, 'Шаблон жалобы скопирован!'));
    $('btn-copy-services').addEventListener('click', () => copyText($('services-template-text').textContent, 'Список услуг скопирован!'));

    // Order / pricing modal
    const ordBack = $('order-backdrop');
    let selectedPlan = '';
    document.querySelectorAll('[data-order-plan]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPlan = btn.getAttribute('data-order-plan') || '';
        const pt = getPoint();
        $('order-plan-label').textContent = selectedPlan;
        $('ord-point').value = [pt.name, pt.city, pt.yandexUrl || pt.siteUrl].filter(Boolean).join(' · ');
        $('order-status').textContent = '';
        ordBack.classList.remove('hidden');
        trackEvent('order_open', { plan: selectedPlan });
      });
    });
    $('btn-close-order').addEventListener('click', () => ordBack.classList.add('hidden'));
    ordBack.addEventListener('click', (e) => { if (e.target === ordBack) ordBack.classList.add('hidden'); });
    $('order-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pointName = ($('ord-point').value || '').trim();
      const contact = ($('ord-contact').value || '').trim();
      const pt = getPoint();
      const planLow = selectedPlan.toLowerCase();
      const tariffId = planLow.includes('250') ? 'recs_250'
        : planLow.includes('3 карточ') ? 'pack_3'
        : planLow.includes('10 карточ') ? 'pack_10'
        : planLow.includes('vip') || planLow.includes('5 000') ? 'vip_5000'
        : 'pro_950';
      const api = getBackendUrl();
      const stEl = $('order-status');
      stEl.textContent = 'Сохраняем заявку...';
      if (api) {
        try {
          const r = await fetch(`${api}/api/orders/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app: 'checkgeo',
              tariffId,
              contact,
              input: {
                name: pt.name || pointName,
                city: pt.city || '',
                district: pt.district || '',
                niche: pt.niche || 'other',
                yandexUrl: pt.yandexUrl || (/yandex\./i.test(pointName) ? pointName : ''),
                gisUrl: pt.gisUrl || '',
                siteUrl: pt.siteUrl || ''
              }
            })
          });
          const d = await r.json();
          if (r.ok && d.ok && d.mode === 'payment' && d.paymentUrl) {
            stEl.textContent = 'Переходим к оплате...';
            window.location.href = d.paymentUrl;
            return;
          }
        } catch (_) {}
      }
      const txt = `Заявка CheckGeo (${selectedPlan}): ${pointName} | Контакт: ${contact}`;
      copyText(txt, 'Заявка отправлена и скопирована!');
      stEl.textContent = '✓ Заявка принята! Мы свяжемся по указанному контакту.';
      setTimeout(() => ordBack.classList.add('hidden'), 1800);
    });

    trackEvent('page_view');
  }

  initStaticControls();
  populateFormFromPoint(getPoint());
  $('qr-mode').value = state.qrMode || 'helper';
  $('tent-cta').value = state.tentCta || 'Понравилось у нас? Поделитесь за 30 секунд!';
  $('c-short-script-link').checked = state.shortScriptLink !== false;
  bindEvents();
  renderAll();
})();
