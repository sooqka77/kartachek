/* UI-контроллер КартаЧек v2 */
(function () {
  'use strict';

  const STORAGE_KEY = 'kartachek_state_v2';
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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
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
      root.innerHTML = `<div class="review-card"><h1>Ссылка устарела</h1><p style="margin-top:8px;color:var(--muted);">Попросите у администратора свежий QR-код или вернитесь на главную страницу.</p><div class="btn-row"><a class="btn btn-primary" href="./">Открыть КартаЧек</a></div></div>`;
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
      if (yandexLink) {
        mapButtons.push(`<button type="button" class="btn btn-primary" style="width:100%;" data-open-map="${esc(yandexLink)}">Скопировать текст и открыть Яндекс Карты ↗</button>`);
      }
      if (gisLink) {
        mapButtons.push(`<button type="button" class="btn btn-dark" style="width:100%;" data-open-map="${esc(gisLink)}">Скопировать текст и открыть 2ГИС ↗</button>`);
      }
      if (!mapButtons.length) {
        mapButtons.push(`<button type="button" class="btn btn-primary" style="width:100%;" id="btn-only-copy">Скопировать текст отзыва</button>`);
      }

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
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${mapButtons.join('')}
            </div>
          ` : `
            <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;margin-bottom:14px;">
              <p style="font-weight:700;margin-bottom:6px;">Спасибо, что говорите прямо!</p>
              <p style="font-size:13.5px;color:var(--muted);">Напишите руководителю напрямую — так мы сможем разобраться и исправить ситуацию в тот же день.</p>
            </div>
            ${contactLink ? `
              <a class="btn btn-dark" style="width:100%;margin-bottom:10px;" href="${esc(contactLink)}" target="_blank" rel="noopener">Написать руководителю напрямую ↗</a>
            ` : `<p class="hint" style="margin-bottom:10px;">Передайте замечание администратору точки — мы обязательно всё исправим.</p>`}
            ${(yandexLink || gisLink) ? `
              <p class="hint" style="text-align:center;margin-top:8px;">
                Вы также в любой момент можете оставить публичный отзыв:
                ${yandexLink ? `<a href="${esc(yandexLink)}" target="_blank" rel="noopener">Яндекс Карты</a>` : ''}
                ${(yandexLink && gisLink) ? ' · ' : ''}
                ${gisLink ? `<a href="${esc(gisLink)}" target="_blank" rel="noopener">2ГИС</a>` : ''}
              </p>
            ` : ''}
          `}

          <p class="hint" style="text-align:center;margin-top:18px;font-size:11.5px;">
            Сделано в <a href="./">КартаЧек</a> · Честные отзывы реальных клиентов
          </p>
        </div>
      `;

      root.querySelectorAll('[data-mood]').forEach(btn => {
        btn.addEventListener('click', () => { mood = btn.getAttribute('data-mood'); renderHelper(); });
      });
      root.querySelectorAll('[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-tag');
          if (selectedTags.has(t)) selectedTags.delete(t);
          else selectedTags.add(t);
          renderHelper();
        });
      });
      const extraInput = $('rh-extra');
      if (extraInput) {
        extraInput.addEventListener('input', () => {
          customNote = extraInput.value;
          const draftEl = $('rh-draft');
          if (draftEl) draftEl.value = buildDraftText();
        });
      }
      root.querySelectorAll('[data-open-map]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const url = btn.getAttribute('data-open-map');
          const txt = ($('rh-draft') && $('rh-draft').value) || buildDraftText();
          await copyText(txt, 'Текст скопирован! Вставьте его в форму отзыва');
          window.open(url, '_blank', 'noopener');
        });
      });
      const onlyCopy = $('btn-only-copy');
      if (onlyCopy) {
        onlyCopy.addEventListener('click', () => {
          const txt = ($('rh-draft') && $('rh-draft').value) || buildDraftText();
          copyText(txt, 'Текст отзыва скопирован!');
        });
      }
    }

    renderHelper();
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('review')) {
    initCustomerReviewMode(urlParams.get('review'));
    return;
  }

  /* =====================================================================
   * РЕЖИМ 2: ОСНОВНОЕ ПРИЛОЖЕНИЕ КАРТАЧЕК
   * ===================================================================== */
  function createBlankPoint(idx) {
    return {
      id: 'pt-' + Date.now(),
      isDemo: false,
      name: '',
      niche: 'kids',
      city: 'Москва',
      district: '',
      yandexUrl: '',
      gisUrl: '',
      siteUrl: '',
      tgContact: '',
      rating: 4.7,
      reviewsCount: 15,
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
      doneSteps: {}
    };
  }

  function defaultState() {
    const first = JSON.parse(JSON.stringify(KartaData.DEMO_PRESETS[0].point));
    first.id = 'pt-1';
    first.isDemo = true;
    first.doneSteps = {};
    return {
      activePointId: 'pt-1',
      points: [first],
      findingFilter: 'all',
      activeProTab: 'qr',
      qrMode: 'helper',
      tentTheme: 'yellow',
      tentCta: 'Понравилось у нас? Поделитесь за 30 секунд!',
      shortScriptLink: true,
      selectedFeedback: ''
    };
  }

  function loadState() {
    let st = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('kartachek_state_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.points) && parsed.points.length) {
          st = Object.assign(st, parsed);
        }
      }
    } catch (_) {}

    if (window.location.hash && window.location.hash.startsWith('#share=')) {
      const payload = KartaEngine.decodePayload(window.location.hash.slice(7));
      if (payload && payload.name) {
        const id = 'pt-shared-' + Date.now();
        payload.id = id;
        payload.isDemo = false;
        payload.doneSteps = payload.doneSteps || {};
        st.points.unshift(payload);
        st.activePointId = id;
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

  function getActivePoint() {
    let pt = state.points.find(p => p.id === state.activePointId);
    if (!pt) { pt = state.points[0]; state.activePointId = pt.id; }
    if (!pt.doneSteps) pt.doneSteps = {};
    return pt;
  }

  function syncTapChipsVisual() {
    document.querySelectorAll('.tap-chip').forEach(lbl => {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) lbl.classList.toggle('checked', cb.checked);
    });
  }

  function startOwnBlankPoint() {
    const active = getActivePoint();
    if (active.isDemo) {
      const fresh = createBlankPoint(1);
      fresh.id = active.id;
      Object.assign(active, fresh);
    } else {
      const fresh = createBlankPoint(state.points.length + 1);
      state.points.push(fresh);
      state.activePointId = fresh.id;
    }
    saveState();
    populateFormFromPoint(getActivePoint());
    $('smart-paste-input').value = '';
    $('paste-signals').innerHTML = '';
    renderAll();
    $('smart-paste-input').focus();
    $('smart-input-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Готово! Вставьте карточку (Cmd+V) или откройте ручной ввод');
  }

  function initStaticControls() {
    $('f-niche').innerHTML = Object.values(KartaData.NICHES)
      .map(n => `<option value="${esc(n.id)}">${esc(n.label)}</option>`)
      .join('');

    $('demo-buttons').innerHTML = KartaData.DEMO_PRESETS
      .map(d => `<button type="button" class="demo-btn" data-demo="${esc(d.id)}">${esc(d.label.replace(/^Пример \d+: /, ''))}</button>`)
      .join('');

    $('demo-buttons').querySelectorAll('[data-demo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = KartaData.DEMO_PRESETS.find(d => d.id === btn.getAttribute('data-demo'));
        if (!preset) return;
        const active = getActivePoint();
        Object.assign(active, JSON.parse(JSON.stringify(preset.point)), { id: active.id, isDemo: true, doneSteps: {} });
        saveState();
        populateFormFromPoint(active);
        renderAll();
        showToast(`Загружен пример: ${preset.point.name}`);
      });
    });
  }

  function populateFormFromPoint(pt) {
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

  function syncPointFromForm() {
    const pt = getActivePoint();
    const niche = KartaData.NICHES[$('f-niche').value] || KartaData.NICHES.other;
    pt.isDemo = false;
    pt.name = $('f-name').value.trim();
    pt.niche = niche.id;
    pt.city = $('f-city').value.trim() || 'Москва';
    pt.district = $('f-district').value.trim();
    pt.yandexUrl = $('f-yandex-url').value.trim();
    pt.gisUrl = $('f-gis-url').value.trim();
    pt.siteUrl = $('f-site-url').value.trim();
    pt.rating = parseFloat($('f-rating').value) || 0;
    pt.reviewsCount = Math.max(0, parseInt($('f-reviews').value, 10) || 0);
    pt.recentReviews30d = Math.max(0, parseInt($('f-recent30').value, 10) || 0);
    pt.replyRate = Math.max(0, Math.min(100, parseInt($('f-reply-rate').value, 10) || 0));
    pt.photosCount = Math.max(0, parseInt($('f-photos').value, 10) || 0);
    pt.leaderReviews = Math.max(10, parseInt($('f-leader-reviews').value, 10) || niche.benchLeaderReviews);
    pt.avgCheck = Math.max(300, parseInt($('f-check').value, 10) || niche.defaultCheck);
    pt.tgContact = $('f-tg').value.trim();

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

  function renderPointsBar() {
    const wrap = $('points-bar');
    const chips = state.points.map(pt => {
      const a = KartaEngine.runCardAudit(Object.assign({}, pt, { name: pt.name || 'Моя точка' }));
      const isAct = pt.id === state.activePointId;
      return `
        <div class="point-chip ${isAct ? 'active' : ''}" data-select-pt="${esc(pt.id)}" role="button" tabindex="0">
          <span>${esc(pt.name || 'Новая точка')}</span>
          <span class="chip-score">${a.totalScore}</span>
          ${state.points.length > 1 ? `<button type="button" class="chip-del" data-del-pt="${esc(pt.id)}" title="Удалить точку">×</button>` : ''}
        </div>
      `;
    }).join('');

    const countNote = state.points.length >= 3
      ? `<span class="hint">Бесплатно: 3 точки · доп. точки открыты в PRO-тесте</span>`
      : `<span class="hint">Точек: ${state.points.length} / 3 бесплатно</span>`;

    wrap.innerHTML = `${chips}<button type="button" class="add-point-btn" id="btn-add-point">+ Добавить точку</button>${countNote}`;

    wrap.querySelectorAll('[data-select-pt]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-del-pt')) return;
        state.activePointId = el.getAttribute('data-select-pt');
        saveState();
        populateFormFromPoint(getActivePoint());
        renderAll();
      });
    });

    wrap.querySelectorAll('[data-del-pt]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-del-pt');
        if (state.points.length <= 1) return;
        state.points = state.points.filter(p => p.id !== id);
        if (state.activePointId === id) state.activePointId = state.points[0].id;
        saveState();
        populateFormFromPoint(getActivePoint());
        renderAll();
      });
    });

    $('btn-add-point').addEventListener('click', () => {
      const fresh = createBlankPoint(state.points.length + 1);
      state.points.push(fresh);
      state.activePointId = fresh.id;
      saveState();
      populateFormFromPoint(fresh);
      renderAll();
      $('f-name').focus();
    });
  }

  function renderAll() {
    const pt = getActivePoint();
    const safePt = Object.assign({}, pt, { name: pt.name || 'Моя точка' });
    const audit = KartaEngine.runCardAudit(safePt);

    $('demo-banner').classList.toggle('hidden', !pt.isDemo);

    $('yandex-url-hint').textContent = audit.urls.yandexOrgId
      ? `✓ Найден ID ${audit.urls.yandexOrgId} — прямая ссылка на отзыв готова`
      : 'Вставьте ссылку из браузера (/maps/org/.../ID/)';
    $('gis-url-hint').textContent = audit.urls.gisFirmId
      ? `✓ Найден 2ГИС ID ${audit.urls.gisFirmId} — ссылка на отзыв готова`
      : 'Для QR-стенда и отзывов 2ГИС';

    renderPointsBar();

    $('res-point-title').textContent = safePt.name + (safePt.district ? ` · ${safePt.district}` : '');
    $('res-score').textContent = audit.totalScore;
    const badge = $('res-status-badge');
    badge.textContent = audit.status.label;
    badge.className = 'status-badge ' + audit.status.code;
    $('res-summary').textContent = audit.status.summary;

    const arc = $('gauge-arc');
    arc.style.strokeDashoffset = (314.16 * (1 - audit.totalScore / 100)).toFixed(1);
    arc.style.stroke = audit.status.code === 'good' ? '#15803D' : audit.status.code === 'mid' ? '#D97706' : '#E53935';

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

    const filtered = state.findingFilter === 'all'
      ? audit.findings
      : audit.findings.filter(f => f.level === state.findingFilter);

    $('res-findings').innerHTML = filtered.length
      ? filtered.map(f => {
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
        }).join('')
      : `<p class="hint">В этой категории пунктов нет.</p>`;

    // Competitor gap
    const c = audit.competitor;
    $('comp-desc').textContent = c.reviewGap === 0
      ? 'По числу отзывов вы на уровне или выше ориентира лидера района — удерживайте свежесть!'
      : `Чтобы догнать лидера (${c.leaderReviews} отзывов), нужен стабильный белый поток ~${c.recommendedPace} отзывов в месяц без накруток.`;
    $('comp-stats').innerHTML = `
      <div class="stat-box"><span class="k">Ваши отзывы</span><span class="v">${safePt.reviewsCount}</span></div>
      <div class="stat-box"><span class="k">Лидер района</span><span class="v">${c.leaderReviews}</span></div>
      <div class="stat-box highlight"><span class="k">Разрыв</span><span class="v">−${c.reviewGap}</span></div>
      <div class="stat-box"><span class="k">Срок догона</span><span class="v">${c.monthsToCatch ? c.monthsToCatch + ' мес' : 'Вы в топе'}</span></div>
    `;

    // Interactive ROI
    const r = audit.roi;
    const slider = $('roi-check-slider');
    slider.value = Math.min(25000, Math.max(500, r.avgCheck));
    $('roi-check-label').textContent = fmtRub(r.avgCheck);
    $('roi-stats').innerHTML = `
      <div class="stat-box"><span class="k">Упущено обращений/мес</span><span class="v">~${r.missedLeadsMonth}</span></div>
      <div class="stat-box"><span class="k">Упущено клиентов/мес</span><span class="v">~${r.missedClientsMonth}</span></div>
      <div class="stat-box highlight"><span class="k">Потеря в 1-й месяц</span><span class="v">${fmtRub(r.missedFirstMonthRev)}</span></div>
      <div class="stat-box"><span class="k">Потеря с учётом LTV</span><span class="v">${fmtRub(r.missedLtvRev)}</span></div>
    `;

    renderQrStudio(safePt, audit);

    if (!$('rep-kw').value && audit.niche.seoKeywords[0]) {
      $('rep-kw').placeholder = audit.niche.seoKeywords[0];
    }
    $('appeal-text').textContent = KartaEngine.generateAppealTemplate(safePt.name, '[дата и имя автора]');
    if (!$('replies-output').innerHTML) renderReplies(safePt, audit);

    renderProTools(safePt, audit);
    renderCompareTable();
  }

  function getQrTargetUrl(pt, audit) {
    const basePage = window.location.origin === 'null' || window.location.protocol === 'file:'
      ? 'https://sooqka77.github.io/kartachek/'
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

    // Короткая ссылка для мессенджеров (чтобы не слать клиенту 240-символьную строку)
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
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-copy-script'), 10);
        copyText(scripts[idx].text, 'Скрипт скопирован!');
      });
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
    const toneName = res.tone === 'negative' ? 'Негативный' : res.tone === 'neutral' ? 'Смешанный / нейтральный' : 'Позитивный';
    $('replies-output').innerHTML = `<p class="hint" style="margin-bottom:8px;">Определена тональность: <b>${toneName}</b></p>` +
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
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-copy-reply'), 10);
        copyText(res.variants[idx].text, 'Ответ скопирован!');
      });
    });
  }

  function renderProTools(pt, audit) {
    // Прайс-шаблон под нишу
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
      : `<p class="hint">Укажите сайт в «Точном аудите» выше — здесь появятся готовые UTM-ссылки.</p>`;

    $('utm-output').querySelectorAll('[data-copy-utm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-copy-utm'), 10);
        copyText(utms[idx].url, 'UTM-ссылка скопирована!');
      });
    });

    // Внешние отзовики (Zoon, Отзовик.ру, IRecommend) — быстрая проверка наличия точки
    const dirsEl = $('ext-dirs-strip');
    if (dirsEl) {
      const q = encodeURIComponent(`${pt.name || ''} ${pt.city || ''}`.trim() || 'ваша компания');
      const dirs = [
        { name: 'Zoon.ru', desc: 'Один из главных источников ИИ и локального SEO в РФ.', url: `https://zoon.ru/search/?q=${q}` },
        { name: 'Отзовик.ру', desc: 'Часто стоит в топ-3 Яндекса по запросу «[бренд] отзывы».', url: `https://otzovik.com/?search_text=${q}` },
        { name: 'IRecommend', desc: 'Сильный траст у поисковиков и нейросетей по услугам.', url: `https://irecommend.ru/srch?query=${q}` }
      ];
      dirsEl.innerHTML = dirs.map(d => `
        <div class="dir-box">
          <div><strong>${esc(d.name)}</strong><p style="margin-top:3px;">${esc(d.desc)}</p></div>
          <a class="btn btn-outline btn-sm" href="${d.url}" target="_blank" rel="noopener">Проверить точку ↗</a>
        </div>
      `).join('');
    }

    const activeReal = getActivePoint();
    const doneMap = activeReal.doneSteps || {};
    $('plan-14-list').innerHTML = audit.plan14.map(step => {
      const done = !!doneMap[step.id];
      return `
        <label class="plan-item ${done ? 'done' : ''}">
          <input type="checkbox" data-plan-step="${esc(step.id)}" ${done ? 'checked' : ''}>
          <div>
            <span class="plan-day">${esc(step.day)} · ${esc(step.pillar)}</span>
            <div style="font-weight:700;font-size:14px;">${esc(step.title)}</div>
            <div style="font-size:13px;color:var(--muted);margin-top:2px;">${esc(step.action)}</div>
          </div>
        </label>
      `;
    }).join('');

    $('plan-14-list').querySelectorAll('[data-plan-step]').forEach(cb => {
      cb.addEventListener('change', () => {
        activeReal.doneSteps[cb.getAttribute('data-plan-step')] = cb.checked;
        saveState();
        renderProTools(pt, audit);
      });
    });
  }

  function renderCompareTable() {
    const rows = state.points.map(pt => {
      const safe = Object.assign({}, pt, { name: pt.name || 'Новая точка' });
      const a = KartaEngine.runCardAudit(safe);
      const cls = a.status.code === 'good' ? 'green' : a.status.code === 'mid' ? 'yellow' : 'red';
      return `
        <tr>
          <td><b>${esc(safe.name)}</b><br><span class="hint">${esc(safe.district || safe.city || '')}</span></td>
          <td class="mono"><span class="t-pill ${cls}">${a.totalScore}/100</span></td>
          <td class="mono">${(safe.rating || 0).toFixed(1)}</td>
          <td class="mono">${safe.reviewsCount} (+${safe.recentReviews30d}/мес)</td>
          <td class="mono">${safe.photosCount}</td>
          <td class="mono">${a.counts.red} дыр</td>
          <td class="mono">${fmtRub(a.roi.missedFirstMonthRev)}/мес</td>
        </tr>
      `;
    }).join('');

    $('compare-table-wrap').innerHTML = `
      <table>
        <thead>
          <tr><th>Точка</th><th>Индекс</th><th>Рейтинг</th><th>Отзывы</th><th>Фото</th><th>Критично</th><th>Потери/мес</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function runSmartPaste(rawText, scrollOnSuccess) {
    const parsed = KartaEngine.parsePastedCardText(rawText);
    const sigWrap = $('paste-signals');
    if (!parsed.detected) {
      sigWrap.innerHTML = `<span class="sig-chip warn">Мало данных — откройте карточку на Яндекс Картах или 2ГИС, нажмите Cmd/Ctrl+A → C и вставьте сюда целиком.</span>`;
      return false;
    }
    const pt = getActivePoint();
    Object.assign(pt, parsed.patch, { isDemo: false });
    saveState();
    populateFormFromPoint(pt);
    renderAll();
    sigWrap.innerHTML = parsed.signals
      .map(s => `<span class="sig-chip ${s.startsWith('⚠') ? 'warn' : ''}">${esc(s)}</span>`)
      .join('');
    if (parsed.isUrlOnly) {
      showToast('Ссылка распознана — QR готов! Для автоаудита вставьте текст страницы (Cmd+A → C)');
    } else {
      showToast('Карточка распознана автоматически — отчёт готов!');
      if (scrollOnSuccess) {
        setTimeout(() => $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 220);
      }
    }
    return true;
  }

  function bindEvents() {
    $('btn-start-own').addEventListener('click', startOwnBlankPoint);
    $('btn-clear-demo').addEventListener('click', startOwnBlankPoint);

    // Мгновенное автораспознавание сразу при вставке Cmd/Ctrl+V
    $('smart-paste-input').addEventListener('paste', () => {
      setTimeout(() => {
        const val = $('smart-paste-input').value;
        if (val && val.trim().length > 15) runSmartPaste(val, true);
      }, 30);
    });

    // 1-клик вставка из буфера обмена
    $('btn-paste-clipboard').addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          throw new Error('no-api');
        }
        const clip = await navigator.clipboard.readText();
        if (!clip || !clip.trim()) {
          showToast('Буфер пуст — сначала скопируйте страницу карточки (Cmd/Ctrl+A → C)');
          return;
        }
        $('smart-paste-input').value = clip;
        runSmartPaste(clip, true);
      } catch (_) {
        $('smart-paste-input').focus();
        showToast('Нажмите Cmd+V (или Ctrl+V) прямо в поле выше — распознается само!');
      }
    });

    $('btn-parse-paste').addEventListener('click', () => {
      runSmartPaste($('smart-paste-input').value, true);
    });

    $('btn-clear-paste').addEventListener('click', () => {
      $('smart-paste-input').value = '';
      $('paste-signals').innerHTML = '';
    });

    $('btn-toggle-manual').addEventListener('click', () => {
      const dr = $('manual-drawer');
      dr.open = !dr.open;
      if (dr.open) $('f-name').focus();
    });

    $('audit-form').addEventListener('input', () => { syncPointFromForm(); renderAll(); });
    $('audit-form').addEventListener('change', () => { syncPointFromForm(); renderAll(); });
    $('audit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      syncPointFromForm();
      renderAll();
      $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('Диагноз обновлён');
    });

    // Интерактивный ползунок среднего чека в блоке ROI
    $('roi-check-slider').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 5000;
      const pt = getActivePoint();
      pt.avgCheck = val;
      $('f-check').value = val;
      saveState();
      renderAll();
    });

    $('btn-open-yandex-serp').addEventListener('click', () => {
      const pt = getActivePoint();
      const niche = KartaData.NICHES[pt.niche] || KartaData.NICHES.other;
      const q = `${niche.primaryRubrics[0]} ${pt.city || ''} ${pt.district || ''}`.trim();
      window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(q)}`, '_blank', 'noopener');
    });

    $('btn-share-report').addEventListener('click', () => {
      const pt = Object.assign({}, getActivePoint());
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

    $('paywall-toggle').addEventListener('change', (e) => {
      $('pro-body').classList.toggle('paywall-locked', e.target.checked);
    });
    $('btn-unlock-test').addEventListener('click', () => {
      $('paywall-toggle').checked = false;
      $('pro-body').classList.remove('paywall-locked');
      showToast('PRO-доступ открыт бесплатно на тест');
    });

    // QR studio controls
    $('qr-mode').addEventListener('change', (e) => { state.qrMode = e.target.value; saveState(); renderAll(); });
    $('tent-cta').addEventListener('input', (e) => { state.tentCta = e.target.value; saveState(); $('tent-cta-preview').textContent = state.tentCta; });
    $('c-short-script-link').addEventListener('change', (e) => { state.shortScriptLink = e.target.checked; saveState(); renderAll(); });

    $('tent-themes').querySelectorAll('[data-tent-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tentTheme = btn.getAttribute('data-tent-theme');
        saveState();
        renderAll();
      });
    });

    $('btn-copy-qr-url').addEventListener('click', () => copyText($('qr-target-url').textContent, 'Ссылка скопирована!'));
    $('btn-shorten-clck').addEventListener('click', () => {
      const target = $('qr-target-url').textContent;
      copyText(target, 'Ссылка скопирована — открываем clck.ru!');
      window.open(`https://clck.ru/?url=${encodeURIComponent(target)}`, '_blank', 'noopener');
    });
    $('btn-open-helper-preview').addEventListener('click', () => {
      const pt = Object.assign({}, getActivePoint(), { name: getActivePoint().name || 'Моя точка' });
      const url = getQrTargetUrl(pt, KartaEngine.runCardAudit(pt));
      if (window.location.protocol === 'file:' && state.qrMode === 'helper') {
        window.open(KartaEngine.buildReviewHelperUrl(window.location.href, pt), '_blank', 'noopener');
      } else {
        window.open(url, '_blank', 'noopener');
      }
    });
    $('btn-download-qr-png').addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      KartaQR.drawToCanvas(canvas, $('qr-target-url').textContent, { scale: 12, quietZone: 4 });
      const a = document.createElement('a');
      a.download = `qr-${(getActivePoint().name || 'tochka').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-')}.png`;
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

    // PRO 2 & 3
    $('btn-gen-replies').addEventListener('click', async () => {
      const safe = Object.assign({}, getActivePoint(), { name: getActivePoint().name || 'Моя точка' });
      const audit = KartaEngine.runCardAudit(safe);
      const api = getBackendUrl();
      const reviewText = $('rep-text').value.trim();
      if (api && reviewText.length >= 5) {
        const btn = $('btn-gen-replies');
        btn.disabled = true;
        btn.textContent = 'Генерируем живой ИИ-ответ...';
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
            $('replies-output').innerHTML = `<p class="hint" style="margin-bottom:8px;">✨ Живые ИИ-ответы (<b>${esc(data.provider)}</b>${data.leftToday != null ? ` · осталось сегодня: ${data.leftToday}` : ''})</p>` +
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
            btn.textContent = 'Сгенерировать 3 варианта ответа';
            return;
          }
        } catch (_) {}
        btn.disabled = false;
        btn.textContent = 'Сгенерировать 3 варианта ответа';
      }
      renderReplies(safe, audit);
      showToast('Готово 3 варианта SEO-ответа');
    });
    $('btn-copy-appeal').addEventListener('click', () => copyText($('appeal-text').textContent, 'Шаблон жалобы скопирован!'));
    $('btn-copy-services').addEventListener('click', () => copyText($('services-template-text').textContent, 'Список услуг скопирован!'));

    // Подключение к geo-api (если задан backendUrl в config.js или ?api=...)
    const backendUrl = getBackendUrl();
    if (backendUrl) {
      $('btn-server-lookup').classList.remove('hidden');
      trackEvent('page_view');
      $('btn-server-lookup').addEventListener('click', async () => {
        const pt = getActivePoint();
        const btn = $('btn-server-lookup');
        if (!pt.name && !pt.siteUrl) {
          $('manual-drawer').open = true;
          $('f-name').focus();
          showToast('Укажите название точки или сайт для автопроверки');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Проверяем 2ГИС и сайт...';
        try {
          const r = await fetch(`${backendUrl}/api/geo/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: pt.name, city: pt.city, siteUrl: pt.siteUrl })
          });
          const data = await r.json();
          const chips = [];
          if (data.twogis) {
            pt.has2gisSynced = true;
            if (data.twogis.gisUrl && !pt.gisUrl) pt.gisUrl = data.twogis.gisUrl;
            if (data.twogis.address && !pt.district) pt.district = data.twogis.address;
            chips.push(`✓ 2ГИС: рейтинг ${data.twogis.rating || '—'}, отзывов ${data.twogis.reviewsCount ?? '—'}`);
          }
          if (data.siteReport) {
            const sr = data.siteReport;
            chips.push(sr.https ? `✓ Сайт HTTPS (${sr.elapsedMs} мс)` : '⚠ Сайт без HTTPS');
            chips.push(sr.schema?.hasLocalBusiness ? '✓ Schema.org LocalBusiness есть' : '⚠ Нет Schema.org на сайте');
            if (sr.links?.yandexUrl && !pt.yandexUrl) { pt.yandexUrl = sr.links.yandexUrl; chips.push('✓ Найдена ссылка на Яндекс Карты'); }
            if (sr.links?.gisUrl && !pt.gisUrl) { pt.gisUrl = sr.links.gisUrl; chips.push('✓ Найдена ссылка на 2ГИС'); }
            if (sr.links?.tgUrl && !pt.tgContact) { pt.tgContact = sr.links.tgUrl; }
          }
          if (!chips.length) chips.push('⚠ По 2ГИС/сайту ничего не найдено — уточните название или сайт');
          pt.isDemo = false;
          saveState();
          populateFormFromPoint(pt);
          renderAll();
          $('paste-signals').innerHTML = chips.map(s => `<span class="sig-chip ${s.startsWith('⚠') ? 'warn' : ''}">${esc(s)}</span>`).join('');
          showToast('Автопроверка завершена!');
        } catch (_) {
          showToast('Сервер недоступен — проверьте соединение');
        }
        btn.disabled = false;
        btn.textContent = '⚡ Автопроверка 2ГИС и сайта';
      });
    }

    // Order / pricing modal
    const ordBack = $('order-backdrop');
    let selectedPlan = '';
    if (ordBack) {
      document.querySelectorAll('[data-order-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedPlan = btn.getAttribute('data-order-plan') || '';
          const pt = getActivePoint();
          $('order-plan-label').textContent = selectedPlan;
          $('ord-point').value = [pt.name, pt.city, pt.yandexUrl || pt.siteUrl].filter(Boolean).join(' · ');
          $('order-status').textContent = '';
          ordBack.classList.remove('hidden');
          trackEvent('order_open', { plan: selectedPlan });
        });
      });
      $('btn-close-order').addEventListener('click', () => ordBack.classList.add('hidden'));
      ordBack.addEventListener('click', (e) => { if (e.target === ordBack) ordBack.classList.add('hidden'); });
      $('order-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const pointName = ($('ord-point').value || '').trim();
        const contact = ($('ord-contact').value || '').trim();
        const pt = getActivePoint();
        trackEvent('order_intent', { plan: selectedPlan, pointName, url: pt.yandexUrl || pt.siteUrl || '', contact });
        const txt = `Заявка CheckGeo (${selectedPlan}): ${pointName} | Контакт: ${contact}`;
        copyText(txt, 'Заявка зафиксирована и скопирована!');
        $('order-status').textContent = '✓ Заявка отправлена! Мы свяжемся по указанному контакту (текст также скопирован в буфер).';
        setTimeout(() => ordBack.classList.add('hidden'), 1800);
      });
    }

    // Feedback decision block
    $('fb-choices').querySelectorAll('[data-fb]').forEach(btn => {
      btn.addEventListener('click', () => {
        $('fb-choices').querySelectorAll('[data-fb]').forEach(b => b.classList.remove('picked'));
        btn.classList.add('picked');
        state.selectedFeedback = btn.getAttribute('data-fb');
      });
    });
    $('btn-copy-feedback').addEventListener('click', () => {
      const pt = Object.assign({}, getActivePoint(), { name: getActivePoint().name || 'Моя точка' });
      const a = KartaEngine.runCardAudit(pt);
      const verdict = state.selectedFeedback || 'Протестировал КартаЧек';
      const comment = ($('fb-comment').value || '').trim();
      trackEvent('verdict', { verdict, comment, score: a.totalScore });
      const msg = `Тест КартаЧек (${pt.name}, индекс ${a.totalScore}/100): ${verdict}${comment ? ' | Комментарий: ' + comment : ''}`;
      copyText(msg, 'Вердикт скопирован — вставьте в Telegram!');
    });
  }

  function getBackendUrl() {
    return (window.KARTA_CONFIG && window.KARTA_CONFIG.backendUrl) ? window.KARTA_CONFIG.backendUrl.replace(/\/+$/, '') : '';
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

  initStaticControls();
  populateFormFromPoint(getActivePoint());
  $('qr-mode').value = state.qrMode || 'helper';
  $('tent-cta').value = state.tentCta || 'Понравилось у нас? Поделитесь за 30 секунд!';
  $('c-short-script-link').checked = state.shortScriptLink !== false;
  bindEvents();
  renderAll();
})();
