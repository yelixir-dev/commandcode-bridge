import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

function readScript(name: string): string {
  return readFileSync(join(repoRoot, name), "utf8");
}

describe("installer scripts", () => {
  it("ships executable install and uninstall scripts", () => {
    for (const name of ["install.sh", "uninstall.sh"]) {
      const script = readScript(name);
      expect(script.startsWith("#!/usr/bin/env bash")).toBe(true);
      expect(statSync(join(repoRoot, name)).mode & 0o111).not.toBe(0);
    }
  });

  it("defaults to localhost on port 9992 and only offers safe bind host choices", () => {
    const script = readScript("install.sh");

    expect(script).toContain('DEFAULT_HOST="127.0.0.1"');
    expect(script).toContain('DEFAULT_PORT="9992"');
    expect(script).toContain("127.0.0.1");
    expect(script).toContain("0.0.0.0");
    expect(script).toContain('case "$HOST" in');
  });

  it("installs a user systemd service backed by a private env file", () => {
    const script = readScript("install.sh");

    expect(script).toContain("~/.config/commandcode-bridge/env");
    expect(script).toContain("systemctl --user enable --now commandcode-bridge");
    expect(script).toContain("WorkingDirectory=%h/.local/share/commandcode-bridge");
    expect(script).toContain("EnvironmentFile=%h/.config/commandcode-bridge/env");
    expect(script).toContain("write_env_line BRIDGE_API_KEY");
    expect(script).toContain("write_env_line COMMANDCODE_ALLOWED_MODELS");
    expect(script).toContain("read -rs key_input");
    expect(script).toContain("refusing unexpected INSTALL_DIR");
  });

  it("uninstaller stops the user service and preserves credentials by default", () => {
    const script = readScript("uninstall.sh");

    expect(script).toContain("systemctl --user disable --now commandcode-bridge");
    expect(script).toContain("REMOVE_CONFIG=0");
    expect(script).toContain("--purge-config");
    expect(script).toContain("~/.config/commandcode-bridge/env");
  });
});
