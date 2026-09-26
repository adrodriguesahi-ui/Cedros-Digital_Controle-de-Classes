-- Libera o PRIMEIRO Administrador do clube.
-- 1) Cadastre-se normalmente pelo app ("Cadastre-se"), com o seu e-mail.
-- 2) Troque o e-mail abaixo pelo que você usou e rode este arquivo no SQL Editor do Supabase.
-- Depois disso, os próximos cadastros são aprovados pelo próprio app
-- (Administração → Aprovações Pendentes).

update usuarios
   set aprovado = true,
       papel = 'Administrador'
 where lower(email) = lower('SEU-EMAIL@exemplo.com');

select nome, email, papel, aprovado from usuarios where papel = 'Administrador';
