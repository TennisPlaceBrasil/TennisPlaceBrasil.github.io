# Contagem de Estoque — Tennis Place

Status: authenticated inventory API, collaborative live storage, retryable Google Sheets projection, offline device drafts and read-only monitoring. Historical single-device counts and recounts remain supported.

## Data flow

- The existing Supabase login accepts store abbreviation/CNPJ or existing administrative credentials.
- stockcount-api validates active manual membership and the store mapping. Alberto and Paulo are the stock analysts.
- Additional multi-store access is granted explicitly in `stockcount_user_store_access`; an empty history filter shows all stores granted to that account. Users without any store grant remain blocked.
- Google Apps Script reads Sheet0 in the product spreadsheet and writes snapshots to the designated count spreadsheet.
- Each count creates a LOJA-dd-MM-yyyy worksheet with Contagem, Defeitos and Importação tables. Importação lists defects first.
- A private _Contagens tab stores session metadata, revision and the last request ID.
- Public website code contains no CNPJ list, service-role credential, Google credential or bridge secret.
- Count data is stored in Google Sheets. Local pending drafts protect temporary connection failures.

## Camera and TXT imports

The camera reader is opened only on request. Chrome uses the native Barcode Detection API where it supports EAN formats; otherwise a locally hosted, MIT-licensed ZXing bundle is loaded only while needed. Video processing remains on the device and camera tracks stop when the dialog closes. HTTPS and camera permission are required.

All users can import a TXT into Contagem or Defeitos. Each line uses EAN,QNTDD; duplicates in a file are summed, and imported quantities are added to existing rows. Unknown EANs are listed and require explicit confirmation. Imports are validated and written in a single request. In a recount, the server rejects EANs that were not requested for that recount.

An empty count is removed when it is finalized or replaced with a new count. Leaving the page triggers a best-effort cleanup request; if the browser is offline, an empty unfinished count is removed the next time that store starts a count after 12 hours. Spreadsheet tabs shrink to only the rows and columns actually used.

## Read-only monitoring links

Each new count receives a unique, read-only monitoring link shared by all participants. Administrators can regenerate a link for a saved count; regenerating revokes its previous link. Links expire after 30 days and are invalidated when the count is deleted. The lightweight dashboard polls every 10 seconds and shows one stacked card per responsible, with that person’s products, quantities, defects, device and latest synchronization. The token is stored as a SHA-256 hash in Supabase; a dedicated public Edge Function can only read a count when presented with a valid share token.

The dashboard reads the current row-level scan times from Google Sheets. Deploy the updated Apps Script source after changes to `Code.gs` so the sheet stores the per-product scan timestamp and session IP/device metadata.

## Recount workflow

Administrators select a finalized original count, choose Solicitar recontagem and upload a TXT. The first column of each nonempty line is read as an EAN; leading zeros are preserved and duplicate codes are removed. The store sees only its pending requests. The separate recount sheet has no original quantities.

Yellow means the EAN was included, not that its quantity is correct. Every requested EAN must be scanned or explicitly marked Não localizado (0). Finishing updates only those EANs in the original snapshot; other products keep their quantities. The separate recount worksheet remains as an audit record and is excluded from the stock pivot. Deleting the original count also removes its related recounts.

The EAN list is paginated at 80 entries. Catalog lookups and stock analysis do not wait for the write lock; mutations remain serialized and protected by revision checks. Inbox loading is asynchronous and does not block entry into the tool. Analysis defaults to 90 days, requests 40 counts per page, and requires a date range of at most 12 months.


## Scale notes

The Google Sheets workbook remains the storage ceiling. Count writes are serialized through one Apps Script lock because all stores share the same workbook. Autosave is debounced, TXT import writes in batches, analysis is paged, and unused sheet cells are removed, but this is not unlimited horizontal scaling. Apps Script applies per-owner execution-time and concurrent-execution limits; the current web app runs as the spreadsheet owner. Google Sheets also limits a workbook by total cells. If simultaneous store usage or historical records grow substantially, plan to move the live record store to a transactional database and mirror/export to Drive before the workbook limit becomes an operational risk.

## Verification

Run: node backend/contagem-estoque/verify.mjs, node backend/contagem-estoque/verify-recount.mjs, and node backend/contagem-estoque/verify-help.mjs

Tests cover unknown-EAN confirmation, quantity consolidation, zero for absent products, store isolation, revision conflicts, inactive users and server-side analyst restrictions. A browser preview also verified the unknown-product dialog and analysis matrix with explicit test data.

Only finalized counts appear in the analysis. If a store has several finalized counts on one date, the latest is used for that date. Stock quantity is ordinary count plus defects.

## Count names and manual deletion

