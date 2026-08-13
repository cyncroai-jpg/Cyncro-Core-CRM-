import { DispatchError } from "./errors";

type JobInput = {
  serviceType: string;
  serviceDate: string;
  address: string;
  customerId?: string;
  customerNotes?: string;
  leadSource?: string;
  revenue?: number;
  assignedTechId?: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9]\d{7,14}$/;

function text(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") throw invalid(field, "must be text");
  const clean = value.trim();
  if (clean.length < min || clean.length > max)
    throw invalid(field, `must contain ${min}-${max} characters`);
  return clean;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, 1, max);
}

function optionalUuid(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !UUID.test(value))
    throw invalid(field, "must be a valid identifier");
  return value;
}

function invalid(field: string, reason: string) {
  return new DispatchError(400, "BAD_REQUEST", "Invalid request data.", {
    field,
    reason,
  });
}

export async function jsonBody(request: Request, maxBytes = 32_768) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw invalid("body", "is too large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes)
    throw invalid("body", "is too large");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw invalid("body", "must contain valid JSON");
  }
}

export function validateJob(input: Record<string, unknown>): JobInput {
  const date = text(input.serviceDate, "serviceDate", 10, 40);
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime()))
    throw invalid("serviceDate", "is invalid");
  const revenue = input.revenue === undefined ? 0 : Number(input.revenue);
  if (!Number.isFinite(revenue) || revenue < 0 || revenue > 10_000_000)
    throw invalid("revenue", "must be between 0 and 10,000,000");
  return {
    serviceType: text(input.serviceType, "serviceType", 2, 120),
    serviceDate: parsed.toISOString(),
    address: text(input.address, "address", 5, 300),
    customerId: optionalUuid(input.customerId, "customerId"),
    customerNotes: optionalText(input.customerNotes, "customerNotes", 4_000),
    leadSource: optionalText(input.leadSource, "leadSource", 120),
    revenue: Math.round(revenue * 100) / 100,
    assignedTechId: optionalUuid(input.assignedTechId, "assignedTechId"),
  };
}

export function validateLocation(input: Record<string, unknown>) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const accuracyMeters = Number(input.accuracyMeters ?? 0);
  const recordedAt = new Date(
    String(input.recordedAt || new Date().toISOString()),
  );
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    throw invalid("latitude", "must be between -90 and 90");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    throw invalid("longitude", "must be between -180 and 180");
  if (
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0 ||
    accuracyMeters > 10_000
  )
    throw invalid("accuracyMeters", "is outside the supported range");
  if (Number.isNaN(recordedAt.getTime()))
    throw invalid("recordedAt", "is invalid");
  if (recordedAt.getTime() > Date.now() + 5 * 60_000)
    throw invalid("recordedAt", "cannot be in the future");
  return {
    latitude,
    longitude,
    accuracyMeters,
    recordedAt: recordedAt.toISOString(),
  };
}

export function validateSms(input: Record<string, unknown>) {
  const from = text(input.from, "from", 8, 18);
  if (!PHONE.test(from)) throw invalid("from", "must be in E.164 format");
  return {
    from,
    body: text(input.body, "body", 1, 1_600),
    providerMessageId: text(
      input.providerMessageId,
      "providerMessageId",
      4,
      160,
    ),
  };
}
