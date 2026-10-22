export const MINIMUM_BUN_VERSION = "1.3.0";

export function isSupportedBunVersion(version) {
  const current = String(version ?? "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const minimum = MINIMUM_BUN_VERSION.split(".").map((part) => Number.parseInt(part, 10));
  if (current.length < 3 || current.some((part) => Number.isNaN(part))) return false;
  for (let index = 0; index < minimum.length; index++) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

export function unsupportedBunMessage(version) {
  const found = version ? `found Bun ${version}` : "could not determine the installed version";
  return [
    `error[SR0073]: swift-rust requires Bun ${MINIMUM_BUN_VERSION} or newer`,
    `  = note: ${found}`,
    "  = help: upgrade Bun, then run the command again",
    "           bun upgrade",
  ].join("\n");
}