Count names end with a daily sequence for the store: LOJA-dd-MM-yyyy #1, #2, etc. Recount names reference the original numbered count and end with RECONTAGEM #1, #2. updateInventoryNamesAndCleanup migrates existing labels and sheet names while preserving IDs and quantities.

metadata_ ignores tabs deleted manually in Google Sheets, including recounts whose source no longer exists. reconcileDeletedCounts cleans their stale metadata and dependent recount tabs. The website refreshes its visible state when the tab/window regains focus; store accounts can only check the existence of their known current count, without reading history.


## Contagem sem conexão (Chrome)

Depois do login e de criar/abrir a contagem com internet, aguarde **Pronto para contar sem internet**. O cadastro completo, a página, os recursos de câmera e os exportadores ficam preparados no dispositivo. Use **Preparar / atualizar uso offline** para tentar novamente ou atualizar o cadastro.

Cada bipagem é persistida no IndexedDB, separada por usuário e contagem; apenas a linha alterada é gravada durante a bipagem. A contagem pode ser recuperada no botão **Retomar contagem deste dispositivo** após recarregar ou reabrir a página. Sair explicitamente bloqueia essa retomada até o próximo login. Não há senha nem token no IndexedDB. Cadastro e recursos offline são preparados uma vez por sessão de acesso; nenhuma resposta autenticada é armazenada pelo service worker.

Excel com três abas e TXT de Contagem/Defeitos, além do CSV de importação, são gerados localmente. EAN permanece texto, com zeros iniciais, e a importação lista os defeitos primeiro. Finalizar sem conexão fecha os lançamentos no dispositivo e deixa o envio pendente. A contagem vazia é removida quando o servidor confirma a exclusão, incluindo recuperação de uma resposta perdida.

A sincronização transmite snapshots versionados em lotes com identificador estável, persistido antes da requisição. O mesmo pacote é repetido em caso de resposta perdida; bipagens posteriores são enviadas depois da confirmação do pacote anterior. Conflitos ou exclusão no Drive preservam uma cópia local para exportação, sem sobrescrever o servidor nem recriar a contagem apagada. Uma falha de armazenamento é exibida e uma gravação completa repara a cópia local na próxima tentativa bem-sucedida.

Validado em Chrome com 5.000 EANs distintos, defeitos, horas de bipagem, fechamento/reabertura, resposta perdida, conflito de versão e exclusão de contagem vazia. A tabela renderiza 100 produtos por página, mantendo a ordem original. Arquivos/exportações sempre incluem todos os itens. O primeiro acesso e a criação de contagem exigem internet. Sincronizar após perder a sessão exige novo login. Limpar os dados do navegador, modo anônimo e perda do dispositivo podem remover a cópia local; preserve os arquivos exportados.

Teste de exportação/cache: `node backend/contagem-estoque/verify-offline.mjs`. O arquivo XLSX de teste contém 5.000 produtos e pode ser aberto para conferência.


## Confirmed camera entry and product identification

Camera recognition only prepares a green product card. LANÇAR commits one unit and keeps the camera open; an explicit rescan button discards the preview. Only the three most recent confirmed camera entries are displayed. Unknown camera EANs do not open a card or commit anything. Recognition uses one existing stream, including the ZXing fallback; closing the dialog invalidates outstanding lookups and stops all tracks.

Positive/negative tones use a shared Web Audio context without downloaded audio assets. Unknown typed/scanned EANs require description and brand before confirmation. TXT imports require those fields per missing EAN. Apps Script preserves this metadata while keeping canonical catalog descriptions for known EANs. User descriptions beginning with equals are written as literal sheet text.

The store can return to the inventory start screen without leaving its session or losing local work. This screen lists only unfinished device drafts and pending uploads, never the administrative cloud history. Opening a recount uses its explicit authorized endpoint and preserves the outgoing device draft, even if that draft has pending uploads or conflicts.



## Contagem simultânea por responsável

Novas contagens criadas pela interface usam `stockcount_team_counts` e `stockcount_team_people` como registro transacional. A mesma contagem pode receber vários aparelhos. RESPONSAVEL fica junto à data, exige ao menos quatro letras (espaços e acentos permitidos; números e outros caracteres rejeitados) e identifica a contribuição de cada participante. O nome não é uma nova credencial; a autorização continua sendo o login da loja. IDs aleatórios de participação são privados, persistidos no dispositivo antes da entrada e não aparecem na lista dos demais participantes.

Um aparelho cria a contagem; os demais informam seu próprio responsável e usam **CONTINUAR** na lista de contagens em andamento da própria loja, visível mesmo durante outra sessão e atualizada a cada 10 segundos. MINHA PARTE permite corrigir somente a contribuição local. TOTAL DA CONTAGEM é uma consulta da soma de todos. Dividir fisicamente as áreas continua necessário: a deduplicação impede reenvios de uma mesma operação, mas não identifica a mesma peça contada por duas pessoas.

