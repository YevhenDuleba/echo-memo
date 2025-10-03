-- Видалити існуючі записи (оскільки немає користувачів для прив'язки)
DELETE FROM public.notes;

-- Додати user_id до таблиці notes
ALTER TABLE public.notes 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;

-- Видалити старі публічні RLS політики
DROP POLICY IF EXISTS "Публічний доступ для перегляду но" ON public.notes;
DROP POLICY IF EXISTS "Публічний доступ для створення но" ON public.notes;
DROP POLICY IF EXISTS "Публічний доступ для оновлення но" ON public.notes;
DROP POLICY IF EXISTS "Публічний доступ для видалення но" ON public.notes;

-- Створити нові RLS політики для автентифікованих користувачів
CREATE POLICY "Користувачі можуть переглядати свої нотатки"
ON public.notes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Користувачі можуть створювати свої нотатки"
ON public.notes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Користувачі можуть оновлювати свої нотатки"
ON public.notes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Користувачі можуть видаляти свої нотатки"
ON public.notes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Створити таблицю для rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  action_count integer DEFAULT 0,
  window_start timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, action_type)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS для rate_limits (лише service_role може читати/писати)
CREATE POLICY "Service role може керувати rate limits"
ON public.rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Оновити storage bucket audio на приватний
UPDATE storage.buckets 
SET public = false 
WHERE id = 'audio';

-- Видалити старі публічні storage політики
DROP POLICY IF EXISTS "Публічний доступ до аудіо 1jcr2e5_0" ON storage.objects;
DROP POLICY IF EXISTS "Публічний доступ до аудіо 1jcr2e5_1" ON storage.objects;
DROP POLICY IF EXISTS "Публічний доступ до аудіо 1jcr2e5_2" ON storage.objects;
DROP POLICY IF EXISTS "Публічний доступ до аудіо 1jcr2e5_3" ON storage.objects;

-- Створити нові приватні storage політики
CREATE POLICY "Користувачі можуть завантажувати свої аудіофайли"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Користувачі можуть переглядати свої аудіофайли"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Користувачі можуть оновлювати свої аудіофайли"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audio' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Користувачі можуть видаляти свої аудіофайли"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);