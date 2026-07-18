# Capacidade de lançamento do AFTER

## Situação atual

- Banco utilizado: 15 MB.
- Índices principais aplicados.
- Consultas de presença, conversas e descoberta foram reduzidas e filtradas.
- A aplicação não mantém conexão direta com o PostgreSQL em cada aparelho; usa APIs e Realtime do Supabase.

## Limite prático

O número de cadastros não é o mesmo que usuários simultaneamente conectados.

- O Supabase Free inclui até 50.000 usuários ativos mensais, mas somente 200 conexões Realtime simultâneas.
- O Supabase Pro inclui até 100.000 usuários ativos mensais, mas o limite padrão é 500 conexões Realtime simultâneas.
- Para aproximadamente 10.000 usuários simultâneos com Realtime é necessário Pro sem limite de gastos ou acordo superior, aumento do limite Realtime e compute dimensionado.

## Recomendação antes do lançamento público

1. Utilizar plano Pro, nunca Free para produção pública.
2. Desativar o limite de gastos somente com alertas de orçamento configurados.
3. Solicitar ao Supabase limite de 10.000 conexões Realtime.
4. Iniciar no mínimo com compute Small e monitorar CPU, memória, conexões e latência.
5. Executar teste de carga progressivo em ambiente separado antes de divulgar para milhares de usuários.
6. Monitorar egress e armazenamento de fotos, pois tendem a crescer mais rápido que o banco.
