-- ═══════════════════════════════════════════════════════════════════════════
-- T3 — Tabla de casos (Case Management + SLA)
-- Rebit AML & KYB Tool v3.8.0
-- ═══════════════════════════════════════════════════════════════════════════
-- Script IDEMPOTENTE: se puede pegar en el SQL Editor de Supabase las veces que
-- haga falta sin romper nada. NO toca ninguna tabla existente.

create table if not exists public.casos (
  id          text primary key,
  legajo_id   text,
  ref         text,
  estado      text not null default 'NUEVA',
  prioridad   text not null default 'MEDIA',
  origen      text not null default 'MANUAL',
  analista    text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índices para la bandeja: filtrado por estado y por legajo, y orden por fecha
create index if not exists casos_estado_idx    on public.casos (estado);
create index if not exists casos_legajo_idx    on public.casos (legajo_id);
create index if not exists casos_updated_idx   on public.casos (updated_at desc);

-- Dedupe de casos generados desde señales: un caso por (período, patrón).
-- Los campos viven dentro de data; el índice único se arma sobre la expresión.
create unique index if not exists casos_senal_uniq
  on public.casos ((data->>'periodoId'), (data->>'pat'))
  where data->>'periodoId' is not null
    and data->>'periodoId' <> ''
    and data->>'pat' is not null
    and data->>'pat' <> '';

-- RLS: la app entra siempre con la service key desde /api/sync, igual que
-- legajos y periodos. Se deja habilitada sin políticas públicas.
alter table public.casos enable row level security;

-- Verificación
select
  (select count(*) from public.casos) as casos_existentes,
  (select count(*) from pg_indexes where tablename = 'casos') as indices;

-- ═══════════════════════════════════════════════════════════════════════════
-- T4 — Dedupe de casos originados en vencimientos del calendario regulatorio
-- ═══════════════════════════════════════════════════════════════════════════
-- Un caso por vencimiento. Igual que casos_senal_uniq, es un índice parcial
-- sobre una expresión del jsonb. Idempotente.

create unique index if not exists casos_venc_uniq
  on public.casos ((data->>'vencKey'))
  where data->>'vencKey' is not null and data->>'vencKey' <> '';

select count(*) as indices_casos from pg_indexes where tablename = 'casos';
