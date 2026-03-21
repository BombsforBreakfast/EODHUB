"use client";

import { useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useRouter } from "next/navigation";

const TECH_OPTIONS = [
  "Military EOD",
  "UXO Technician",
  "Civilian Bomb Tech",
];

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [techTypes, setTechTypes] = useState<string[]>([]);

  function toggleTech(type: string) {
    if (techTypes.includes(type)) {
      setTechTypes(techTypes.filter((t) => t !== type));
    } else {
      setTechTypes([...techTypes, type]);
    }
  }

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Login error: " + error.message);
      return;
    }

    router.push("/");
  }

  async function handleSignup() {
  if (!firstName || !lastName || techTypes.length === 0) {
    alert("Please complete all required fields.");
    return;
  }

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    alert("Signup error: " + signUpError.message);
    return;
  }

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData.user) {
    alert("Sign-in after signup failed: " + (signInError?.message ?? "No user"));
    return;
  }

  // small delay to let the auth trigger create the profile row
  await new Promise((resolve) => setTimeout(resolve, 500));

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      tech_types: techTypes,
      verification_status: "pending",
    })
    .eq("user_id", signInData.user.id);

  if (profileError) {
    alert("Profile setup error: " + profileError.message);
    return;
  }

  alert("Signup complete. Awaiting verification.");
  router.push("/profile");
}

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        {mode === "login" ? "Login" : "Sign Up"}
      </h1>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        />

        {mode === "signup" && (
          <>
            <input
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
              }}
            />

            <input
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
              }}
            />

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Tech Type (select all that apply)
              </div>

              {TECH_OPTIONS.map((type) => (
                <label
                  key={type}
                  style={{ display: "block", marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={techTypes.includes(type)}
                    onChange={() => toggleTech(type)}
                  />{" "}
                  {type}
                </label>
              ))}
            </div>
          </>
        )}

        {mode === "login" ? (
          <>
            <button
              onClick={handleLogin}
              style={buttonPrimary}
            >
              Login
            </button>

            <button
              onClick={() => setMode("signup")}
              style={buttonSecondary}
            >
              Need an account? Sign Up
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSignup}
              style={buttonPrimary}
            >
              Complete Signup
            </button>

            <button
              onClick={() => setMode("login")}
              style={buttonSecondary}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const buttonPrimary = {
  padding: 12,
  borderRadius: 12,
  border: "none",
  background: "black",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const buttonSecondary = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid black",
  background: "white",
  fontWeight: 700,
  cursor: "pointer",
};