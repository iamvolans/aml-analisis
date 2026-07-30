-- ═══════════════════════════════════════════════════════════════════════════
-- T7b — Gestión documental (adjuntos por legajo con versionado)
-- Rebit AML & KYB Tool v3.15.0
-- ═══════════════════════════════════════════════════════════════════════════
-- Script IDEMPOTENTE. No toca ninguna tabla existente.

-- ── Bucket privado de Storage ────────────────────────────────────────────────
-- public=false: los archivos NO son accesibles por URL directa. La app entrega
-- URLs firmadas de vida corta generadas desde el servidor.
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- ── Metadatos de cada documento ─────────────────────────────────────────────
-- El archivo vive en Storage; acá vive lo que importa para compliance: a qué
-- legajo pertenece, qué ítem del checklist acredita, de qué fecha es el
-- documento, quién lo subió y cuándo.
create table if not exists public.documentos (
  id             text primary key,
  legajo_id      text not null,
  tipo           text,                    -- ítem del checklist que acredita
  nombre         text not null,           -- nombre original del archivo
  path           text not null,           -- ruta dentro del bucket
  mime           text,
  tamano         bigint,
  fecha_doc      text,                    -- fecha del documento (DD/MM/AAAA)
  version        int not null default 1,
  vigente        boolean not null default true,
  subido_por     text,
  subido_at      timestamptz not null default now(),
  notas          text
);

create index if not exists documentos_legajo_idx on public.documentos (legajo_id);
create index if not exists documentos_tipo_idx   on public.documentos (legajo_id, tipo);
create index if not exists documentos_fecha_idx  on public.documentos (subido_at desc);

alter table public.documentos enable row level security;

-- Verificación
select
  (select count(*) from public.documentos) as documentos,
  (select count(*) from storage.buckets where id = 'documentos') as bucket_creado;