Cada sincronização transmite um snapshot exclusivamente daquela participação, com revisão própria e identificador durável. Sob um bloqueio transacional da contagem, o servidor confere a revisão da participação e o SHA-256 do pacote, substitui somente sua contribuição e calcula a soma. Repetir o mesmo pacote não soma de novo. Um pacote antigo não sobrescreve uma revisão mais recente. Web Locks impede duas abas no mesmo navegador de alterarem o mesmo rascunho; a aba sem bloqueio não escreve nem no servidor nem no IndexedDB. A falta dessa API bloqueia a edição colaborativa, mantendo a exportação acessível.

Finalizar marca apenas a própria participação como concluída. A contagem só passa para FINALIZADA depois que todos os participantes registrados terminam e sincronizam. Não existe encerramento forçado de um aparelho offline. Pedidos de exclusão aguardam os demais responsáveis terminarem; a aprovação exige a revisão que o ADM acabou de consultar. A exclusão gera um tombstone central que revoga imediatamente a participação e o acesso por link, sem permitir recriação por um pacote antigo.

O Google Sheets recebe uma projeção consolidada assíncrona, protegida por lease e pela revisão do Apps Script. Falhas no Drive não desfazem um recebimento transacional confirmado. A interface diferencia recebimento no servidor de espelhamento na planilha. Consultar/sincronizar novamente tenta atualizar projeções pendentes; não há um agendador independente nesta versão. O dashboard por link lê a soma central e mantém os responsáveis, IPs e dispositivos no topo. O histórico administrativo e a análise incluem os dados consolidados enquanto o espelhamento está pendente. As recontagens existentes continuam individuais; sua aplicação atualiza o total final e preserva as contribuições originais como auditoria.

Exportações consolidadas usam a última soma recebida dos demais, mais a própria contribuição local atual. Sem conexão, não podem incluir lançamentos ainda retidos em outros aparelhos. **BAIXAR MEU EXCEL** oferece uma cópia individual, com nome, produtos, marca, horários e origem. O Excel consolidado inclui uma aba de responsáveis e seus últimos envios. EANs continuam texto; defeitos vêm primeiro na importação.

Contagens antigas não são convertidas automaticamente para evitar somar snapshots preexistentes como se fossem contribuições diferentes. Para trabalho em equipe, crie uma nova contagem e entre nela nos outros aparelhos.

Validação:
- `node backend/contagem-estoque/verify-team-ui.mjs`
- `node backend/contagem-estoque/verify-share-ui.mjs`
- `node --experimental-strip-types backend/contagem-estoque/verify-team-api.mjs`
- Execute `verify-team.sql` em uma transação que termina com ROLLBACK; ajuste as siglas de fixture se necessário.
- Teste real de concorrência passou com dois envios paralelos de 5.000 EANs cada: 15.000 unidades somadas, duas revisões, sem perda. As fixtures temporárias foram removidas.

Novas tabelas e RPCs são exclusivas de service_role, com RLS e revogação de acesso de anon/authenticated. A API autenticada continua exigindo JWT. O endpoint compartilhado mantém apenas leitura por token válido.


## Subgrupos e dashboard administrativo

O catálogo inclui `[EAN, produto, marca, subgrupo]`; o quarto valor vem de `DESCRGRUPOPROD` (coluna K de Sheet0). As classificações não são inferidas da descrição. O layout mobile mostra o subgrupo sob o produto; desktop, acompanhamento e XLSX incluem uma coluna própria. CSV/TXT de importação continuam com EAN e quantidade.

Antes de publicar o cliente desta versão: atualizar a implantação existente do Apps Script com `Code.gs`, mantendo propriedades e URL, executar `migrateSubgroups()` e verificar a coluna E (Contagem) e L (Defeitos). A migração insere colunas sem trocar IDs/revisões nem alterar quantidades. A leitura aceita o layout antigo; recontagens e importação são reposicionadas sem perder dados. Atualizar `stockcount-share-read` com `share-read.ts` e `team.ts` depois do bridge.

O dashboard exige a permissão administrativa já existente. Posição = última contagem finalizada de cada loja no período, sem acumular snapshots de dias diferentes. A série diária usa a última contagem de cada loja/dia e avisa que as lojas participantes podem variar. Defeitos são divididos por (contagem + defeitos). Acompanhamento operacional usa loja/período; marca/subgrupo filtram os produtos. Sem base de estoque esperado não se calculam acuracidade ou divergências.

Verificações: `node backend/contagem-estoque/verify-dashboard.mjs`, `verify-recount.mjs`, `verify-team-ui.mjs`, `verify-offline.mjs`, `verify-pwa.mjs` e `verify-share-ui.mjs` (os demais nomes na mesma pasta).
