# MAX Чат — тестовое задание

Веб-интерфейс для отправки и получения текстовых сообщений в мессенджере MAX через [GREEN-API](https://green-api.com/max).

## Локально

```sh
npm install
npm run dev
```

Откроется Vite dev-сервер (порт 3001 в `vite.config.ts`).

## Сборка

```sh
npm run build
```

Билд в папке `dist/`.

## GREEN-API

1. Войти с `apiUrl`, `idInstance`, `apiTokenInstance` из личного кабинета (например `https://3100.api.green-api.com`).
2. Создать чат по номеру (CheckAccount).
3. Отправка и приём через HTTP API из браузера (`incomingWebhook` включён, `webhookUrl` пустой).



## Скрипты


| Команда         | Описание                                       |
| --------------- | ---------------------------------------------- |
| `npm run dev`   | разработка                                     |
| `npm run build` | production → `dist/`                           |
| `npm run test`  | Vitest                                         |
| `./deploy.sh`   | pull + build на сервере (настроено для Apache) |




## Стек

React 19, Vite, TanStack Router, Tailwind CSS 4, запросы к GREEN-API с клиента.