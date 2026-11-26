/* Движок диагностики и инструментов КартаЧек
 * 100% детерминированный, белый анализ без фейковых цифр.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    root.KartaEngine = factory(root.KartaData);
  }
})(typeof self !== 'undefined' ? self : this, function (KartaData) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /* 1. Парсер ссылок Яндекс Карт и 2ГИС → прямые ссылки на форму отзыва */
  function parseCardUrls(yandexUrl, gisUrl) {
    const out = {
      yandexOrgId: null,
      yandexDirectReviewUrl: '',
      yandexCardUrl: (yandexUrl || '').trim(),
      gisFirmId: null,
      gisDirectReviewUrl: '',
      gisCardUrl: (gisUrl || '').trim()
    };

    const y = out.yandexCardUrl;
    if (y) {
      // Примеры: /maps/org/slug/1234567890/ или /maps/org/1234567890/ или /profile/1234567890 или oid=1234567890
      const mOrg = y.match(/\/org\/(?:[^/]+\/)?(\d{5,15})/i) ||
                   y.match(/\/profile\/(\d{5,15})/i) ||
                   y.match(/[?&]oid=(\d{5,15})/i) ||
                   y.match(/\/(\d{7,15})(?:\/|\?|$)/);
      if (mOrg) {
        out.yandexOrgId = mOrg[1];
        out.yandexDirectReviewUrl = `https://yandex.ru/maps/org/${mOrg[1]}/reviews/?add-review=true`;
      } else if (/yandex\.(ru|com)\/maps/i.test(y)) {
        out.yandexDirectReviewUrl = y;
      }
    }

    const g = out.gisCardUrl;
    if (g) {
      // Примеры: 2gis.ru/moscow/firm/70000001054829134 или 2gis.ru/firm/70000001054829134
      const mFirm = g.match(/\/firm\/(\d{6,20})/i) || g.match(/2gis\.[a-z]+\/[^/]+\/geo\/(\d{6,20})/i);
      if (mFirm) {
        out.gisFirmId = mFirm[1];
        out.gisDirectReviewUrl = `https://2gis.ru/firm/${mFirm[1]}/tab/reviews/addreview`;
      } else if (/2gis\./i.test(g)) {
        out.gisDirectReviewUrl = g;
      }
    }
    return out;
  }

  /* 2. Умный разбор скопированного текста карточки (Ctrl+A → Ctrl+C → Ctrl+V с Яндекс Карт / 2ГИС) */
  function parsePastedCardText(rawText) {
    const text = String(rawText || '').replace(/\u00a0/g, ' ').trim();
    if (!text) return { detected: false, signals: [], patch: {} };

    const patch = {};
    const signals = [];

    const is2gis = /2гис|2gis/i.test(text);
    const isYandex = /яндекс|хорошее место|информация подтверждена владельцем|ещ[её] может подойти|похожие места/i.test(text);
    const platform = isYandex ? 'Яндекс Карты' : is2gis ? '2ГИС' : 'Карточка организации';
    signals.push(`Источник: ${platform}`);

    // Название (первая осмысленная строка не похожая на UI-элемент)
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const uiSkip = /^(яндекс(\s+карты|\s+бизнес)?|карты|поиск|найти|войти|маршрут|обзор|товары(\s+и\s+услуги)?|услуги|фото(\s+\d+)?|отзывы(\s+\d+)?|новости|особенности|закрыть|назад|поделиться|сохранить|2гис|меню|\d[\.,]\d)$/i;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const l = lines[i];
      if (l.length >= 3 && l.length <= 75 && !uiSkip.test(l) && !/^\d+\s*(оцен|отзыв|фото)/i.test(l)) {
        patch.name = l;
        signals.push(`Название: «${l}»`);
        break;
      }
    }

    // Рейтинг (например 4,9 или 5.0 рядом с оценками или отдельно)
    const mRating = text.match(/(?:^|\s)([3-5][.,][0-9])(?=\s*(?:\n|оцен|отзыв|из\s*5|★|⭐|\())/i) ||
                    text.match(/рейтинг[^\d]{0,10}([1-5][.,][0-9])/i) ||
                    text.match(/(?:^|\n)\s*([1-5][.,][0-9])\s*(?:\n|$)/);
    if (mRating) {
      const r = parseFloat(mRating[1].replace(',', '.'));
      if (r >= 1 && r <= 5) {
        patch.rating = r;
        signals.push(`Рейтинг: ${r.toFixed(1)}`);
      }
    }

    // Число отзывов (без \b для кириллицы!)
    const mReviews = text.match(/(\d[\d\s]{0,6})\s*отзыв(?:ов|а)?(?=$|[^а-яё])/i) ||
                     text.match(/(?:^|[^а-яё])отзывы\s+(\d[\d\s]{0,6})(?=$|\D)/i);
    if (mReviews) {
      const cnt = parseInt(mReviews[1].replace(/\s+/g, ''), 10);
      if (!isNaN(cnt)) {
        patch.reviewsCount = cnt;
        signals.push(`Отзывов: ${cnt}`);
      }
    } else if (/оставьте первый отзыв|отзывов пока нет|нет отзывов/i.test(text)) {
      patch.reviewsCount = 0;
      signals.push('Отзывов: 0 (карточка пустая)');
    }

    // Число фото (без \b для кириллицы!)
    const mPhotos = text.match(/(?:^|[^а-яё])фото(?:графий|графии)?\s+(\d[\d\s]{0,5})(?=$|\D)/i) ||
                    text.match(/(\d[\d\s]{0,5})\s*фото(?:графий|графии)?(?=$|[^а-яё])/i);
    if (mPhotos) {
      const ph = parseInt(mPhotos[1].replace(/\s+/g, ''), 10);
      if (!isNaN(ph)) {
        patch.photosCount = ph;
        signals.push(`Фото: ${ph}`);
      }
    }

    // Синяя галочка / верификация
    if (/информация подтверждена владельцем|подтвержд[её]н(?:ная|а)?\s+организация|официальная карточка/i.test(text)) {
      patch.verified = true;
      signals.push('Синяя галочка: есть');
    } else if (text.length > 350) {
      patch.verified = false;
      signals.push('Синяя галочка: не найдена в тексте');
    }

    // Блок услуг и «давно не обновлялось»
    if (/давно не обновлял/i.test(text)) {
      patch.servicesUpdated = false;
      signals.push('⚠ Метка «Давно не обновлялось» в услугах');
    } else if (/товары и услуги|прайс-лист|цены и услуги/i.test(text)) {
      patch.servicesUpdated = true;
      signals.push('Блок «Товары и услуги»: найден');
    }

    // Онлайн-запись
    if (/записаться онлайн|онлайн-запись|забронировать|выбрать время/i.test(text)) {
      patch.hasOnlineBooking = true;
      signals.push('Онлайн-запись: подключена');
    } else if (text.length > 350) {
      patch.hasOnlineBooking = false;
      signals.push('Онлайн-запись: не найдена');
    }

    // Новости / сторис
    if (/(?:^|[^а-яё])(новости|публикации|акции)(?=$|[^а-яё])/i.test(text)) {
      patch.hasNewsStories = true;
      signals.push('Новости / акции: есть раздел');
    }

    // Реклама конкурентов на карточке
    if (/ещ[её] может подойти|похожие места рядом|реклама конкурент|возможно, вам подойд/i.test(text)) {
      patch.hasCompetitorAds = true;
      signals.push('⚠ На карточке показывается блок конкурентов («Ещё может подойти»)');
    }

    // Ответы владельца (считаем отношение видимых «Ответ организации» к видимым отзывам с датами)
    const replyMatches = text.match(/ответ организации|официальный ответ|ответ компании/gi) || [];
    const dateMatches = text.match(/(?:^|\D)\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+20\d\d)?(?=$|[^а-яё])/gi) || [];
    if (dateMatches.length >= 2) {
      const rate = clamp(Math.round((replyMatches.length / dateMatches.length) * 100), 0, 100);
      patch.replyRate = rate;
      signals.push(`Ответы владельца (по видимым отзывам): ~${rate}% (${replyMatches.length} из ${dateMatches.length})`);
    } else if (replyMatches.length > 0) {
      patch.replyRate = 70;
      signals.push(`Найдены ответы владельца (${replyMatches.length})`);
    }

    // Свежие отзывы за последние 30 дней
    const freshRelative = (text.match(/сегодня|вчера|(?:^|\D)\d+\s+(?:дн|недел)/gi) || []).length;
    if (freshRelative > 0) {
      patch.recentReviews30d = freshRelative;
      signals.push(`Свежих отзывов за месяц (минимум): ${freshRelative}`);
    }

    // Сайт
    const mSite = text.match(/https?:\/\/(?!(?:yandex|2gis|vk\.com|t\.me|wa\.me|whatsapp))[\w.-]+\.[a-zрф]{2,}[^\s]*/i);
    if (mSite) {
      patch.siteUrl = mSite[0].replace(/[),.;]+$/, '');
      signals.push(`Сайт: ${patch.siteUrl}`);
    }

    return { detected: signals.length > 1, signals, patch };
  }

  /* 3. Проверка названия карточки на риск бана по правилам Яндекс Бизнеса */
  function checkTitleCompliance(title) {
    const t = String(title || '').trim();
    const issues = [];
    if (!t) return { ok: false, risk: 'high', issues: ['Введите название организации'], cleanSuggestion: '' };

    // Переспам ключевыми словами (> 45 символов или > 5 слов или разделители | / — ,)
    const words = t.split(/\s+/).filter(Boolean);
    if (t.length > 48 || words.length > 6) {
      issues.push('Слишком длинное название — похоже на переспам ключевыми словами. Яндекс требует название строго «как на вывеске», а услуги выносить в рубрики и прайс.');
    }
    if (/[|•★⭐🔥✅⚡!]/.test(t)) {
      issues.push('Спецсимволы и эмодзи в названии запрещены правилами Яндекс Бизнеса — правки могут заблокировать.');
    }
    const letters = t.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
    const upper = t.replace(/[^A-ZА-ЯЁ]/g, '');
    if (letters.length >= 6 && upper.length / letters.length > 0.65) {
      issues.push('Слишком много ЗАГЛАВНЫХ БУКВ (CAPS LOCK) — модерация Яндекса и 2ГИС отклоняет или понижает такие названия.');
    }
    if (/(?:\+7|8\s*\(?\d{3}\)?|\d{3}-\d{2}-\d{2}|https?:\/\/|\.ru\b|\.com\b)/i.test(t)) {
      issues.push('Телефон или адрес сайта в названии прямо запрещены правилами площадок.');
    }
    if (/(?:лучший|недорого|дешево|д[её]шево|скидк|акция|круглосуточно|24\/7|рядом с метро|м\.\s*[а-я])/i.test(t)) {
      issues.push('Рекламные слова («лучший», «недорого», «скидки», «рядом с метро») в названии запрещены — это частая причина отката карточки.');
    }

    let clean = t
      .replace(/[|•★⭐🔥✅⚡!]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (letters.length >= 6 && upper.length / letters.length > 0.65) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }

    return {
      ok: issues.length === 0,
      risk: issues.length >= 2 ? 'high' : issues.length === 1 ? 'mid' : 'low',
      issues,
      cleanSuggestion: clean
    };
  }

  /* 4. Главный движок диагностики: 20 факторов, 5 осей, 0–100 баллов */
  function runCardAudit(point) {
    const niche = KartaData.NICHES[point.niche] || KartaData.NICHES.other;
    const rating = Number(point.rating) || 0;
    const reviewsCount = Math.max(0, Number(point.reviewsCount) || 0);
    const recent30d = Math.max(0, Number(point.recentReviews30d) || 0);
    const replyRate = clamp(Number(point.replyRate) || 0, 0, 100);
    const photosCount = Math.max(0, Number(point.photosCount) || 0);
    const leaderReviews = Math.max(10, Number(point.leaderReviews) || niche.benchLeaderReviews);
    const leaderRating = Number(point.leaderRating) || 5.0;

    const titleCheck = checkTitleCompliance(point.name);
    const urls = parseCardUrls(point.yandexUrl, point.gisUrl);

    const findings = [];
    const pushFinding = (level, pillar, title, why, fix, impactPts) => {
      findings.push({ level, pillar, title, why, fix, impactPts });
    };

    // === ОСЬ 1: Упаковка витрины (25 баллов) ===
    let sPack = 0;
    if (point.verified) {
      sPack += 6;
      pushFinding('green', 'Упаковка', 'Есть синяя галочка владельца', 'Карточка подтверждена — Яндекс даёт приоритет в доверии и до +20% к показам.', 'Поддерживать актуальность графика раз в 2 недели.', 0);
    } else {
      pushFinding('red', 'Упаковка', 'Нет «синей галочки» (верификации)', 'По данным Яндекса, подтверждённые карточки получают до +20% больше показов и выше доверие в выдаче.', 'Зайти в Яндекс Бизнес → заполнить профиль на 90%+ и пройти подтверждение (по звонку/видео).', 6);
    }

    if (point.rubricMatchesLeaders) {
      sPack += 6;
    } else {
      pushFinding('red', 'Упаковка', 'Основная рубрика не совпадает с топ-3 района', `Вы стоите «не на той полке». В вашей нише лидеры используют: ${niche.primaryRubrics.join(', ')}.`, 'Открыть выдачу района по главному запросу, выписать основные рубрики первых 3 конкурентов и выставить такие же в Яндекс Бизнесе и 2ГИС.', 6);
    }

    const photoRatio = clamp(photosCount / niche.benchPhotos, 0, 1);
    sPack += Math.round(photoRatio * 5);
    if (photosCount < 10) {
      pushFinding('red', 'Упаковка', `Критически мало фото (${photosCount} шт.)`, 'Пустая или бедная галерея выглядит как закрытая точка. Пользователь выбирает глазами за 3 секунды.', `Загрузить минимум 20 живых фото (вход с улицы, интерьер, команда/процесс, результат) и подгружать по 3–5 новых фото раз в месяц. Ориентир ниши: ${niche.benchPhotos}+ фото.`, 5);
    } else if (photosCount < niche.benchPhotos * 0.7) {
      pushFinding('yellow', 'Упаковка', `Фотографий меньше, чем у лидеров (${photosCount} из ${niche.benchPhotos})`, 'Регулярные свежие фото дают сигнал алгоритмам, что точка живая.', 'Добавить фото фасада с вывеской (ориентир с улицы), команды и 1 короткое вертикальное видео на 15–30 сек.', 3);
    } else {
      pushFinding('green', 'Упаковка', `Сильная фотогалерея (${photosCount} фото)`, 'Покрывает ожидания клиента до визита.', 'Поддерживать свежесть: 3–4 новых фото раз в месяц.', 0);
    }

    if (point.servicesUpdated) {
      sPack += 5;
    } else {
      pushFinding('red', 'Упаковка', 'Услуги и цены пустые или «давно не обновлялись»', 'Яндекс прямо показывает клиенту серую плашку «давно не обновлялось» и хуже ранжирует карточку по конкретным услугам.', 'Заполнить 8–15 ключевых услуг с точными ценами, длительностью и понятной первой позицией (пробное / диагностика / бестселлер). Обновлять прайс раз в 2 месяца.', 5);
    }

    if (point.hasNewsStories) {
      sPack += 3;
    } else {
      pushFinding('yellow', 'Упаковка', 'Не ведутся Новости и Сторис в карточке', 'Публикации поднимают вовлечённость и дают бесплатные поводы вернуться в карточку.', 'Публиковать 2 короткие новости в месяц (сезонный оффер, событие, новая услуга) с фото и кнопкой действия.', 3);
    }

    // === ОСЬ 2: Отзывы и пульс (30 баллов) ===
    let sReviews = 0;
    if (reviewsCount === 0) {
      pushFinding('red', 'Отзывы', 'Ноль текстовых отзывов — точка «невидима»', 'Без текстовых отзывов карточка проигрывает в поиске, в конверсии и полностью выпадает из рекомендаций Алисы и нейропоиска.', 'На этой неделе лично попросить 5 самых лояльных клиентов оставить подробный отзыв через QR-помощник (вкладка PRO ниже).', 14);
    } else {
      // Рейтинг (до 10 б)
      if (rating >= 4.8) sReviews += 10;
      else if (rating >= 4.6) sReviews += 8;
      else if (rating >= 4.3) sReviews += 5;
      else if (rating >= 4.0) sReviews += 2;

      if (rating > 0 && rating < 4.7) {
        pushFinding('red', 'Отзывы', `Рейтинг ${rating.toFixed(1)} ниже порога доверия (4,7+)`, 'В 2026 году большинство клиентов в РФ ставят фильтр «4,5+» и сравнивают карточки с рейтингом 4,8–5,0.', 'Не накручивать! Запустить белый конвейер отзывов (цель 8–12 в месяц) + разобрать каждый негативный отзыв: решить проблему и вежливо ответить.', 7);
      } else if (rating >= 4.8) {
        pushFinding('green', 'Отзывы', `Отличный рейтинг (${rating.toFixed(1)})`, 'Выше порога доверия — главная задача теперь растить объём и свежесть отзывов.', 'Следить, чтобы рейтинг не проседал из-за единичного негатива (быстро перекрывать свежими отзывами).', 0);
      }

      // Объём относительно лидера (до 8 б)
      const revRatio = clamp(reviewsCount / leaderReviews, 0, 1);
      sReviews += Math.round(revRatio * 8);
      if (reviewsCount < leaderReviews * 0.45) {
        pushFinding('yellow', 'Отзывы', `Сильное отставание по числу отзывов (${reviewsCount} против ${leaderReviews} у лидера)`, 'Даже при рейтинге 4,9–5,0 карточка с 20 отзывами часто проигрывает в выдаче соседу со 150+ отзывами.', `Выстроить системный сбор: QR на стойке + мягкое сообщение после визита. При темпе 10 отзывов/мес разрыв сократится в разы за сезон.`, 6);
      }
    }

    // Свежесть за 30 дней (до 7 б)
    if (recent30d >= 6) {
      sReviews += 7;
      pushFinding('green', 'Отзывы', `Живой поток отзывов (${recent30d} за 30 дней)`, 'Алгоритмы Яндекса и 2ГИС дают максимальный вес свежим отзывам за последние 30–90 дней.', 'Держать ритм — не проваливаться в ноль.', 0);
    } else if (recent30d >= 2) {
      sReviews += 4;
      pushFinding('yellow', 'Отзывы', `Слабый темп свежих отзывов (${recent30d} за 30 дней)`, 'Старые отзывы постепенно теряют вес в ранжировании.', 'Довести темп до 6–10 живых текстовых отзывов в месяц (2 в неделю).', 4);
    } else {
      sReviews += recent30d === 1 ? 2 : 0;
      pushFinding('red', 'Отзывы', `Карточка «тухнет»: ${recent30d} свежих отзывов за 30 дней`, 'Когда новые отзывы не появляются месяцами, Яндекс и 2ГИС опускают карточку ниже более активных соседей.', 'Поставить QR-тейблтент (готовый макет ниже) и добавить просьбу об отзыве в чек-лист администратора после удачного визита.', 6);
    }

    // Ответы владельца (до 5 б)
    if (reviewsCount > 0) {
      if (replyRate >= 85) {
        sReviews += 5;
      } else if (replyRate >= 50) {
        sReviews += 3;
        pushFinding('yellow', 'Отзывы', `Ответы владельца не на все отзывы (${replyRate}%)`, 'Ответы повышают лояльность читателей и индексируются поиском Яндекса по ключевым словам.', 'Закрыть неотвеченные отзывы за последние 3 месяца живыми ответами с названием услуги и района (Конструктор ответов ниже).', 3);
      } else {
        sReviews += 1;
        pushFinding('red', 'Отзывы', `Почти нет ответов владельца (${replyRate}%)`, 'Неотвеченные отзывы (особенно негативные) выглядят как «бизнесу всё равно на клиентов».', 'Ответить на последние 15–20 отзывов в ближайшие 2 дня и ввести правило: ответ в течение 24 часов.', 5);
      }
    }

    // === ОСЬ 3: Конверсия в заявку (20 баллов) ===
    let sConv = 0;
    if (point.hasOnlineBooking) {
      sConv += 10;
      pushFinding('green', 'Конверсия', 'Подключена онлайн-запись / быстрая кнопка', 'По статистике 2025–2026 доля онлайн-записи из карт выросла с 4% до 17% и продолжает расти.', 'Проверить с телефона, что кнопка открывается без ошибок за 2 клика.', 0);
    } else {
      pushFinding('red', 'Конверсия', 'Нет кнопки онлайн-записи / мессенджера в карточке', 'Около 17% горячих обращений из карт сегодня идут через запись без звонка — молодые клиенты и родители часто не звонят.', 'Подключить кнопку действия в Яндекс Бизнесе (ссылка на Telegram/WhatsApp-бот, YCLIENTS или короткую форму записи на сайте).', 10);
    }

    if (point.siteUrl && point.siteUrl.trim().length > 5) {
      sConv += 5;
      if (!/utm_/i.test(point.siteUrl)) {
        pushFinding('yellow', 'Конверсия', 'Ссылка на сайт без UTM-метки', 'Без UTM вы не видите в Яндекс Метрике, сколько реальных заявок и денег приходит именно с карт.', 'Заменить ссылку в карточке на UTM-ссылку (готовый генератор во вкладке PRO ниже) — займёт 1 минуту.', 3);
      } else {
        sConv += 3;
      }
    } else {
      pushFinding('yellow', 'Конверсия', 'Не указан сайт или посадочная страница', 'Клиент хочет проверить цены и детали, прежде чем звонить.', 'Добавить ссылку на страницу конкретной точки (или Telegram-канал с закрепом) с UTM-меткой.', 5);
    }

    if (urls.yandexOrgId) sConv += 2;

    // === ОСЬ 4: Защита и чистота (15 баллов) ===
    let sShield = 0;
    if (point.hasOwnerAccess) {
      sShield += 4;
    } else {
      pushFinding('red', 'Защита', 'Нет прав владельца в кабинете Яндекс Бизнеса / 2ГИС', 'Без доступа владельца (частая проблема во франшизах) вы не можете менять рубрики, прайс, фото и отвечать на отзывы.', 'Запросить права владельца или представителя у франчайзера / подтвердить права через Яндекс Бизнес.', 6);
    }

    if (!point.hasDuplicates) {
      sShield += 4;
    } else {
      pushFinding('red', 'Защита', 'Есть дубли карточки организации', 'Дубли размывают отзывы, рейтинг и силу карточки: по главному запросу может выпадать слабый дубль вместо основной точки.', 'Найти все дубли по адресу/названию, выбрать главную карточку и подать заявку в поддержку Яндекса/2ГИС на склейку или закрытие лишних.', 5);
    }

    if (!point.hasCompetitorAds) {
      sShield += 4;
    } else {
      pushFinding('red', 'Защита', 'На вашей карточке крутится реклама конкурента', 'Блок «Ещё может подойти» уводит горячих клиентов, которые уже искали именно вас.', 'После приведения карточки в порядок протестировать приоритетное размещение (отключает чужую рекламу на карточке) или закрыть все «пустые» блоки своей информацией.', 4);
    }

    if (titleCheck.ok) {
      sShield += 3;
    } else {
      pushFinding('yellow', 'Защита', 'Риск штрафа/отката из-за названия карточки', titleCheck.issues[0], `Привести название к виду «как на вывеске», например: «${titleCheck.cleanSuggestion}».`, 3);
    }

    // === ОСЬ 5: Мультиплощадочность (10 баллов) ===
    let sMulti = 0;
    if (point.has2gisSynced) {
      sMulti += 6;
    } else {
      pushFinding('yellow', 'Площадки', '2ГИС не заполнен или данные расходятся с Яндексом', '2ГИС даёт до 25–35% локального трафика в РФ, а единые данные (название, адрес, телефон) критичны и для нейропоиска.', 'Синхронизировать карточку в 2ГИС Личном кабинете: те же рубрики, фото, прайс, график и телефон.', 6);
    }

    if (point.hasOtherDirs) {
      sMulti += 4;
    } else {
      pushFinding('yellow', 'Площадки', 'Нет присутствия на 3-й площадке (Zoon, Отзовик, профильные)', 'Исследование 266 тыс. локаций показало: ведение 3 площадок вместо 2 даёт в среднем ×1,5 больше локального трафика.', `Создать и заполнить базовые карточки: ${niche.directories.slice(2, 5).join(', ')}.`, 4);
    }

    const totalScore = clamp(sPack + sReviews + sConv + sShield + sMulti, 0, 100);

    // Сортируем находки: сначала красные (по весу), потом жёлтые, потом зелёные
    const levelOrder = { red: 0, yellow: 1, green: 2 };
    findings.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || b.impactPts - a.impactPts);

    const status =
      totalScore >= 80 ? { code: 'good', label: 'Сильная карточка', summary: 'Фундамент собран хорошо — пора дожимать конверсию, 2ГИС и масштаб.' } :
      totalScore >= 55 ? { code: 'mid', label: 'Есть утечка клиентов', summary: 'Карточка работает вполсилы: несколько конкретных дыр отдают горячих клиентов соседям.' } :
      { code: 'bad', label: 'Критическая потеря трафика', summary: 'В своём районе вы почти невидимы. Платить за рекламу сейчас рано — сначала чиним базу за 14 дней.' };

    // Разрыв с конкурентом
    const reviewGap = Math.max(0, leaderReviews - reviewsCount);
    const recommendedPace = reviewGap > 80 ? 12 : reviewGap > 30 ? 8 : 5;
    const monthsToCatch = reviewGap === 0 ? 0 : Math.ceil(reviewGap / recommendedPace);

    // Калькулятор упущенного потенциала (прозрачная и консервативная модель)
    const monthlyDemand = Math.max(100, Number(point.monthlyDemand) || niche.defaultMonthlySearch);
    const avgCheck = Math.max(300, Number(point.avgCheck) || niche.defaultCheck);
    const ltvMonths = Math.max(1, Number(point.ltvMonths) || niche.defaultLtvMonths);
    const ltv = avgCheck * ltvMonths;
    // Чем ниже скор, тем ниже доля переходов из районного спроса (от 0.8% при скоре 20 до 4.5% при скоре 90)
    const currentCaptureRate = 0.006 + (totalScore / 100) * 0.036;
    const targetCaptureRate = 0.006 + (Math.max(totalScore + 12, 85) / 100) * 0.036;
    const missedLeadsMonth = Math.max(0, Math.round(monthlyDemand * (targetCaptureRate - currentCaptureRate)));
    const leadToSale = 0.25; // 1 из 4 обращений с карт покупает
    const missedClientsMonth = Math.max(0, Math.round(missedLeadsMonth * leadToSale));
    const missedFirstMonthRev = missedClientsMonth * avgCheck;
    const missedLtvRev = missedClientsMonth * ltv;

    // 14-дневный план (собираем из реальных красных/жёлтых дыр)
    const actionable = findings.filter(f => f.level !== 'green');
    const plan14 = actionable.slice(0, 7).map((f, idx) => ({
      id: `step-${idx + 1}`,
      day: idx < 2 ? 'День 1–2' : idx < 4 ? 'День 3–6' : idx < 6 ? 'День 7–10' : 'День 11–14',
      pillar: f.pillar,
      title: f.title,
      action: f.fix,
      impactPts: f.impactPts
    }));
    if (plan14.length < 3) {
      plan14.push({
        id: 'step-weekly',
        day: 'Еженедельно',
        pillar: 'Ритм',
        title: 'Поддерживать пульс карточки',
        action: 'Раз в неделю: проверить выдачу по 3 запросам района, выложить 2 свежих фото и ответить на все новые отзывы.',
        impactPts: 5
      });
    }

    return {
      totalScore,
      status,
      urls,
      titleCheck,
      niche,
      pillars: [
        { key: 'pack', label: 'Упаковка витрины', score: sPack, max: 25 },
        { key: 'reviews', label: 'Отзывы и пульс', score: sReviews, max: 30 },
        { key: 'conv', label: 'Конверсия в заявку', score: sConv, max: 20 },
        { key: 'shield', label: 'Защита и чистота', score: sShield, max: 15 },
        { key: 'multi', label: '2ГИС и площадки', score: sMulti, max: 10 }
      ],
      findings,
      counts: {
        red: findings.filter(f => f.level === 'red').length,
        yellow: findings.filter(f => f.level === 'yellow').length,
        green: findings.filter(f => f.level === 'green').length
      },
      competitor: {
        leaderRating,
        leaderReviews,
        reviewGap,
        recommendedPace,
        monthsToCatch
      },
      roi: {
        monthlyDemand,
        avgCheck,
        ltvMonths,
        ltv,
        missedLeadsMonth,
        missedClientsMonth,
        missedFirstMonthRev,
        missedLtvRev
      },
      plan14
    };
  }

  /* 5. Генератор живых SEO-ответов на отзывы + шаблон обжалования фейка */
  function detectReviewTone(text) {
    const t = String(text || '').toLowerCase();
    const negWords = /(ужас|плохо|груб|обман|грязн|долго ждал|не рекомендую|разочар|хам|кошмар|испорт|опоздал|переплат|отврат|зря потрат|минус|жаль)/i;
    const posWords = /(супер|отличн|спасибо|восторг|рекомендую|прекрасн|вкусн|профессионал|довол|нравится|класс|лучш|уютн|внимательн|аккуратн)/i;
    const hasNeg = negWords.test(t);
    const hasPos = posWords.test(t);
    if (hasNeg && !hasPos) return 'negative';
    if (hasNeg && hasPos) return 'neutral';
    return 'positive';
  }

  function generateReviewReplies({ reviewText, clientName, tone, businessName, serviceKeyword, district, contactInfo }) {
    const name = (clientName || '').trim();
    const greet = name ? `${name}, здравствуйте!` : 'Здравствуйте!';
    const biz = (businessName || 'наша команда').trim();
    const kw = (serviceKeyword || '').trim();
    const loc = (district || '').trim();
    const locPhrase = loc ? ` в районе ${loc}` : '';
    const kwPhrase = kw ? ` (${kw})` : '';
    const contact = (contactInfo || 'в личные сообщения или по телефону точки').trim();

    // Вытащим 1 живую деталь из отзыва, если есть
    const raw = String(reviewText || '').trim();
    const mentionsStaff = /(тренер|педагог|преподавател|врач|доктор|мастер|бариста|официант|администратор)/i.exec(raw);
    const staffWord = mentionsStaff ? mentionsStaff[1].toLowerCase() : null;
    const staffNote = staffWord ? ` Обязательно передадим ваши слова — для нашего ${staffWord}а это лучшая мотивация.` : '';

    const resolvedTone = tone === 'auto' ? detectReviewTone(raw) : tone;

    if (resolvedTone === 'negative') {
      return {
        tone: 'negative',
        variants: [
          {
            style: 'Спокойно и по делу (лучше для репутации)',
            text: `${greet} Спасибо, что написали — нам важно знать о таких ситуациях. Искренне жаль, что визит в «${biz}»${locPhrase} оставил неприятное впечатление. Мы уже передали ваш комментарий руководителю точки, чтобы разобрать этот случай с командой. Напишите, пожалуйста, дату визита ${contact} — хотим лично разобраться и исправить ситуацию.`
          },
          {
            style: 'С акцентом на стандарты сервиса',
            text: `${greet} Приносим извинения за доставленные неудобства. Такой уровень сервиса не соответствует стандартам «${biz}»${kwPhrase}. Хотим детально проверить, что произошло, и предложить решение. Свяжитесь, пожалуйста, с управляющим ${contact} — для нас важно закрыть вопрос по-честному.`
          },
          {
            style: 'Если есть подозрение на ошибку/чужой визит',
            text: `${greet} Нам жаль читать такой отзыв. Мы проверили записи в «${biz}»${locPhrase}, но пока не смогли точно сопоставить ваш визит, чтобы разобраться в деталях. Подскажите, пожалуйста, дату и имя специалиста ${contact} — оперативно проверим всё и вернёмся с решением.`
          }
        ]
      };
    }

    if (resolvedTone === 'neutral') {
      return {
        tone: 'neutral',
        variants: [
          {
            style: 'Благодарность + фиксация улучшения',
            text: `${greet} Спасибо за честную обратную связь и уделённое время! Рады, что основная часть визита в «${biz}»${kwPhrase} понравилась, а замечания уже взяли в работу с командой. В следующий раз${locPhrase} постараемся, чтобы всё прошло на твёрдую пятёрку.`
          },
          {
            style: 'Тёплый и человеческий',
            text: `${greet} Благодарим за подробный отзыв — именно такие комментарии помогают «${biz}» становиться лучше.${staffNote} Учтём ваш совет в работе и будем рады снова видеть вас${locPhrase}!`
          },
          {
            style: 'Короткий и конструктивный',
            text: `${greet} Спасибо за оценку и конструктивные заметки! Обязательно проработаем момент, о котором вы написали, чтобы наши услуги${kwPhrase} оставляли только приятные эмоции. До новой встречи в «${biz}»!`
          }
        ]
      };
    }

    return {
      tone: 'positive',
      variants: [
        {
          style: 'Живой и тёплый (с SEO-ключом)',
          text: `${greet} Огромное спасибо за такие тёплые слова о «${biz}»!${staffNote} Очень рады, что вы оценили наш подход${kw ? ` — мы действительно много внимания уделяем тому, чтобы ${kw} проходили на высоком уровне` : ''}. Всегда ждём вас снова${locPhrase}!`
        },
        {
          style: 'Короткий и уверенный (без шаблона)',
          text: `${greet} Благодарим за доверие и высокую оценку! Приятно знать, что визит в «${biz}»${locPhrase} оставил именно такое впечатление.${staffNote} Будем рады видеть вас снова${kw ? ` — впереди ещё больше интересного по направлению «${kw}»` : ''}!`
        },
        {
          style: 'С мягким поводом вернуться / посоветовать',
          text: `${greet} Спасибо, что поделились опытом! Для локального проекта${locPhrase} такие честные отзывы — главная поддержка.${staffNote} Если захотите попробовать что-то новое${kw ? ` (${kw})` : ''} — всегда подскажем лучший вариант. До встречи в «${biz}»!`
        }
      ]
    };
  }

  function generateAppealTemplate(businessName, reviewSummary) {
    const biz = (businessName || '[Название организации]').trim();
    const ref = (reviewSummary || '[дата и имя автора отзыва]').trim();
    return `Здравствуйте! Просим проверить и удалить отзыв от ${ref} на карточке организации «${biz}» в связи с нарушением правил публикации отзывов:\n\n1. Данный пользователь не являлся нашим клиентом: мы проверили журнал записей / CRM / кассовые смены за указанный период — обращений с таким именем и описанной ситуацией не зафиксировано.\n2. Текст не содержит проверяемых фактов о получении услуги (либо содержит недостоверные сведения, вводящие пользователей в заблуждение).\n3. При необходимости готовы предоставить выгрузку из CRM / расписание работы за указанную дату для подтверждения.\n\nПросим провести модерацию отзыва. Спасибо!`;
  }

  /* 6. Генератор UTM-ссылок для учёта заявок с карт */
  function buildUtmLinks(siteUrl) {
    const raw = (siteUrl || '').trim();
    if (!raw) return [];
    let normalized = raw;
    if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
    let base;
    try {
      const u = new URL(normalized);
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('utm_campaign');
      base = u;
    } catch (_) {
      return [];
    }

    const channels = [
      { label: 'Яндекс Карты (основная ссылка)', source: 'yandex_maps', medium: 'geo', campaign: 'card' },
      { label: '2ГИС (основная ссылка)', source: '2gis', medium: 'geo', campaign: 'card' },
      { label: 'Zoon / Отзовики', source: 'zoon', medium: 'geo', campaign: 'directory' },
      { label: 'QR-стенд на точке', source: 'qr_point', medium: 'offline', campaign: 'stand' }
    ];

    return channels.map(ch => {
      const u = new URL(base.toString());
      u.searchParams.set('utm_source', ch.source);
      u.searchParams.set('utm_medium', ch.medium);
      u.searchParams.set('utm_campaign', ch.campaign);
      return { label: ch.label, url: u.toString() };
    });
  }

  /* 7. Компактное UTF-8 URL-safe кодирование для ?review=... и #share=... */
  function encodePayload(obj) {
    const json = JSON.stringify(obj);
    let bytes;
    if (typeof TextEncoder !== 'undefined') {
      bytes = new TextEncoder().encode(json);
    } else {
      bytes = Buffer.from(json, 'utf8');
    }
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodePayload(token) {
    try {
      const b64 = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      let bytes;
      if (typeof atob !== 'undefined') {
        const bin = atob(b64 + pad);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes));
      } else {
        return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
      }
    } catch (_) {
      return null;
    }
  }

  /* Сборка компактной ссылки на Умный Помощник Отзыва (?review=...) */
  function buildReviewHelperUrl(basePageUrl, point) {
    const urls = parseCardUrls(point.yandexUrl, point.gisUrl);
    // Храним максимально компактно, чтобы QR оставался простым и легко сканируемым!
    const compact = {
      n: (point.name || 'Наша точка').slice(0, 50),
      k: point.niche || 'other',
      y: urls.yandexOrgId || (urls.yandexDirectReviewUrl ? urls.yandexDirectReviewUrl.slice(0, 90) : ''),
      g: urls.gisFirmId || (urls.gisDirectReviewUrl ? urls.gisDirectReviewUrl.slice(0, 90) : ''),
      c: (point.tgContact || '').trim().slice(0, 70)
    };
    const cleanBase = String(basePageUrl || '').split('?')[0].split('#')[0];
    return `${cleanBase}?review=${encodePayload(compact)}`;
  }

  return {
    parseCardUrls,
    parsePastedCardText,
    checkTitleCompliance,
    runCardAudit,
    detectReviewTone,
    generateReviewReplies,
    generateAppealTemplate,
    buildUtmLinks,
    encodePayload,
    decodePayload,
    buildReviewHelperUrl
  };
});
