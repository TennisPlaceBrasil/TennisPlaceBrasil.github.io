# Contagem de Estoque — Tennis Place

Status: implementation and preview tests complete; Google Apps Script owner authorization/deployment is pending. The feature branch has not been deployed to the public Hub.

## Data flow

- The existing Supabase login accepts store abbreviation/CNPJ or existing administrative credentials.
- stockcount-api validates active manual membership and the store mapping. Alberto and Paulo are the stock analysts.
- Google Apps Script reads Sheet0 in the product spreadsheet and writes snapshots to the designated count spreadsheet.
- Each count creates a LOJA-dd-MM-yyyy worksheet with Contagem, Defeitos and Importação tables. Importação lists defects first.
- A private _Contagens tab stores session metadata, revision and the last request ID.
- Public website code contains no CNPJ list, service-role credential, Google credential or bridge secret.
- Count data is stored in Google Sheets. Local pending drafts protect temporary connection failures.

## Google setup remaining

1. In the owner's Google Apps Script account, create a project with Code.gs and appsscript.json.
2. Set Script Properties PRODUCT_FILE_ID and COUNT_FILE_ID to the private source and destination spreadsheet IDs. Set BRIDGE_SECRET to the existing private Supabase bridge secret. Never commit these values.
3. Authorize spreadsheet access and run setup().
4. Deploy a Web App executing as the owner, accepting requests from anyone. The endpoint rejects requests without the bridge secret. Store users reach it through the authenticated Edge Function.
5. Store the returned /exec URL in public.stockcount_bridge_config.endpoint through the trusted administrator connection.
6. Verify the live product read, store-scoped count write/read, unknown-EAN decisions and administrative analysis. Then deploy the feature branch to the public Hub.

The target spreadsheet already has the initial INÍCIO and _Contagens structure. Neither has real count data yet.

## Verification

Run: node backend/contagem-estoque/verify.mjs

Tests cover unknown-EAN confirmation, quantity consolidation, zero for absent products, store isolation, revision conflicts, inactive users and server-side analyst restrictions. A browser preview also verified the unknown-product dialog and analysis matrix with explicit test data.

Only finalized counts appear in the analysis. If a store has several finalized counts on one date, the latest is used for that date. Stock quantity is ordinary count plus defects.
