import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import {
  resolveActivePluginHttpRouteRegistry,
  resetPluginRuntimeStateForTest,
  setActivePluginRegistry,
} from "../plugins/runtime.js";
import {
  loadGatewayStartupPlugins,
  reloadDeferredGatewayPlugins,
} from "./server-plugin-bootstrap.js";
import { resolveGatewayRuntimeConfig } from "./server-runtime-config.js";
import { createGatewayRuntimeState } from "./server-runtime-state.js";
import { createTestRegistry } from "./server/__tests__/test-utils.js";

describe("dynamic workspace plugin route dispatch", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTest();
  });

  afterEach(() => {
    resetPluginRuntimeStateForTest();
  });

  it("does not pin HTTP routes unconditionally at startup, allowing dynamic plugins to surface routes", async () => {
    const startupRegistry = createTestRegistry({ httpRoutes: [] });

    const testLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

    // Emulate gateway startup
    await createGatewayRuntimeState({
      cfg: { gateway: {} },
      bindHost: "127.0.0.1",
      port: 0,
      controlUiEnabled: false,
      controlUiBasePath: "/",
      openAiChatCompletionsEnabled: false,
      openResponsesEnabled: false,
      resolvedAuth: { mode: "none" },
      getResolvedAuth: () => ({ mode: "none" }),
      hooksConfig: () => null,
      getHookClientIpConfig: () => ({}),
      pluginRegistry: startupRegistry,
      pinChannelRegistry: false,
      deps: {
        openBrowser: vi.fn(),
        clearUserStorage: vi.fn(),
        versionName: "test",
        versionBuild: 0,
        versionDisplay: "test",
        platformDisplay: "test",
      },
      canvasRuntime: {
        getMemoryIndex: () => {
          throw new Error("not implemented");
        },
        getSharedIndex: () => {
          throw new Error("not implemented");
        },
      },
      canvasHostEnabled: false,
      logCanvas: testLog,
      log: testLog,
      logHooks: testLog,
      logPlugins: testLog,
    });

    // Simulating the dynamic loading of a workspace plugin that registers an HTTP route
    const dynamicRegistry = createTestRegistry({
      httpRoutes: [
        {
          path: "/plugins/webhooks/test",
          match: "exact",
          auth: "plugin",
          pluginId: "test-workspace-plugin",
          handler: vi.fn(),
        },
      ],
    });

    setActivePluginRegistry(dynamicRegistry);

    const activeRouteRegistry = resolveActivePluginHttpRouteRegistry(dynamicRegistry);

    expect(activeRouteRegistry.httpRoutes).toHaveLength(1);
    expect(activeRouteRegistry.httpRoutes?.[0].path).toBe("/plugins/webhooks/test");
  });
});
