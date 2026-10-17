import assert from "node:assert/strict";
import test from "node:test";
import { validateAndroidFirebaseConfig } from "./lib/android-firebase-config.mjs";

function fixture(packageName = "com.eodhub.app") {
  return {
    project_info: { project_id: "eod-test", project_number: "123" },
    client: [{
      client_info: { mobilesdk_app_id: "1:123:android:test", android_client_info: { package_name: packageName } },
      api_key: [{ current_key: "test-only-key" }],
    }],
  };
}
test("accepts an EOD-HUB client even when it is not the first client", () => {
  const config = fixture("app.concertbuddy");
  config.client.push(...fixture().client);
  assert.equal(validateAndroidFirebaseConfig(JSON.stringify(config), "eod-test").project_info.project_id, "eod-test");
});
test("rejects another app's Firebase config", () => {
  assert.throws(() => validateAndroidFirebaseConfig(JSON.stringify(fixture("app.concertbuddy"))), /com.eodhub.app/);
});
test("rejects a project mismatch", () => {
  assert.throws(() => validateAndroidFirebaseConfig(JSON.stringify(fixture()), "different-project"), /EODHUB_FIREBASE_PROJECT_ID/);
});
test("rejects missing Firebase identity or API key", () => {
  const config = fixture();
  delete config.project_info.project_number;
  assert.throws(() => validateAndroidFirebaseConfig(JSON.stringify(config)), /complete client/);
  const withoutKey = fixture();
  withoutKey.client[0].api_key = [];
  assert.throws(() => validateAndroidFirebaseConfig(JSON.stringify(withoutKey)), /complete client/);
});
test("rejects malformed config safely", () => {
  for (const raw of ["not-json", "null", '{"client":{}}']) {
    assert.throws(() => validateAndroidFirebaseConfig(raw), /Firebase config/);
  }
});
