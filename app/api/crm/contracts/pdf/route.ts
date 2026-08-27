import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  hasModuleAccess,
} from "@/lib/core/db";
const escapePdf = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
export async function GET(request: Request) {
  await ensureCoreSchema();
  if (!(await hasModuleAccess(request, "crm")))
    return Response.json({ error: "CRM access required." }, { status: 403 });
  const id = cleanText(new URL(request.url).searchParams.get("id"), 80),
    contract = await coreDb()
      .prepare("SELECT * FROM crm_contracts WHERE id=?")
      .bind(id)
      .first<Record<string, unknown>>();
  if (!contract)
    return Response.json({ error: "Contract not found." }, { status: 404 });
  const source = [
    String(contract.title),
    `Prepared for: ${contract.client_name}`,
    "",
    ...String(contract.body).split(/\n/),
    "",
    `Client signature: ${contract.signer_name || "Pending"}`,
    `Client signed: ${contract.signed_at || "Pending"}`,
    `Owner signature: ${contract.owner_signer_name || "Pending"}`,
    `Owner signed: ${contract.owner_signed_at || "Pending"}`,
    `Integrity SHA-256: ${contract.document_hash || "Pending"}`,
  ];
  const lines = source.flatMap((line) => {
    const value = String(line),
      parts: string[] = [];
    for (let index = 0; index < value.length; index += 88)
      parts.push(value.slice(index, index + 88));
    return parts.length ? parts : [""];
  });
  const content = lines
    .slice(0, 48)
    .map(
      (line, index) =>
        `BT /F1 10 Tf 50 ${760 - index * 14} Td (${escapePdf(line)}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join(
      "",
    )}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="cyncro-contract-${id}.pdf"`,
    },
  });
}
