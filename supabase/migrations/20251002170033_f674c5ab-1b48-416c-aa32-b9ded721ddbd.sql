-- Створення таблиці notes для зберігання аудіонотаток
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Аудіонотатка',
  summary TEXT,
  transcript TEXT,
  language TEXT,
  audio_url TEXT,
  duration_seconds NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Включаємо RLS для таблиці
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Політика: всі можуть переглядати нотатки (публічний демо-режим)
CREATE POLICY "Публічний доступ для перегляду нотаток"
  ON public.notes
  FOR SELECT
  USING (true);

-- Політика: всі можуть створювати нотатки
CREATE POLICY "Публічний доступ для створення нотаток"
  ON public.notes
  FOR INSERT
  WITH CHECK (true);

-- Політика: всі можуть оновлювати нотатки
CREATE POLICY "Публічний доступ для оновлення нотаток"
  ON public.notes
  FOR UPDATE
  USING (true);

-- Політика: всі можуть видаляти нотатки
CREATE POLICY "Публічний доступ для видалення нотаток"
  ON public.notes
  FOR DELETE
  USING (true);

-- Створення публічного bucket для зберігання аудіо
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Політики для storage bucket audio
CREATE POLICY "Публічний доступ для перегляду аудіо"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'audio');

CREATE POLICY "Публічний доступ для завантаження аудіо"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Публічний доступ для оновлення аудіо"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'audio');

CREATE POLICY "Публічний доступ для видалення аудіо"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'audio');