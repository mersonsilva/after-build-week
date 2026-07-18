insert into public.usuarios (
  id,
  username,
  nome,
  idade,
  cidade,
  bio,
  foto_visivel,
  perfil_verificado,
  score_completude,
  status_online,
  mostrar_distancia
)
select
  auth.users.id,
  'Rafael Teste',
  'Rafael Teste',
  31,
  'Teresina',
  'Perfil criado para testar conversa real no AFTER.',
  true,
  true,
  95,
  true,
  true
from auth.users
where auth.users.email = 'tester@example.com'
on conflict (id) do update
set
  username = excluded.username,
  nome = excluded.nome,
  idade = excluded.idade,
  cidade = excluded.cidade,
  bio = excluded.bio,
  foto_visivel = excluded.foto_visivel,
  perfil_verificado = excluded.perfil_verificado,
  score_completude = excluded.score_completude,
  status_online = excluded.status_online,
  mostrar_distancia = excluded.mostrar_distancia;
