# Security Policy

## Overview
Застосунок "Аудіонотатки" використовує захищену архітектуру з автентифікацією, RLS політиками та серверними функціями.

## Security Features

### Authentication
- Email/password автентифікація через Supabase Auth
- Автоматичне підтвердження email (для розробки)
- JWT токени для авторизації

### Database Security
- Row Level Security (RLS) увімкнено на всіх таблицях
- Користувачі мають доступ лише до своїх нотаток
- `user_id` обов'язковий для всіх записів

### Storage Security
- Приватний bucket `audio`
- Файли організовані за структурою `{user_id}/{uuid}.{ext}`
- Доступ лише через signed URLs (TTL: 24 години)

### Rate Limiting
- Максимум 20 транскрипцій на добу
- Максимум 120 chunk транскрипцій на годину
- Захист від зловживання API

### Server-Side Security
- Всі чутливі операції виконуються на сервері
- API ключі зберігаються лише на backend
- Валідація MIME типів та розміру файлів (макс 50MB)

## Secrets Management
Ніколи не комітьте у Git:
- `.env` файли
- API ключі (OPENAI_API_KEY)
- Service role ключі

Використовуйте Lovable Cloud dashboard для управління секретами.

## Reporting Vulnerabilities
Якщо ви знайшли вразливість, будь ласка, повідомте через приватні канали.
