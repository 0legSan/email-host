# @workspace/pwa

Переиспользуемая PWA-инфраструктура для workspace-проектов.

- `@workspace/pwa/client` — browser Web Push: permission, подписка, синхронизация и отключение.
- `@workspace/pwa/react` — регистрация service worker, периодическая проверка и применение обновлений.
- `@workspace/pwa/service-worker` — precache, offline fallback, push lifecycle, badge и notification click.
- `@workspace/pwa/server` — отправка Web Push с VAPID и удаление истёкших подписок через адаптер.
- `@workspace/pwa/vite` — настройка custom service worker build для Vite/Rolldown.

Приложение передаёт пакету API endpoints, иконки, fallback payload и доменные обработчики. Хранение подписок не привязано к ORM: server entrypoint принимает готовые записи и callbacks `toSubscription`/`onGone`.
