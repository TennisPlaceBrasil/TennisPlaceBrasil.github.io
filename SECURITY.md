# Portal de Manuais — acesso

A página pública contém apenas a interface de login e a chave publicável do Supabase. As senhas são verificadas pelo Supabase Auth. Os portais completos ficam no banco de dados, com RLS e permissões por usuário e perfil.

- `manual_portal_members`: permissões por usuário, mantidas somente por administração confiável.
- `manual_portal_chunks`: conteúdo dos três portais. Cada consulta exige sessão válida e perfil autorizado.
- Administrativo pode acessar os três portais; Loja e Franqueado acessam apenas seus respectivos portais.
- As URLs antigas encaminham ao login. Nenhum HTML de manual deve ser adicionado novamente aos arquivos públicos.
- A interface encerra a sessão ao sair e remove o conteúdo carregado. A autorização também é verificada no banco, inclusive após revogação.

## Histórico anterior

O histórico Git anterior à migração contém versões antigas dos HTMLs, manuais e credenciais compartilhadas. Substituir os arquivos na branch atual não remove esse histórico. Para encerrar a exposição dessas cópias, é necessário restringir o repositório e avaliar a hospedagem compatível, ou executar uma limpeza de histórico coordenada. Cópias já obtidas por terceiros não podem ser revogadas.

Os acessos são validados no Supabase, com autorização específica por perfil. O uso do CNPJ como senha das lojas foi restaurado por solicitação explícita do responsável e continua previsível por ser informação pública.

## Login das lojas

Por solicitação do responsável, as contas das lojas utilizam SIGLA e CNPJ sem pontuação como senha. O CNPJ é informação pública: esse padrão é previsível e não deve ser confundido com uma senha confidencial. A validação ocorre no Supabase Auth; a lista de senhas não é publicada no frontend.

Cada loja tem identidade técnica própria no Supabase, com o e-mail do responsável registrado no vínculo privado. Isso mantém as permissões independentes das contas administrativas. O perfil administrativo continua com e-mail e senha pessoal.

A seleção após o login respeita somente as permissões cadastradas no servidor. As contas habilitadas para Franqueado também mantêm o acesso anterior ao portal da Loja. As tabelas de identificação e permissões não podem ser alteradas pelo cliente.
