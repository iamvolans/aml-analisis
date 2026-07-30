-- ═══════════════════════════════════════════════════════════════════════════
-- T5 — Screening: listas restrictivas y corridas
-- Rebit AML & KYB Tool v3.11.0
-- ═══════════════════════════════════════════════════════════════════════════
-- Script IDEMPOTENTE. No toca ninguna tabla existente.

-- Listados cargados (REPET, OFAC, PEP, internos…). Una fila por lista; las
-- entradas van en jsonb. Guardar la versión es lo que hace auditable la corrida:
-- permite reproducir un match con el mismo listado que se usó ese día.
create table if not exists public.screening_listas (
  id          text primary key,
  nombre      text not null,
  fuente      text,
  version     text,
  cantidad    int not null default 0,
  entradas    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Corridas de screening. Cada una guarda snapshot de qué listas se usaron, con
-- qué umbrales, y todos los hits con su puntaje y criterio.
create table if not exists public.screening_runs (
  id          text primary key,
  fecha       timestamptz not null default now(),
  alcance     text,
  resumen     jsonb not null default '{}'::jsonb,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists screening_runs_fecha_idx on public.screening_runs (fecha desc);

alter table public.screening_listas enable row level security;
alter table public.screening_runs   enable row level security;

-- Verificación
select
  (select count(*) from public.screening_listas) as listas_cargadas,
  (select count(*) from public.screening_runs)   as corridas;
