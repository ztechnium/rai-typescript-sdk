/** Official TypeScript SDK for RAI Control Plane /sdk/v1 */

export const SDK_VERSION = "0.1.0";
export const API_RANGE = ">=1.0.0,<2.0.0";

export class RAIError extends Error {
  code: string;
  retryable: boolean;
  details: Record<string, unknown>;
  statusCode?: number;

  constructor(
    code: string,
    message: string,
    opts?: {
      retryable?: boolean;
      details?: Record<string, unknown>;
      statusCode?: number;
    }
  ) {
    super(`${code}: ${message}`);
    this.name = "RAIError";
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.details = opts?.details ?? {};
    this.statusCode = opts?.statusCode;
  }
}

export interface DecisionData {
  decision: string;
  decision_id?: string | null;
  reason_code?: string | null;
  human_message?: string | null;
  machine_reason?: string | null;
  approval_request_id?: string | null;
  enforcement_receipt_id?: string | null;
  retryable?: boolean;
  allowed?: boolean;
  [key: string]: unknown;
}

export class Decision {
  decision: string;
  decisionId?: string | null;
  reasonCode?: string | null;
  humanMessage?: string | null;
  machineReason?: string | null;
  approvalRequestId?: string | null;
  enforcementReceiptId?: string | null;
  retryable: boolean;
  raw: DecisionData;

  constructor(data: DecisionData) {
    this.decision = data.decision;
    this.decisionId = data.decision_id;
    this.reasonCode = data.reason_code;
    this.humanMessage = data.human_message;
    this.machineReason = data.machine_reason;
    this.approvalRequestId = data.approval_request_id;
    this.enforcementReceiptId = data.enforcement_receipt_id;
    this.retryable = Boolean(data.retryable);
    this.raw = data;
  }

  get allowed(): boolean {
    return this.decision === "ALLOW";
  }

  async reportExecution(
    client: RAIClient,
    opts: {
      status: string;
      externalExecutionId?: string;
      resultMetadata?: Record<string, unknown>;
      errorMetadata?: Record<string, unknown>;
    }
  ): Promise<Record<string, unknown>> {
    if (!this.decisionId) {
      throw new RAIError("INVALID_REQUEST", "Decision has no decision_id");
    }
    return client.reportExecution(this.decisionId, opts);
  }
}

export class Session {
  raiSessionId: string;
  trajectoryId?: string | null;
  correlationId?: string | null;
  raw: Record<string, unknown>;
  private client: RAIClient;

  constructor(client: RAIClient, data: Record<string, unknown>) {
    this.client = client;
    this.raiSessionId = String(data.rai_session_id);
    this.trajectoryId = (data.trajectory_id as string | null) ?? null;
    this.correlationId = (data.correlation_id as string | null) ?? null;
    this.raw = data;
  }

