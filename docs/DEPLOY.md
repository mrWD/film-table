# Деплой

Приложение живёт на **двух** адресах сразу, и это не дубль, а следствие переезда.

| Адрес | Что это | TMDB |
|---|---|---|
| <https://film-table.vercel.app> | основной, статика + функция `/api/tmdb` | да, свой прокси |
| <https://mrwd.github.io/film-table/> | прежний, остаётся ради уже собранных библиотек | да, через прокси Vercel |

## Vercel — основной

Пуш в `main` — Vercel собирает и выкладывает сам.

Одна переменная окружения: `TMDB_API_KEY` в **Settings → Environment Variables** (подходит
и короткий API Key, и длинный Read Access Token). Больше ключ нигде не нужен. Без него
прокси отдаёт 503, а клиент молча уходит на Cinemeta и iTunes — приложение работает, но
качество поиска фильмов падает.

```bash
curl -s "https://film-table.vercel.app/api/tmdb?path=search/movie&query=the+matrix" | head -c 200
```

## GitHub Pages — прежний адрес

`.github/workflows/deploy.yml` на пуш в `main` собирает и публикует. Подпуть подставляется
переменной `BASE_PATH=/film-table/`.

**Важно и неочевидно:** этой сборке передаётся `VITE_API_BASE=https://film-table.vercel.app`,
поэтому старый адрес ходит за TMDB в прокси на Vercel через CORS. То есть Pages —
полноценная версия, а не урезанная. Проверяется по бандлу:

```bash
BUNDLE=$(curl -s https://mrwd.github.io/film-table/ | grep -o '/film-table/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://mrwd.github.io$BUNDLE" | grep -o 'https://film-table.vercel.app'
```

Собственного `/api/tmdb` у Pages нет и быть не может — статический хостинг не исполняет
серверный код. Прямой запрос туда вернёт 404, и это нормально.

### Почему старый адрес не выключен

`localStorage` привязан к домену и на новый домен **не переезжает**. Библиотека, собранная
на `mrwd.github.io`, там и осталась. Поэтому на старом адресе висит `MigrationBanner`
(`src/components/MigrationBanner.tsx`): показывается только при `hostname === OLD_HOST`,
объясняет ситуацию и отправляет в Профиль → Export, а на новом адресе нужен Import.

Выключать Pages нельзя, пока есть шанс, что там лежит чья-то библиотека без бэкапа.
Если адрес всё же меняется — править `NEW_HOME` в баннере и `VITE_API_BASE` в workflow.

## Проверить, что задеплоена текущая версия

Хеш бандла на проде должен совпадать с локальным:

```bash
curl -s https://film-table.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
```

**Не опрашивать прод в цикле.** Частые запросы включают Vercel Security Checkpoint, и прод
начинает отдавать 403 на всё подряд — выглядит как поломка приложения, но проходит само.

Service worker отдаёт прошлую сборку, поэтому перед проверкой в браузере:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
for (const k of await caches.keys()) await caches.delete(k)
location.reload()
```

Переход по адресу, который отличается **только хэшем**, страницу не перезагружает:
приложение остаётся с прежним состоянием в памяти, и подложенные в `localStorage` данные
не подхватываются. Нужен явный `location.reload()`.

## Локальная проверка прокси без деплоя

```bash
echo 'TMDB_API_KEY=<ключ>' > .env.local             # файл в .gitignore
node --env-file=.env.local scripts/dev-api.mjs      # прокси на :3001
VITE_API_BASE=http://localhost:3001 npx vite        # фронт
```

Что стоит проверить (всё это уже ловило реальные дефекты):

```bash
curl -s "localhost:3001/api/tmdb?path=search/movie&query=the+matrix"       # 200, есть The Matrix
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3001/api/tmdb?path=account/lists"  # 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
     "localhost:3001/api/tmdb?path=search/movie&query=x"                   # 403
curl -s "localhost:3001/api/tmdb?path=movie/603" | grep -c "eyJhbGci"      # 0 — ключ не течёт
```

## Альтернативные хостинги

Проект — статика плюс одна функция, поэтому переносится и на Netlify, и на Cloudflare
Pages. Ключевое требование: функция должна отвечать по пути `/api/tmdb`, иначе клиент
её не найдёт и молча уйдёт на keyless-источники.

## Правила безопасности

Ключ TMDB не должен попадать: в репозиторий, в клиентский бандл, в переписку. Только
переменные окружения хостинга и локальный `.env.local`, который в `.gitignore`.

Если ключ засветился — перевыпустить в настройках TMDB и обновить переменную в Vercel.
Старый после перевыпуска перестаёт работать.
