# Portal de Manuais — Tennis Place

Entrada: https://tennisplacebrasil.github.io/manuais-loja/acesso.html

## Carregamento e acesso

- A conta determina os portais disponíveis; a autorização é validada no Supabase.
- O menu do portal é um recurso separado (`shell`), de aproximadamente 24 KB.
- Cada manual é solicitado somente quando sua aba é escolhida.
- `manual_portal_load_resource` é uma função SECURITY INVOKER, disponível somente para authenticated. RLS valida a sessão ativa e a associação da conta em cada chamada.
- A chamada recebe portal, recurso e a revisão já carregada. Se a revisão continua igual, devolve somente metadados; o HTML existente é reutilizado.
- O cache fica apenas na memória da aba, limitado a 24 MiB, e é apagado ao sair. Não se usa cache persistente para os manuais protegidos.
- O visor informa o andamento do download e oferece nova tentativa em caso de falha. O conteúdo recebido não recebe tokens de autenticação.
- Imagens de capturas foram convertidas para WebP sem perdas, com comparação dos pixels e dimensões. Logo, textos, CSS e animações foram preservados.

## Conteúdo e manutenção

As tabelas `manual_portal_resources` e `manual_portal_resource_chunks` armazenam menu e manuais separados. A revisão é o SHA-256 do HTML UTF-8 concatenado na ordem de `part`. O tamanho e a quantidade de partes fazem parte dos metadados.

Ao atualizar um manual, publicar suas partes e sua revisão de forma atômica no Supabase. A próxima abertura detecta a revisão diferente e baixa o conteúdo atualizado. Nunca colocar conteúdo protegido ou chaves privilegiadas nos arquivos públicos.

As tabelas antigas de conteúdo foram mantidas para compatibilidade com abas que ainda estejam usando a versão anterior. O script de acesso tem nome versionado para a publicação nova.

O SQL da estrutura e das permissões está em `supabase/manual-resource-schema.sql`. As migrações já foram aplicadas ao projeto; este arquivo documenta a estrutura e não deve ser executado novamente sem revisão.
