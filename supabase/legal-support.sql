alter table public.usuarios
  add column if not exists accepted_terms_at timestamptz,
  add column if not exists accepted_privacy_at timestamptz,
  add column if not exists age_confirmed boolean not null default false;

update public.usuarios
set age_confirmed = true
where idade >= 18
  and age_confirmed = false;

create table if not exists public.suporte_mensagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.usuarios(id) on delete set null,
  email text,
  categoria text not null check (categoria in ('Bug', 'Conta', 'Seguranca', 'Denuncia', 'Outro')),
  mensagem text not null check (char_length(trim(mensagem)) between 8 and 900),
  criado_em timestamptz not null default now()
);

create index if not exists suporte_mensagens_user_idx on public.suporte_mensagens (user_id, criado_em desc);
create index if not exists suporte_mensagens_criado_idx on public.suporte_mensagens (criado_em desc);

alter table public.suporte_mensagens enable row level security;

drop policy if exists "Usuario envia suporte" on public.suporte_mensagens;
create policy "Usuario envia suporte"
on public.suporte_mensagens for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuario ve os proprios chamados" on public.suporte_mensagens;
create policy "Usuario ve os proprios chamados"
on public.suporte_mensagens for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.criar_usuario_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (
    id,
    username,
    nome,
    idade,
    cidade,
    bio,
    accepted_terms_at,
    accepted_privacy_at,
    age_confirmed
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), nullif(new.raw_user_meta_data->>'nome', ''), 'Usuario discreto'),
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), nullif(new.raw_user_meta_data->>'username', ''), 'Usuario discreto'),
    nullif(new.raw_user_meta_data->>'idade', '')::integer,
    new.raw_user_meta_data->>'cidade',
    coalesce(new.raw_user_meta_data->>'bio', ''),
    nullif(new.raw_user_meta_data->>'accepted_terms_at', '')::timestamptz,
    nullif(new.raw_user_meta_data->>'accepted_privacy_at', '')::timestamptz,
    coalesce(nullif(new.raw_user_meta_data->>'age_confirmed', '')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_after on auth.users;
create trigger on_auth_user_created_after
after insert on auth.users
for each row execute function public.criar_usuario_padrao();