  observeInput(opts: {
    content?: string;
    contentType?: string;
    observedModel?: string;
    principal?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return this.client.request(
      "POST",
      `/sdk/v1/sessions/${this.raiSessionId}/input`,
      {
        content: opts.content,
        content_type: opts.contentType ?? "text",
        observed_model: opts.observedModel,
        principal: opts.principal,
        metadata: opts.metadata ?? {},
      }
    );
  }

  async authorizeAction(opts: {
    tool?: string;
    toolId?: string;
    target?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    amount?: number;
    currency?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    approvalRequestId?: string;
  }): Promise<Decision> {
    const data = (await this.client.request(
      "POST",
      `/sdk/v1/sessions/${this.raiSessionId}/actions/authorize`,
      {
        tool: opts.tool,
        tool_id: opts.toolId,
        target: opts.target,
        parameters: opts.parameters ?? {},
        amount: opts.amount,
        currency: opts.currency,
        idempotency_key: opts.idempotencyKey,
        metadata: opts.metadata ?? {},
        approval_request_id: opts.approvalRequestId,
      },
      opts.idempotencyKey
        ? { "Idempotency-Key": opts.idempotencyKey }
        : undefined
    )) as DecisionData;
    return new Decision(data);
  }

  observeOutput(opts: {
    content?: string;
    contentType?: string;
    observedModel?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return this.client.request(
      "POST",
      `/sdk/v1/sessions/${this.raiSessionId}/output`,
      {
        content: opts.content,
        content_type: opts.contentType ?? "text",
        observed_model: opts.observedModel,
        metadata: opts.metadata ?? {},
      }
    );
  }

  end(): Promise<Record<string, unknown>> {
    return this.client.request(
      "POST",
      `/sdk/v1/sessions/${this.raiSessionId}/end`
    );
  }
}

export interface RAIClientOptions {
  baseUrl: string;
  apiKey: string;
  integrationId: string;
  timeoutMs?: number;
  failClosed?: boolean;
  sdkVersion?: string;
}

export class RAIClient {
  baseUrl: string;
  apiKey: string;
  integrationId: string;
  timeoutMs: number;
  failClosed: boolean;
  sdkVersion: string;

  constructor(opts: RAIClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.integrationId = opts.integrationId;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.failClosed = opts.failClosed ?? true;
    this.sdkVersion = opts.sdkVersion ?? SDK_VERSION;
  }

  health(): Promise<Record<string, unknown>> {
    return this.request("GET", "/sdk/v1/health", undefined, undefined, false);
  }

  heartbeat(
    capabilityMatrix?: Record<string, boolean>
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/sdk/v1/heartbeat", {
      integration_id: this.integrationId,
      sdk_version: this.sdkVersion,
      protocol_version: 1,
      capability_matrix: capabilityMatrix,
    });
  }

  async startSession(opts?: {
    externalSessionId?: string;
    externalConversationId?: string;
    principal?: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Session> {
    const data = await this.request("POST", "/sdk/v1/sessions", {
      integration_id: this.integrationId,
      external_session_id: opts?.externalSessionId,
      external_conversation_id: opts?.externalConversationId,
      principal: opts?.principal,
      channel: opts?.channel,
      metadata: opts?.metadata ?? {},
    });
    return new Session(this, data);
  }

  reportExecution(
    decisionId: string,
    opts: {
      status: string;
      externalExecutionId?: string;
      resultMetadata?: Record<string, unknown>;
      errorMetadata?: Record<string, unknown>;
      usage?: Record<string, unknown>;
      cost?: Record<string, unknown>;
    }
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/sdk/v1/actions/${decisionId}/execution`, {
      status: opts.status,
      external_execution_id: opts.externalExecutionId,
      result_metadata: opts.resultMetadata ?? {},
      error_metadata: opts.errorMetadata,
      usage: opts.usage,
      cost: opts.cost,
    });
  }

  async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
    auth = true
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": `rai-sdk-ts/${this.sdkVersion}`,
        "X-RAI-SDK-Version": this.sdkVersion,
        ...(extraHeaders ?? {}),
      };
      if (auth) {
        headers["X-RAI-Agent-Key"] = this.apiKey;
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      const resp = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!resp.ok) {
        let detail: Record<string, unknown> = {};
        try {
          const payload = (await resp.json()) as Record<string, unknown>;
          detail = (payload.detail as Record<string, unknown>) ?? payload;
        } catch {
          detail = { message: await resp.text() };
        }
        throw new RAIError(
          String(detail.error ?? "INVALID_REQUEST"),
          String(detail.message ?? resp.statusText),
          {
            retryable: Boolean(detail.retryable),
            details: (detail.details as Record<string, unknown>) ?? {},
            statusCode: resp.status,
          }
        );
      }
      if (resp.status === 204) return {};
      return (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof RAIError) throw err;
      if (this.failClosed) {
        throw new RAIError("RAI_UNAVAILABLE", `RAI unavailable: ${String(err)}`, {
          retryable: true,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
