import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const appOrigin = "https://tennisplacebrasil.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin) return response({ error: "Origem não permitida." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return response({ error: "Configuração administrativa indisponível." }, 503);

    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response({ error: "Sessão inválida. Entre novamente." }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const actor = authData?.user;
    if (authError || !actor) return response({ error: "Sessão inválida. Entre novamente." }, 401);

    const { data: actorMembership, error: actorError } = await admin
      .from("manual_portal_members")
      .select("active,is_master")
      .eq("user_id", actor.id)
      .maybeSingle();
    if (actorError) throw new Error("Não foi possível validar a permissão MASTER.");
    if (!actorMembership?.active || !actorMembership.is_master) {
      return response({ error: "Somente um usuário MASTER ativo pode administrar os acessos." }, 403);
    }

    const body = await request.json();
    if (body?.action === "list") {
      const [membersResult, storesResult, homeResult, extraResult, auditResult] = await Promise.all([
        admin.from("manual_portal_members")
          .select("user_id,profiles,active,is_master,created_at")
          .order("created_at", { ascending: true }),
        admin.from("manual_portal_store_logins").select("sigla").order("sigla"),
        admin.from("manual_portal_store_logins").select("user_id,sigla"),
        admin.from("stockcount_user_store_access").select("user_id,sigla"),
        admin.from("manual_portal_access_audit")
          .select("id,actor_user_id,target_user_id,previous_master,new_master,previous_stores,new_stores,created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      for (const result of [membersResult, storesResult, homeResult, extraResult, auditResult]) {
        if (result.error) throw new Error("Não foi possível carregar as configurações de acesso.");
      }

      const authUsers = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
        if (error) throw new Error("Não foi possível carregar os e-mails das contas.");
        const pageUsers = data.users || [];
        authUsers.push(...pageUsers);
        if (pageUsers.length < 500) break;
      }
      const authUserById = new Map(authUsers.map((item) => [item.id, item]));
      const emailById = new Map(authUsers.map((item) => [item.id, item.email || ""]));
      const storeList = (storesResult.data || []).map((row) => row.sigla);
      const homeByUser = new Map();
      const extraByUser = new Map();
      for (const row of homeResult.data || []) homeByUser.set(row.user_id, [...(homeByUser.get(row.user_id) || []), row.sigla]);
      for (const row of extraResult.data || []) extraByUser.set(row.user_id, [...(extraByUser.get(row.user_id) || []), row.sigla]);

      const users = (membersResult.data || []).map((member) => {
        const base = homeByUser.get(member.user_id) || [];
        const extras = extraByUser.get(member.user_id) || [];
        const master = !!member.is_master;
        const administrator = (member.profiles || []).includes("adm");
        const effectiveStores = master || administrator
          ? storeList
          : [...new Set([...base, ...extras])].sort();
        return {
          id: member.user_id,
          email: emailById.get(member.user_id) || "",
          name: authUserById.get(member.user_id)?.user_metadata?.full_name || "",
          active: !!member.active,
          master,
          administrator,
          homeStores: base,
          stores: effectiveStores,
        };
      }).sort((a, b) => a.email.localeCompare(b.email, "pt-BR"));

      const audit = (auditResult.data || []).map((row) => ({
        ...row,
        actor_email: emailById.get(row.actor_user_id) || "",
        target_email: emailById.get(row.target_user_id) || "",
      }));
      return response({ ok: true, stores: storeList, users, audit });
    }

    if (body?.action === "create") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
        return response({ error: "Informe nome e e-mail válidos." }, 400);
      }
      if (password.length < 8 || password.length > 128 || new TextEncoder().encode(password).length > 72) {
        return response({ error: "A senha inicial precisa ter ao menos 8 caracteres e no máximo 72 bytes." }, 400);
      }
      if (!Array.isArray(body.stores) || body.stores.length < 1 || body.stores.length > 100 ||
          body.stores.some((store) => typeof store !== "string")) {
        return response({ error: "Selecione ao menos uma loja." }, 400);
      }
      const stores = [...new Set(body.stores.map((store) => store.trim().toUpperCase()))];
      const { data: storeRows, error: storeError } = await admin
        .from("manual_portal_store_logins")
        .select("sigla");
      if (storeError) throw new Error("Não foi possível validar as lojas.");
      const availableStores = new Set((storeRows || []).map((row) => row.sigla));
      if (stores.some((store) => !availableStores.has(store))) {
        return response({ error: "A lista contém uma loja inexistente." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (createError || !created?.user?.id) {
        const duplicate = /already|registered|duplicate|exists/i.test(createError?.message || "");
        return response({ error: duplicate ? "Este e-mail já possui uma conta." : "Não foi possível criar o usuário." }, duplicate ? 409 : 400);
      }

      const targetId = created.user.id;
      try {
        const { error: memberError } = await admin.from("manual_portal_members").insert({
          user_id: targetId,
          profiles: ["loja"],
          active: true,
          is_master: false,
        });
        if (memberError) throw memberError;
        const { error: accessError } = await admin.from("stockcount_user_store_access")
          .insert(stores.map((sigla) => ({ user_id: targetId, sigla })));
        if (accessError) throw accessError;
        const { error: auditError } = await admin.from("manual_portal_access_audit").insert({
          actor_user_id: actor.id,
          target_user_id: targetId,
          previous_master: false,
          new_master: false,
          previous_stores: [],
          new_stores: stores,
        });
        if (auditError) throw auditError;
      } catch (provisionError) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(targetId);
        if (rollbackError) console.error("Falha ao limpar conta incompleta após erro de cadastro.");
        throw provisionError;
      }
      return response({ ok: true, user: { id: targetId, email, name, stores } }, 201);
    }

    if (body?.action === "save") {
      const targetId = typeof body.userId === "string" ? body.userId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
        return response({ error: "Usuário inválido." }, 400);
      }
      if (typeof body.master !== "boolean" || !Array.isArray(body.stores) || body.stores.length > 100 ||
          body.stores.some((store) => typeof store !== "string")) {
        return response({ error: "Informe o perfil e as lojas liberadas." }, 400);
      }
      const stores = [...new Set(body.stores.map((store) => store.trim().toUpperCase()))];
      const { data, error } = await admin.rpc("manual_portal_apply_user_access", {
        p_actor: actor.id,
        p_target: targetId,
        p_master: body.master,
        p_stores: stores,
      });
      if (error) {
        const message = /MASTER|loja|Usuário/.test(error.message) ? error.message : "Não foi possível salvar o acesso.";
        return response({ error: message }, 400);
      }
      return response({ ok: true, result: data });
    }

    return response({ error: "Ação inválida." }, 400);
  } catch {
    return response({ error: "Não foi possível concluir a solicitação de acesso." }, 500);
  }
});