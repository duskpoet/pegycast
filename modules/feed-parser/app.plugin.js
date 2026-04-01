const {
  AndroidConfig,
  withAndroidManifest,
} = require("expo/config-plugins");
const { mkdirSync, writeFileSync } = require("fs");
const { resolve } = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withNetworkSecurityConfig(config) {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults
    );
    mainApplication.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    const resXmlDir = resolve(
      config.modRequest.platformProjectRoot,
      "app/src/main/res/xml"
    );
    mkdirSync(resXmlDir, { recursive: true });
    writeFileSync(
      resolve(resXmlDir, "network_security_config.xml"),
      NETWORK_SECURITY_CONFIG
    );

    return config;
  });
}

module.exports = withNetworkSecurityConfig;