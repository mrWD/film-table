# FilmTable

**→ [mrwd.github.io/film-table](https://mrwd.github.io/film-table/)**

Личный трекер сериалов и фильмов — замена закрытому TV Time. Работает на **Android,
iPhone и в вебе** из одной кодовой базы (PWA), **без бэкенда и без API-ключей**: все
данные хранятся на устройстве, метаданные берутся из бесплатных API.

## Возможности

- **Shows / Watch List** — секции Watch Next, Haven't Started Yet, Haven't Watched For A
  While; карточка показывает следующий эпизод (`S03 | E01 +3`), чек-ин в один тап с Undo,
  переключение список/сетка.
- **Shows / Upcoming** — будущие эпизоды ваших сериалов: Today / день недели / Later,
  время и канал, отсчёт «7 DAYS», бейджи PREMIERE / NEW / AIRED / LATEST.
- **Страница сериала** — прогресс x/y, кнопка «Check in», сезоны с отметкой целиком,
  список эпизодов с датами, Stop watching / Resume / Remove.
- **Movies** — watch list / watched, невышедшие фильмы с отсчётом до релиза.
- **Explore** — поиск сериалов (TVmaze) и фильмов (iTunes), Airing tonight и Popular
  this week.
- **Profile** — статистика времени и эпизодов, полки по статусам, **экспорт/импорт
  JSON-бэкапа**, полный сброс.
- **PWA** — ставится на домашний экран iPhone/Android, работает офлайн (service worker),
  тёмная тема по системной настройке.

## Данные

| Источник | Что | Ключ |
|---|---|---|
| [TVmaze API](https://www.tvmaze.com/api) | сериалы, сезоны, эпизоды, расписание (CC BY-SA) | не нужен |
| iTunes Search API | фильмы: постер, жанр, хронометраж, дата релиза | не нужен |

Пользовательские данные — только в `localStorage` устройства (ключи
`filmtable-library-v1` / `filmtable-cache-v1`). Синхронизации между устройствами нет —
переносите библиотеку через Profile → Export/Import.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
```

Продакшен-сборка:

```bash
npm run build      # статика в dist/
npm run preview    # http://localhost:4173
```

`scripts/gen-icons.mjs` перегенерирует PNG-иконки из `public/favicon.svg` (нужен dev-пакет sharp).

## Деплой

Живёт на GitHub Pages: <https://mrwd.github.io/film-table/>. Деплой автоматический —
`.github/workflows/deploy.yml` собирает и публикует сайт при каждом пуше в `main`:

```bash
git push          # через ~1 минуту изменения на проде
```

Подпуть репозитория подставляется через переменную `BASE_PATH` (`/film-table/`), локально
сборка остаётся на корне. Поэтому проект без правок переносится на любой другой хостинг
статики: **Netlify Drop** (перетащить `dist/` на <https://app.netlify.com/drop>),
**Vercel** (`npx vercel`) или Cloudflare Pages. Роутинг хэшовый — SPA-fallback не нужен.

## Установка на телефон

Откройте <https://mrwd.github.io/film-table/> и добавьте на домашний экран:

- **iPhone (Safari)**: Поделиться → «На экран „Домой"»
- **Android (Chrome)**: меню ⋮ → «Добавить на главный экран» (или баннер «Установить»)

Приложение получит иконку, откроется в полноэкранном режиме и будет работать офлайн.

## Ограничения и планы

- iTunes отдаёт только фильмы, доступные в цифровом магазине: кинотеатральных анонсов
  без цифрового предзаказа там нет. Полные анонсы = TMDB (нужен бесплатный ключ) —
  архитектура позволяет добавить его как второй провайдер.
- Нет облачной синхронизации (принципиально нет бэкенда) — есть ручной бэкап.
- В сторы (APK/IPA) тот же код можно упаковать через Capacitor.

## Структура

```
src/
  lib/        типы, TVmaze/iTunes клиенты (+JSONP-fallback), форматирование
  store/      zustand: library (persist), кэш шоу, explore, ui (тосты/диалоги)
  store/selectors.ts   вся логика: следующий эпизод, +N, секции, upcoming, статистика
  components/ иконки, UI-примитивы, карточки
  pages/      Shows / Movies / Explore / ShowDetail / MovieDetail / Profile
docs/PLAN.md  план и дизайн-решения
```
