# Contagem de Estoque — Tennis Place

Status: Google Apps Script version 5 and authenticated Edge API deployed. Recount workflow and contextual Tepê help implemented and verified.

## Data flow

- The existing Supabase login accepts store abbreviation/CNPJ or existing administrative credentials.
- stockcount-api validates active manual membership and the store mapping. Alberto and Paulo are the stock analysts.
- Google Apps Script reads Sheet0 in the product spreadsheet and writes snapshots to the designated count spreadsheet.
- Each count creates a LOJA-dd-MM-yyyy worksheet with Contagem, Defeitos and Importação tables. Importação lists defects first.
- A private _Contagens tab stores session metadata, revision and the last request ID.
- Public website code contains no CNPJ list, service-role credential, Google credential or bridge secret.
- Count data is stored in Google Sheets. Local pending drafts protect temporary connection failures.

## Recount workflow

Administrators select a finalized original count, choose Solicitar recontagem and upload a TXT. The first column of each nonempty line is read as an EAN; leading zeros are preserved and duplicate codes are removed. The store sees only its pending requests. The separate recount sheet has no original quantities.

Yellow means the EAN was included, not that its quantity is correct. Every requested EAN must be scanned or explicitly marked Não localizado (0). Finishing updates only those EANs in the original snapshot; other products keep their quantities. The separate recount worksheet remains as an audit record and is excluded from the stock pivot. Deleting the original count also removes its related recounts.

The EAN list is paginated at 80 entries. Catalog lookups do not wait for the write lock; mutations remain serialized and protected by revision checks. Inbox loading is asynchronous and does not block entry into the tool.

## Contextual help

The shared Tepê helper provides short fixed instructions, without a chat. A single mascot is used when apps are opened inside the Hub; standalone tool entrypoints load the same helper. The supplied Three.js character is loaded after idle and only animates while the help panel is open. WebGL failures fall back to the bundled vector character.

## Verification

Run: node backend/contagem-estoque/verify.mjs and node backend/contagem-estoque/verify-recount.mjs

Tests cover unknown-EAN confirmation, quantity consolidation, zero for absent products, store isolation, revision conflicts, inactive users and server-side analyst restrictions. A browser preview also verified the unknown-product dialog and analysis matrix with explicit test data.

Only finalized counts appear in the analysis. If a store has several finalized counts on one date, the latest is used for that date. Stock quantity is ordinary count plus defects.

## Count names and manual deletion

Count names end with a daily sequence for the store: LOJA-dd-MM-yyyy #1, #2, etc. Recount names reference the original numbered count and end with RECONTAGEM #1, #2. updateInventoryNamesAndCleanup migrates existing labels and sheet names while preserving IDs and quantities.

metadata_ ignores tabs deleted manually in Google Sheets, including recounts whose source no longer exists. reconcileDeletedCounts cleans their stale metadata and dependent recount tabs. The website refreshes its visible state when the tab/window regains focus; store accounts can only check the existence of their known current count, without reading history.
