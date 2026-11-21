type JsonObject = Record<string, unknown>;

const recurringStatuses: Record<number, string> = {
  2: "active",
  3: "overdue",
  4: "expired",
  5: "cancelled",
  7: "pending_downgrade",
};

const paymentStatuses = new Map([
  ["payment.completed", "active"],
  ["payment.refunded", "refunded"],
  ["payment.dispute.opened", "disputed"],
  ["payment.dispute.lost", "chargeback"],
  ["payment.dispute.won", "active"],
]);

const terminalStatuses = new Set(["expired", "cancelled", "ended", "refunded", "chargeback"]);
const bodyLimit = 256 * 1024;
const encoder = new TextEncoder();

const object = (value: unknown): JsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;

const text = (value: unknown, limit: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : null;
};

const date = (value: unknown): string | null => {
  const candidate = text(value, 40);
  return candidate && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(candidate) && Number.isFinite(Date.parse(candidate)) ? candidate : null;
};

const statusId = (value: unknown): number | null => {
  const id = object(value)?.id;
  return typeof id === "number" && Number.isSafeInteger(id) && id >= 0 && id <= 2147483647 ? id : null;
};

const uuid = (value: unknown): string | null =>
  typeof value === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value) ? value.toLowerCase() : null;

const reference = (value: unknown, recurring: boolean): string | null => {
  const ref = text(value, 128);
  if (!ref) return null;
  return (recurring ? /^tbx-r-[\w-]+$/ : /^tbx-(?!r-)[\w-]+$/).test(ref) ? ref : null;
};

const checkoutEmail = (value: unknown): string | null => {
  const email = text(value, 254);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

function recurringStatus(type: string, id: number | null): string | undefined {
  const reported = id === null ? undefined : recurringStatuses[id];
  switch (type) {
    case "recurring-payment.cancellation.requested": return "pending_cancellation";
    case "recurring-payment.ended": return reported === "expired" || reported === "cancelled" ? reported : "ended";
    case "recurring-payment.started":
    case "recurring-payment.renewed":
    case "recurring-payment.cancellation.aborted": return reported ?? "active";
    case "recurring-payment.status.changed": return reported;
    default: return undefined;
  }
}

function subscriberRows(event: { id: string; type: string; occurredAt: string; subject: JsonObject }, packageIds: ReadonlySet<number>) {
  const { id, type, occurredAt, subject } = event;
  const recurring = type.startsWith("recurring-payment.");
  if (!recurring && subject.recurring_payment_reference != null) return [];
  const providerStatus = statusId(subject.status);
  const status = recurring ? recurringStatus(type, providerStatus) : paymentStatuses.get(type);
  if (!status) return [];

  const providerReference = reference(recurring ? subject.reference : subject.transaction_id, recurring);
  if (!providerReference) throw new Error("invalid-reference");
  const initial = recurring ? object(subject.initial_payment) : subject;
  const latest = recurring ? object(subject.last_payment) ?? initial : subject;
  const products = latest?.products ?? initial?.products;
  if (!Array.isArray(products)) throw new Error("missing-products");

  const customer = object(latest?.customer) ?? object(initial?.customer);
  const paymentMethod = text(object(initial?.payment_method ?? latest?.payment_method)?.name, 100);
  const rows = new Map<number, SubscriberRow>();
  for (const value of products) {
    const product = object(value);
    const packageId = product?.id;
    if (typeof packageId !== "number" || !packageIds.has(packageId)) continue;
    rows.set(packageId, {
      provider_reference: providerReference,
      package_id: packageId,
      billing_type: recurring ? "recurring" : "one_time",
      overwolf_user_id: uuid(object(product?.username)?.username) ?? uuid(object(customer?.username)?.username),
      checkout_email: checkoutEmail(customer?.email),
      status,
      provider_status_id: providerStatus,
      started_at: date(recurring ? subject.created_at : initial?.created_at),
      next_billing_at: recurring && !terminalStatuses.has(status) ? date(subject.next_payment_at) : null,
      latest_transaction_id: reference(latest?.transaction_id, false),
      is_test: paymentMethod === null ? null : /^test payments?$/i.test(paymentMethod),
      last_event_id: id,
      last_event_type: type,
      last_event_at: occurredAt,
      last_event_priority: terminalStatuses.has(status) ? 3 : status === "active" ? 1 : 2,
    });
  }
  return [...rows.values()];
}

export interface SubscriberRow {
  provider_reference: string;
  package_id: number;
  billing_type: "recurring" | "one_time";
  overwolf_user_id: string | null;
  checkout_email: string | null;
  status: string;
  provider_status_id: number | null;
  started_at: string | null;
  next_billing_at: string | null;
  latest_transaction_id: string | null;
  is_test: boolean | null;
  last_event_id: string;
  last_event_type: string;
  last_event_at: string;
  last_event_priority: number;
}

export function createTebexWebhook({ secret, packageIds, save }: {
  secret: string;
  packageIds: ReadonlySet<number>;
  save: (rows: SubscriberRow[]) => Promise<void>;
}) {
  const hmacKey = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (Number(request.headers.get("content-length")) > bodyLimit) return new Response(null, { status: 413 });
    const raw = await request.arrayBuffer();
    if (raw.byteLength > bodyLimit) return new Response(null, { status: 413 });

    let payload: JsonObject | undefined;
    try { payload = object(JSON.parse(new TextDecoder().decode(raw))); }
    catch { return new Response(null, { status: 400 }); }
    const id = text(payload?.id, 128);
    const type = text(payload?.type, 128);
    if (!id || !type) return new Response(null, { status: 400 });

    // Validation echoes an identifier and never reaches the database.
    if (type === "validation.webhook") return Response.json({ id });
    const header = request.headers.get("x-signature");
    if (!header || !/^[\da-f]{64}$/i.test(header)) return new Response(null, { status: 401 });
    const signature = Uint8Array.from(header.match(/../g)!, pair => Number.parseInt(pair, 16));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    if (!(await crypto.subtle.verify("HMAC", await hmacKey, signature, encoder.encode(hex)))) {
      return new Response(null, { status: 401 });
    }

    const occurredAt = date(payload?.date);
    const subject = object(payload?.subject);
    if (!occurredAt || !subject) return new Response(null, { status: 400 });
    let rows: SubscriberRow[];
    try { rows = subscriberRows({ id, type, occurredAt, subject }, packageIds); }
    catch { return new Response(null, { status: 400 }); }
    if (rows.length === 0) return new Response(null, { status: 204 });
    try { await save(rows); }
    catch { return new Response(null, { status: 503 }); }
    return new Response(null, { status: 204 });
  };
}
