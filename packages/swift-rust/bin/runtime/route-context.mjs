const AsyncLocalStorageImpl =
  globalThis.AsyncLocalStorage ?? globalThis.process?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage;
if (AsyncLocalStorageImpl && !globalThis.__SR_ROUTE_CTX_STORE__) {
  globalThis.__SR_ROUTE_CTX_STORE__ = new AsyncLocalStorageImpl();
}
const routeCtxStore = globalThis.__SR_ROUTE_CTX_STORE__ ?? null;

/**
 * Backs globalThis.__SR_ROUTE_CTX__ (read by useLoaderData() / useActionData())
 * with AsyncLocalStorage, so concurrent requests in one process never see each
 * other's context, even when a component suspends and resumes later.
 */
export function installRouteCtxBox() {
  const g = globalThis;
  if (!routeCtxStore || g.__SR_ROUTE_CTX__?.__perRequest) return;
  let fallback = null;
  g.__SR_ROUTE_CTX__ = {
    __perRequest: true,
    get current() {
      const slot = routeCtxStore.getStore();
      return slot ? slot.value : fallback;
    },
    set current(value) {
      const slot = routeCtxStore.getStore();
      if (slot) slot.value = value;
      else fallback = value;
    },
  };
}

/** Runs `fn` with its own route-context slot. */
export function runWithRouteContext(fn) {
  installRouteCtxBox();
  return routeCtxStore ? routeCtxStore.run({ value: null }, fn) : fn();
}
