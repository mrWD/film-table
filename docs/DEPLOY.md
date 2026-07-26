# Деплой

## Сейчас: GitHub Pages

Прод — <https://mrwd.github.io/film-table/>. Деплой автоматический: пуш в `main` запускает
`.github/workflows/deploy.yml`, через минуту изменения на сайте.

Подпуть репозитория подставляется переменной `BASE_PATH=/film-table/`; локально сборка
собирается на корень. Ветки не деплоятся — workflow слушает только `main`.

Проверить, что задеплоена именно текущая версия: хеш бандла на проде должен совпадать с
локальным.

```bash
curl -s https://mrwd.github.io/film-table/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
```

## Переезд на Vercel (ветка `vercel-tmdb`, не выполнен)

Нужен, потому что GitHub Pages не умеет серверный код, а ключ TMDB обязан жить на сервере.
Vercel хостит статику и функцию под одним доменом.

### Шаги для владельца

1. Завести аккаунт на vercel.com через GitHub.
2. **Add New → Project**, выбрать репозиторий `mrWD/film-table`. Vite определится сам:
   команда сборки `npm run build`, каталог `dist`.
3. **Settings → Environment Variables** добавить `TMDB_API_KEY` — значение ключа TMDB
   (подходит и короткий API Key, и длинный Read Access Token). Больше нигде ключ не нужен.
4. Задеплоить. Приложение окажется на `film-table.vercel.app`.
5. Проверить, что прокси жив:
   ```bash
   curl -s "https://film-table.vercel.app/api/tmdb/search/movie?query=the+matrix" | head -c 200
   ```
6. Если домен получился другим — поправить `NEW_HOME` в
   `src/components/MigrationBanner.tsx` и `VITE_API_BASE` в `.github/workflows/deploy.yml`.

### Что произойдёт с данными пользователей

`localStorage` привязан к домену и на новый домен **не переезжает**. Библиотека, собранная
на `mrwd.github.io`, там и останется. Для этого сделан баннер на старом адресе: он
объясняет ситуацию и отправляет в Профиль → Export, а на новом адресе нужно сделать Import.

Старый адрес продолжает работать: GitHub Pages остаётся, а его сборка получает
`VITE_API_BASE`, указывающий на прокси Vercel (CORS это разрешает).

## Локальная проверка прокси без деплоя

```bash
echo 'TMDB_API_KEY=<ключ>' > .env.local          # файл в .gitignore
node --env-file=.env.local scripts/dev-api.mjs   # прокси на :3001
VITE_API_BASE=http://localhost:3001 npx vite     # фронт
```

Что стоит проверить (всё это уже ловило реальные дефекты):

```bash
curl -s "localhost:3001/api/tmdb/search/movie?query=the+matrix"            # 200, есть The Matrix
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3001/api/tmdb/account/lists"   # 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
     "localhost:3001/api/tmdb/search/movie?query=x"                        # 403
curl -s "localhost:3001/api/tmdb/movie/603" | grep -c "eyJhbGci"           # 0 — ключ не течёт
```

## Альтернативные хостинги

Проект — статика плюс одна функция, поэтому переносится и на Netlify, и на Cloudflare
Pages. Ключевое требование: функция должна отвечать по пути `/api/tmdb/*`, иначе клиент
её не найдёт и молча уйдёт на keyless-источники.

## Правила безопасности

Ключ TMDB не должен попадать: в репозиторий, в клиентский бандл, в переписку. Только
переменные окружения хостинга и локальный `.env.local`, который в `.gitignore`.

Если ключ засветился — перевыпустить в настройках TMDB и обновить переменную в Vercel.
Старый после перевыпуска перестаёт работать.
