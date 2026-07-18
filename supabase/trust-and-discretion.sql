alter table public.usuarios
add column if not exists foto_visivel boolean default true,
add column if not exists perfil_verificado boolean default false,
add column if not exists score_completude integer default 0;

update public.usuarios
set foto_visivel = coalesce(foto_visivel, true),
    perfil_verificado = coalesce(perfil_verificado, false),
    score_completude = greatest(
      0,
      least(
        100,
        (case when idade >= 18 then 35 else 0 end) +
        (case when coalesce(nullif(username, ''), nullif(nome, '')) is not null then 20 else 0 end) +
        (case when coalesce(nullif(cidade, ''), '') <> '' then 20 else 0 end) +
        (case when coalesce(nullif(bio, ''), '') <> '' then 20 else 0 end) +
        (case when coalesce(nullif(foto, ''), '') <> '' and coalesce(foto_visivel, true) then 5 else 0 end)
      )
    );

create index if not exists usuarios_confianca_idx
on public.usuarios (perfil_verificado desc, status_online desc, criado_em desc);

notify pgrst, 'reload schema';
