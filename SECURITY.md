# Portal de Manuais — acesso

A página pública contém apenas a interface de login e a chave publicável do Supabase. As senhas são verificadas pelo Supabase Auth. Os portais completos ficam no banco de dados, com RLS e permissões por usuário e perfil.

- `manual_portal_members`: permissões por usuário, mantidas somente por administração confiável.
- `manual_portal_chunks`: conteúdo dos três portais. Cada consulta exige sessão válida e perfil autorizado.
- Administrativo pode acessar os três portais; Loja e Franqueado acessam apenas seus respectivos portais.
- As URLs antigas encaminham ao login. Nenhum HTML de manual deve ser adicionado novamente aos arquivos públicos.
- A interface encerra a sessão ao sair e remove o conteúdo carregado. A autorização também é verificada no banco, inclusive após revogação.

## Histórico anterior

O histórico Git anterior à migração contém versões antigas dos HTMLs, manuais e credenciais compartilhadas. Substituir os arquivos na branch atual não remove esse histórico. Para encerrar a exposição dessas cópias, é necessário restringir o repositório e avaliar a hospedagem compatível, ou executar uma limpeza de histórico coordenada. Cópias já obtidas por terceiros não podem ser revogadas.

Não use novamente as credenciais compartilhadas presentes na versão antiga. Os novos acessos são contas individuais no Supabase, com autorização específica para o Portal de Manuais.

## Login por CNPJ

O campo aceita e-mail ou CNPJ com 14 dígitos. O CNPJ é apenas um identificador; a senha continua obrigatória e é verificada pelo Supabase Auth. A função `manual-portal-login` resolve o vínculo em `manual_portal_login_aliases`, sem expor a relação entre CNPJs e contas na interface pública. As tentativas por CNPJ são limitadas no servidor. Não existe cadastro automático de CNPJ nem reaproveitamento de credenciais compartilhadas antigas.

Após autenticar, a seleção de portais deriva da permissão da conta, independentemente da aba escolhida antes de entrar. Novos vínculos e permissões devem ser aprovados pelo escritório e cadastrados por administração confiável.
