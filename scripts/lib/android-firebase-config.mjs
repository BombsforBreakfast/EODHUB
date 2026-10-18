/** Validate Firebase identity before installing config or building an Android release. */
export function validateAndroidFirebaseConfig(content, expectedProject = "") {
  let config;
  try {
    config = JSON.parse(content);
  } catch {
    throw new Error("Android Firebase config must be valid google-services.json.");
  }
  const clients = Array.isArray(config?.client) ? config.client : [];
  const client = clients.find(
    (item) => item?.client_info?.android_client_info?.package_name === "com.eodhub.app",
  );
  const keys = Array.isArray(client?.api_key) ? client.api_key : [];
  if (!config?.project_info?.project_id || !config.project_info.project_number ||
      !client?.client_info?.mobilesdk_app_id || !keys.some((key) => key?.current_key)) {
    throw new Error("Android Firebase config must contain a complete client for com.eodhub.app.");
  }
  if (expectedProject && config.project_info.project_id !== expectedProject) {
    throw new Error("Android Firebase project does not match EODHUB_FIREBASE_PROJECT_ID.");
  }
  return config;
}
