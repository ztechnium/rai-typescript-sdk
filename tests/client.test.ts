import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  API_RANGE,
  Decision,
  RAIClient,
  RAIError,
  SDK_VERSION,
} from "../dist/index";

type FetchHandler = (
  url: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string" ? input : input.toString();
}

function requestHeaders(init?: RequestInit): Record<string, string> {
  return (init?.headers as Record<string, string>) ?? {};
}

describe("@ztechnium/rai-sdk", () => {
  let fetchMock: ReturnType<typeof mock.fn<FetchHandler>>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = mock.fn<FetchHandler>();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.reset();
  });

  describe("exports", () => {
    it("exposes SDK_VERSION and API_RANGE", () => {
      assert.equal(SDK_VERSION, "0.1.1");
      assert.match(API_RANGE, /^>=1\.0\.0,<2\.0\.0$/);
    });
  });

  describe("RAIClient construction", () => {
    it("normalizes baseUrl and applies defaults", () => {
      const client = new RAIClient({
        baseUrl: "https://rai.example.com/",
        apiKey: "rai_test_key",
        integrationId: "integration-1",
      });

      assert.equal(client.baseUrl, "https://rai.example.com");
      assert.equal(client.apiKey, "rai_test_key");
      assert.equal(client.integrationId, "integration-1");
      assert.equal(client.timeoutMs, 30_000);
      assert.equal(client.failClosed, true);
      assert.equal(client.sdkVersion, SDK_VERSION);
    });

    it("accepts custom timeout, failClosed, and sdkVersion", () => {
      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
        timeoutMs: 5_000,
        failClosed: false,
        sdkVersion: "9.9.9",
      });

      assert.equal(client.timeoutMs, 5_000);
      assert.equal(client.failClosed, false);
      assert.equal(client.sdkVersion, "9.9.9");
    });
  });

  describe("health and heartbeat", () => {
    it("calls health without auth headers", async () => {
      fetchMock.mock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        assert.equal(requestUrl(url), "https://rai.example.com/sdk/v1/health");
        assert.equal(init?.method, "GET");
        const headers = requestHeaders(init);
        assert.equal(headers["X-RAI-Agent-Key"], undefined);
        assert.match(headers["User-Agent"], /^rai-sdk-ts\//);
        assert.equal(headers["X-RAI-SDK-Version"], SDK_VERSION);
        return jsonResponse({ status: "ok" });
      });

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
      });

      const result = await client.health();
      assert.deepEqual(result, { status: "ok" });
      assert.equal(fetchMock.mock.callCount(), 1);
    });

    it("sends heartbeat payload with integration metadata", async () => {
      fetchMock.mock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        assert.equal(requestUrl(url), "https://rai.example.com/sdk/v1/heartbeat");
        assert.equal(init?.method, "POST");
        const headers = requestHeaders(init);
        assert.equal(headers["X-RAI-Agent-Key"], "key");
        assert.match(headers["User-Agent"], /^rai-sdk-ts\//);
        const body = JSON.parse(String(init?.body));
        assert.equal(body.integration_id, "integration-1");
        assert.equal(body.sdk_version, SDK_VERSION);
        assert.equal(body.protocol_version, 1);
        assert.deepEqual(body.capability_matrix, { authorize: true });
        return jsonResponse({ accepted: true });
      });

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
      });

      const result = await client.heartbeat({ authorize: true });
      assert.deepEqual(result, { accepted: true });
    });
  });

  describe("session lifecycle", () => {
    it("runs start → input → authorize → execution → output → end", async () => {
      const calls: Array<{ path: string; method: string; body?: unknown }> = [];

      fetchMock.mock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const fullUrl = requestUrl(url);
        const path = fullUrl.replace("https://rai.example.com", "");
        const body =
          init?.body !== undefined ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, method: init?.method ?? "GET", body });

        if (path === "/sdk/v1/sessions" && init?.method === "POST") {
          return jsonResponse({
            rai_session_id: "sess-1",
            trajectory_id: "traj-1",
            correlation_id: "corr-1",
          });
        }
        if (path === "/sdk/v1/sessions/sess-1/input") {
          return jsonResponse({ observed: true });
        }
        if (path === "/sdk/v1/sessions/sess-1/actions/authorize") {
          return jsonResponse({
            decision: "ALLOW",
            decision_id: "dec-1",
            reason_code: "POLICY_ALLOW",
          });
        }
        if (path === "/sdk/v1/actions/dec-1/execution") {
          return jsonResponse({ recorded: true });
        }
        if (path === "/sdk/v1/sessions/sess-1/output") {
          return jsonResponse({ output_observed: true });
        }
        if (path === "/sdk/v1/sessions/sess-1/end") {
          return jsonResponse({ ended: true });
        }

        return jsonResponse({}, 404);
      });

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
      });

      const session = await client.startSession({ channel: "sales-ai" });
      assert.equal(session.raiSessionId, "sess-1");
      assert.equal(session.trajectoryId, "traj-1");

      await session.observeInput({ content: "Create an order" });

      const decision = await session.authorizeAction({
        tool: "create_order",
        parameters: { amount: 100 },
        idempotencyKey: "idem-123",
      });
      assert.equal(decision.decision, "ALLOW");
      assert.equal(decision.allowed, true);
      assert.equal(decision.decisionId, "dec-1");

      await decision.reportExecution(client, { status: "SUCCEEDED" });
      await session.observeOutput({ content: "Order created" });
      await session.end();

      assert.deepEqual(
        calls.map((call) => call.path),
        [
          "/sdk/v1/sessions",
          "/sdk/v1/sessions/sess-1/input",
          "/sdk/v1/sessions/sess-1/actions/authorize",
          "/sdk/v1/actions/dec-1/execution",
          "/sdk/v1/sessions/sess-1/output",
          "/sdk/v1/sessions/sess-1/end",
        ]
      );
    });
  });

  describe("authorization decisions", () => {
    for (const [decisionValue, allowed] of [
      ["ALLOW", true],
      ["DENY", false],
      ["REQUIRE_APPROVAL", false],
    ] as const) {
      it(`maps ${decisionValue} to allowed=${String(allowed)}`, async () => {
        fetchMock.mock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
          if (
            requestUrl(url).endsWith("/actions/authorize") &&
            init?.method === "POST"
          ) {
            return jsonResponse({
              decision: decisionValue,
              decision_id: `dec-${decisionValue}`,
              reason_code: "TEST",
            });
          }
          if (requestUrl(url).endsWith("/sdk/v1/sessions")) {
            return jsonResponse({ rai_session_id: "sess-1" });
          }
          return jsonResponse({}, 404);
        });

        const client = new RAIClient({
          baseUrl: "https://rai.example.com",
          apiKey: "key",
          integrationId: "integration-1",
        });
        const session = await client.startSession();
        const decision = await session.authorizeAction({ tool: "test_tool" });

        assert.ok(decision instanceof Decision);
        assert.equal(decision.decision, decisionValue);
        assert.equal(decision.allowed, allowed);
      });
    }
  });

  describe("idempotency header", () => {
    it("forwards Idempotency-Key on authorizeAction", async () => {
      fetchMock.mock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const fullUrl = requestUrl(url);
        if (fullUrl.endsWith("/sdk/v1/sessions")) {
          return jsonResponse({ rai_session_id: "sess-1" });
        }
        if (fullUrl.endsWith("/actions/authorize")) {
          const headers = requestHeaders(init);
          assert.equal(headers["Idempotency-Key"], "idem-abc");
          const body = JSON.parse(String(init?.body));
          assert.equal(body.idempotency_key, "idem-abc");
          return jsonResponse({ decision: "ALLOW", decision_id: "dec-1" });
        }
        return jsonResponse({}, 404);
      });

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
      });
      const session = await client.startSession();
      await session.authorizeAction({
        tool: "create_order",
        idempotencyKey: "idem-abc",
      });
    });
  });

  describe("structured errors", () => {
    it("maps API error payloads to RAIError", async () => {
      fetchMock.mock.mockImplementation(async () =>
        jsonResponse(
          {
            detail: {
              error: "INVALID_CREDENTIAL",
              message: "Invalid agent key",
              retryable: false,
              details: { field: "X-RAI-Agent-Key" },
            },
          },
          401
        )
      );

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "bad-key",
        integrationId: "integration-1",
      });

      await assert.rejects(
        () => client.heartbeat(),
        (err: unknown) => {
          if (!(err instanceof RAIError)) return false;
          assert.equal(err.code, "INVALID_CREDENTIAL");
          assert.match(err.message, /Invalid agent key/);
          assert.equal(err.retryable, false);
          assert.equal(err.statusCode, 401);
          assert.deepEqual(err.details, { field: "X-RAI-Agent-Key" });
          return true;
        }
      );
    });
  });

  describe("timeouts and fail-closed behavior", () => {
    it("wraps AbortController timeouts as RAI_UNAVAILABLE when failClosed", async () => {
      fetchMock.mock.mockImplementation((_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        })
      );

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
        timeoutMs: 25,
        failClosed: true,
      });

      await assert.rejects(
        () => client.health(),
        (err: unknown) => {
          if (!(err instanceof RAIError)) return false;
          assert.equal(err.code, "RAI_UNAVAILABLE");
          assert.equal(err.retryable, true);
          assert.match(String(err.message), /RAI unavailable/);
          return true;
        }
      );
    });

    it("rethrows network errors when failClosed is false", async () => {
      const networkError = new TypeError("fetch failed");
      fetchMock.mock.mockImplementation(async () => {
        throw networkError;
      });

      const client = new RAIClient({
        baseUrl: "https://rai.example.com",
        apiKey: "key",
        integrationId: "integration-1",
        failClosed: false,
      });

      await assert.rejects(() => client.health(), networkError);
    });
  });
});
