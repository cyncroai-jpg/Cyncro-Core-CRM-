import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  hasModuleAccess,
  normalizeEmail,
  requestUser,
} from "@/lib/core/db";

const requestIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") || "recorded";
const newToken = () =>
  `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
async function logEvent(
  contractId: string,
  type: string,
  actor: string,
  details: string,
  request: Request,
) {
  await coreDb()
    .prepare(
      "INSERT INTO crm_contract_events (id,contract_id,event_type,actor,details,ip_address,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      contractId,
      type,
      actor,
      details,
      requestIp(request),
      new Date().toISOString(),
    )
    .run();
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url),
      signingToken = cleanText(url.searchParams.get("token"), 160);
    if (signingToken) {
      const signer = await coreDb()
        .prepare(
          `SELECT s.*,c.title,c.client_name,c.body,c.status AS contract_status,c.expires_at,c.revoked_at,c.locked_at,c.owner_signer_name,c.owner_signed_at
        FROM crm_contract_signers s JOIN crm_contracts c ON c.id=s.contract_id WHERE s.signing_token=?`,
        )
        .bind(signingToken)
        .first<Record<string, unknown>>();
      if (signer) {
        if (signer.revoked_at)
          return Response.json(
            { error: "This signing link was revoked." },
            { status: 410 },
          );
        if (
          signer.expires_at &&
          new Date(String(signer.expires_at)) < new Date()
        )
          return Response.json(
            { error: "This signing link expired." },
            { status: 410 },
          );
        return Response.json({ contract: signer, signer });
      }
      const legacy = await coreDb()
        .prepare(
          "SELECT id,title,client_name,client_email,body,status AS contract_status,signer_name,signed_at,expires_at,revoked_at,locked_at,owner_signer_name,owner_signed_at FROM crm_contracts WHERE signing_token=?",
        )
        .bind(signingToken)
        .first<Record<string, unknown>>();
      return legacy
        ? Response.json({ contract: legacy, legacy: true })
        : Response.json({ error: "Contract not found." }, { status: 404 });
    }
    if (!(await hasModuleAccess(request, "crm")))
      return Response.json({ error: "CRM access required." }, { status: 403 });
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const contract = await coreDb()
        .prepare("SELECT * FROM crm_contracts WHERE id=?")
        .bind(id)
        .first();
      if (!contract)
        return Response.json({ error: "Contract not found." }, { status: 404 });
      const [signers, versions, events, attachments] = await Promise.all([
        coreDb()
          .prepare(
            "SELECT * FROM crm_contract_signers WHERE contract_id=? ORDER BY signing_order",
          )
          .bind(id)
          .all(),
        coreDb()
          .prepare(
            "SELECT id,version_number,title,document_hash,created_by,created_at FROM crm_contract_versions WHERE contract_id=? ORDER BY version_number DESC",
          )
          .bind(id)
          .all(),
        coreDb()
          .prepare(
            "SELECT * FROM crm_contract_events WHERE contract_id=? ORDER BY created_at DESC",
          )
          .bind(id)
          .all(),
        coreDb()
          .prepare(
            "SELECT id,filename,content_type,size_bytes,created_at FROM crm_contract_attachments WHERE contract_id=? ORDER BY created_at DESC",
          )
          .bind(id)
          .all(),
      ]);
      return Response.json({
        contract,
        signers: signers.results,
        versions: versions.results,
        events: events.results,
        attachments: attachments.results,
      });
    }
    return Response.json({
      contracts: (
        await coreDb()
          .prepare(
            `SELECT c.*,o.name AS opportunity_name,i.invoice_number FROM crm_contracts c LEFT JOIN crm_opportunities o ON o.id=c.opportunity_id LEFT JOIN crm_invoices i ON i.id=c.invoice_id ORDER BY c.created_at DESC`,
          )
          .all()
      ).results,
    });
  } catch (error) {
    console.error("contracts.list_failed", error);
    return Response.json(
      { error: "Unable to load contracts." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm")))
      return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>,
      email = normalizeEmail(body.clientEmail),
      name = cleanText(body.clientName, 160),
      title = cleanText(body.title, 180),
      text = cleanText(body.body, 20000);
    if (!email || !name || !title || !text)
      return Response.json(
        { error: "Title, client, email, and contract text are required." },
        { status: 400 },
      );
    const id = crypto.randomUUID(),
      legacyToken = newToken(),
      now = new Date().toISOString(),
      documentHash = await digest(`${title}\n${text}`);
    await coreDb()
      .prepare(
        `INSERT INTO crm_contracts (id,title,client_name,client_email,body,status,signing_token,created_by,created_at,updated_at,opportunity_id,invoice_id,template_key,expires_at,document_hash)
      VALUES (?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        title,
        name,
        email,
        text,
        legacyToken,
        requestUser(request),
        now,
        now,
        cleanText(body.opportunityId, 80) || null,
        cleanText(body.invoiceId, 80) || null,
        cleanText(body.templateKey, 80) || null,
        cleanText(body.expiresAt, 40) || null,
        documentHash,
      )
      .run();
    const supplied = Array.isArray(body.signers)
      ? (body.signers as Record<string, unknown>[])
      : [];
    const signers = [
      { name, email },
      ...supplied
        .map((s) => ({
          name: cleanText(s.name, 160),
          email: normalizeEmail(s.email),
        }))
        .filter((s) => s.name && s.email),
    ];
    await coreDb().batch(
      signers.map((signer, index) =>
        coreDb()
          .prepare(
            "INSERT INTO crm_contract_signers (id,contract_id,signer_name,signer_email,signer_role,signing_order,signing_token,status,created_at,updated_at) VALUES (?,?,?,?, 'CLIENT',?,?,'PENDING',?,?)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            signer.name,
            signer.email,
            index + 1,
            newToken(),
            now,
            now,
          ),
      ),
    );
    await coreDb()
      .prepare(
        "INSERT INTO crm_contract_versions (id,contract_id,version_number,title,body,document_hash,created_by,created_at) VALUES (?,?,1,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        id,
        title,
        text,
        documentHash,
        requestUser(request),
        now,
      )
      .run();
    await logEvent(
      id,
      "CREATED",
      requestUser(request),
      "Contract draft and version 1 created",
      request,
    );
    return Response.json(
      {
        contract: await coreDb()
          .prepare("SELECT * FROM crm_contracts WHERE id=?")
          .bind(id)
          .first(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("contracts.create_failed", error);
    return Response.json(
      { error: "Unable to create contract." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>,
      signingToken = cleanText(body.token, 160);
    if (signingToken) {
      const signerName = cleanText(body.signerName, 160),
        consent =
          cleanText(body.consentText, 500) ||
          "Electronic signature consent accepted";
      if (!signerName)
        return Response.json(
          { error: "Signature name is required." },
          { status: 400 },
        );
      const now = new Date().toISOString();
      const signer = await coreDb()
        .prepare("SELECT * FROM crm_contract_signers WHERE signing_token=?")
        .bind(signingToken)
        .first<Record<string, unknown>>();
      if (signer) {
        if (signer.status === "SIGNED")
          return Response.json(
            { error: "This signer already completed the agreement." },
            { status: 409 },
          );
        const prior = await coreDb()
          .prepare(
            "SELECT COUNT(*) AS total FROM crm_contract_signers WHERE contract_id=? AND signing_order<? AND status<>'SIGNED'",
          )
          .bind(signer.contract_id, signer.signing_order)
          .first<{ total: number }>();
        if (Number(prior?.total || 0))
          return Response.json(
            { error: "A previous signer must complete the agreement first." },
            { status: 409 },
          );
        await coreDb()
          .prepare(
            "UPDATE crm_contract_signers SET signer_name=?,signer_ip=?,consent_text=?,signed_at=?,status='SIGNED',updated_at=? WHERE id=?",
          )
          .bind(signerName, requestIp(request), consent, now, now, signer.id)
          .run();
        const remaining = await coreDb()
          .prepare(
            "SELECT COUNT(*) AS total FROM crm_contract_signers WHERE contract_id=? AND status<>'SIGNED'",
          )
          .bind(signer.contract_id)
          .first<{ total: number }>();
        if (!Number(remaining?.total || 0))
          await coreDb()
            .prepare(
              "UPDATE crm_contracts SET signer_name=?,signer_ip=?,signed_at=?,status='CLIENT_SIGNED',updated_at=? WHERE id=?",
            )
            .bind(signerName, requestIp(request), now, now, signer.contract_id)
            .run();
        await logEvent(
          String(signer.contract_id),
          "SIGNED",
          signerName,
          `Signer ${signer.signing_order} completed`,
          request,
        );
        return Response.json({ signed: true, signedAt: now });
      }
      const legacy = await coreDb()
        .prepare("SELECT id,status FROM crm_contracts WHERE signing_token=?")
        .bind(signingToken)
        .first<{ id: string; status: string }>();
      if (!legacy)
        return Response.json({ error: "Contract not found." }, { status: 404 });
      if (legacy.status === "SIGNED")
        return Response.json(
          { error: "Agreement already signed." },
          { status: 409 },
        );
      await coreDb()
        .prepare(
          "UPDATE crm_contracts SET signer_name=?,signer_ip=?,signed_at=?,status='CLIENT_SIGNED',updated_at=? WHERE id=?",
        )
        .bind(signerName, requestIp(request), now, now, legacy.id)
        .run();
      await logEvent(
        legacy.id,
        "SIGNED",
        signerName,
        "Legacy signer completed",
        request,
      );
      return Response.json({ signed: true, signedAt: now });
    }
    if (!(await hasModuleAccess(request, "crm")))
      return Response.json({ error: "CRM access required." }, { status: 403 });
    const id = cleanText(body.id, 80),
      action = cleanText(body.action, 40).toUpperCase(),
      now = new Date().toISOString(),
      contract = await coreDb()
        .prepare("SELECT * FROM crm_contracts WHERE id=?")
        .bind(id)
        .first<Record<string, unknown>>();
    if (!contract)
      return Response.json({ error: "Contract not found." }, { status: 404 });
    if (action === "REVOKE") {
      await coreDb()
        .prepare(
          "UPDATE crm_contracts SET status='REVOKED',revoked_at=?,updated_at=? WHERE id=? AND locked_at IS NULL",
        )
        .bind(now, now, id)
        .run();
      await logEvent(
        id,
        "REVOKED",
        requestUser(request),
        "Signing access revoked",
        request,
      );
      return Response.json({ saved: true });
    }
    if (action === "REMIND") {
      await coreDb()
        .prepare(
          "UPDATE crm_contracts SET reminder_count=reminder_count+1,last_reminded_at=?,updated_at=? WHERE id=?",
        )
        .bind(now, now, id)
        .run();
      await logEvent(
        id,
        "REMINDER_QUEUED",
        requestUser(request),
        "Signature reminder queued",
        request,
      );
      return Response.json({
        saved: true,
        delivery: process.env.RESEND_API_KEY ? "READY" : "CONNECTION_REQUIRED",
      });
    }
    if (action === "COUNTERSIGN") {
      const signerName = cleanText(body.signerName, 160);
      if (!signerName)
        return Response.json(
          { error: "Owner signature name is required." },
          { status: 400 },
        );
      if (!contract.signed_at)
        return Response.json(
          { error: "Client signatures must be completed first." },
          { status: 409 },
        );
      const documentHash = await digest(
        `${contract.title}\n${contract.body}\n${contract.signed_at}\n${now}`,
      );
      await coreDb()
        .prepare(
          "UPDATE crm_contracts SET owner_signer_name=?,owner_signed_at=?,owner_signer_ip=?,status='SIGNED',locked_at=?,document_hash=?,updated_at=? WHERE id=? AND revoked_at IS NULL",
        )
        .bind(signerName, now, requestIp(request), now, documentHash, now, id)
        .run();
      await logEvent(
        id,
        "COUNTERSIGNED",
        signerName,
        "Agreement completed and locked",
        request,
      );
      return Response.json({ saved: true });
    }
    if (action === "SEND") {
      await coreDb()
        .prepare(
          "UPDATE crm_contracts SET status='SENT',updated_at=? WHERE id=? AND revoked_at IS NULL",
        )
        .bind(now, id)
        .run();
      await logEvent(
        id,
        "SENT",
        requestUser(request),
        "Secure signing links prepared",
        request,
      );
      return Response.json({
        saved: true,
        delivery: process.env.RESEND_API_KEY ? "READY" : "CONNECTION_REQUIRED",
      });
    }
    if (contract.locked_at)
      return Response.json(
        {
          error:
            "Signed contracts are locked. Duplicate it to create a revision.",
        },
        { status: 409 },
      );
    const title =
        body.title !== undefined
          ? cleanText(body.title, 180)
          : String(contract.title),
      text =
        body.body !== undefined
          ? cleanText(body.body, 20000)
          : String(contract.body),
      documentHash = await digest(`${title}\n${text}`),
      version =
        Number(
          (
            await coreDb()
              .prepare(
                "SELECT MAX(version_number) AS value FROM crm_contract_versions WHERE contract_id=?",
              )
              .bind(id)
              .first<{ value: number }>()
          )?.value || 0,
        ) + 1;
    await coreDb()
      .prepare(
        "UPDATE crm_contracts SET title=?,body=?,expires_at=?,opportunity_id=?,invoice_id=?,document_hash=?,updated_at=? WHERE id=?",
      )
      .bind(
        title,
        text,
        body.expiresAt !== undefined
          ? cleanText(body.expiresAt, 40) || null
          : contract.expires_at,
        body.opportunityId !== undefined
          ? cleanText(body.opportunityId, 80) || null
          : contract.opportunity_id,
        body.invoiceId !== undefined
          ? cleanText(body.invoiceId, 80) || null
          : contract.invoice_id,
        documentHash,
        now,
        id,
      )
      .run();
    await coreDb()
      .prepare(
        "INSERT INTO crm_contract_versions (id,contract_id,version_number,title,body,document_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        id,
        version,
        title,
        text,
        documentHash,
        requestUser(request),
        now,
      )
      .run();
    await logEvent(
      id,
      "VERSION_CREATED",
      requestUser(request),
      `Version ${version} saved`,
      request,
    );
    return Response.json({ saved: true, version });
  } catch (error) {
    console.error("contracts.update_failed", error);
    return Response.json(
      { error: "Unable to update contract." },
      { status: 500 },
    );
  }
}
