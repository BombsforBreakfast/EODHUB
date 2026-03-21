"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/lib/supabaseClient";
import NavBar from "../../components/NavBar";

type Profile = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  role: string | null;
  resume_text: string | null;
  tech_types: string[] | string | null;
  verification_status: string | null;
};

type Post = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ConnectionType = "worked_with" | "know";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

export default function PublicProfilePage() {
  const params = useParams();

  const rawUserId = params?.userId;
  const userId =
    typeof rawUserId === "string"
      ? rawUserId
      : Array.isArray(rawUserId)
      ? rawUserId[0]
      : null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postContent, setPostContent] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);

  const [workedWithCount, setWorkedWithCount] = useState(0);
  const [knowCount, setKnowCount] = useState(0);

  const [currentUserWorkedWith, setCurrentUserWorkedWith] = useState(false);
  const [currentUserKnows, setCurrentUserKnows] = useState(false);
  const [togglingConnection, setTogglingConnection] = useState<ConnectionType | null>(null);

  async function loadProfile(targetUserId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, first_name, last_name, bio, photo_url, role, resume_text, tech_types, verification_status"
      )
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (error) {
      console.error("Profile load error:", error);
      return;
    }

    setProfile((data as Profile | null) ?? null);
  }

  async function loadPosts(targetUserId: string) {
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, content, created_at")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Profile posts load error:", error);
      return;
    }

    setPosts((data as Post[]) ?? []);
  }

  async function loadConnections(targetUserId: string, signedInUserId?: string | null) {
    const effectiveCurrentUserId = signedInUserId ?? currentUserId;

    const { data, error } = await supabase
      .from("profile_connections")
      .select("requester_user_id, target_user_id, connection_type")
      .eq("target_user_id", targetUserId);

    if (error) {
      console.error("Profile connections load error:", error);
      return;
    }

    const rows =
      (data as {
        requester_user_id: string;
        target_user_id: string;
        connection_type: ConnectionType;
      }[]) ?? [];

    const workedWithRows = rows.filter((row) => row.connection_type === "worked_with");
    const knowRows = rows.filter((row) => row.connection_type === "know");

    setWorkedWithCount(workedWithRows.length);
    setKnowCount(knowRows.length);

    if (!effectiveCurrentUserId) {
      setCurrentUserWorkedWith(false);
      setCurrentUserKnows(false);
      return;
    }

    setCurrentUserWorkedWith(
      workedWithRows.some((row) => row.requester_user_id === effectiveCurrentUserId)
    );

    setCurrentUserKnows(
      knowRows.some((row) => row.requester_user_id === effectiveCurrentUserId)
    );
  }

  async function submitPost() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (!userId || !postContent.trim()) return;

    try {
      setSubmittingPost(true);

      const { error } = await supabase.from("posts").insert([
        {
          user_id: currentUserId,
          content: postContent.trim(),
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      setPostContent("");
      await loadPosts(userId);
    } finally {
      setSubmittingPost(false);
    }
  }

  async function toggleConnection(type: ConnectionType) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (!userId || currentUserId === userId) return;

    const isActive = type === "worked_with" ? currentUserWorkedWith : currentUserKnows;

    try {
      setTogglingConnection(type);

      if (isActive) {
        const { error } = await supabase
          .from("profile_connections")
          .delete()
          .eq("requester_user_id", currentUserId)
          .eq("target_user_id", userId)
          .eq("connection_type", type);

        if (error) {
          alert(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("profile_connections").insert([
          {
            requester_user_id: currentUserId,
            target_user_id: userId,
            connection_type: type,
          },
        ]);

        if (error) {
          alert(error.message);
          return;
        }
      }

      await loadConnections(userId, currentUserId);
    } finally {
      setTogglingConnection(null);
    }
  }

  useEffect(() => {
    async function init() {
      if (!userId || userId === "undefined") {
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const signedInUserId = data.user?.id ?? null;
      setCurrentUserId(signedInUserId);

      await Promise.all([
        loadProfile(userId),
        loadPosts(userId),
        loadConnections(userId, signedInUserId),
      ]);

      setLoading(false);
    }

    init();
  }, [userId]);

  useEffect(() => {
    if (!userId || userId === "undefined") return;

    const postsChannel = supabase
      .channel(`profile-posts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => {
          loadPosts(userId);
        }
      )
      .subscribe();

    const connectionsChannel = supabase
      .channel(`profile-connections-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_connections" },
        () => {
          loadConnections(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(connectionsChannel);
    };
  }, [userId, currentUserId]);

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <NavBar />
        <div style={{ marginTop: 20 }}>Loading wall...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <NavBar />
        <div style={{ marginTop: 20 }}>Profile not found.</div>
      </div>
    );
  }

  const fullName =
    profile.display_name ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "User";

  const techTypesText = Array.isArray(profile.tech_types)
    ? profile.tech_types.join(", ")
    : profile.tech_types || "Not added yet";

  const isOwnWall = currentUserId === profile.user_id;
  const wastaScore = workedWithCount + knowCount;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <NavBar />

      <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
          }}
        >
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                overflow: "hidden",
                background: "#f3f4f6",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                color: "#666",
              }}
            >
              {profile.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt={fullName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                "Photo"
              )}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>
                {fullName}
              </h1>

              <div style={{ marginTop: 6, fontSize: 15, color: "#666" }}>
                {isOwnWall ? "My Wall" : "User Wall"}
              </div>

              <div style={{ marginTop: 10, color: "#555", lineHeight: 1.6 }}>
                <div>
                  <strong>Role:</strong> {profile.role || "Not added yet"}
                </div>
                <div>
                  <strong>Tech Types:</strong> {techTypesText}
                </div>
                <div>
                  <strong>Verification:</strong>{" "}
                  {profile.verification_status || "Not verified"}
                </div>
                <div>
                  <strong>Service:</strong> Not added yet
                </div>
                <div>
                  <strong>Years Experience:</strong> Not added yet
                </div>
                <div>
                  <strong>Unit History:</strong> Not added yet
                </div>
              </div>

              {profile.bio && (
                <div style={{ marginTop: 14, color: "#444", lineHeight: 1.6 }}>
                  {profile.bio}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginTop: 18,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>
                    {workedWithCount}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>Worked With</div>
                </div>

                <div>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{knowCount}</div>
                  <div style={{ fontSize: 13, color: "#666" }}>Know</div>
                </div>

                <div>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{wastaScore}</div>
                  <div style={{ fontSize: 13, color: "#666" }}>Wasta</div>
                </div>
              </div>

              {!isOwnWall && currentUserId && (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 18,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleConnection("worked_with")}
                    disabled={togglingConnection === "worked_with"}
                    style={{
                      background: currentUserWorkedWith ? "black" : "white",
                      color: currentUserWorkedWith ? "white" : "black",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor:
                        togglingConnection === "worked_with"
                          ? "not-allowed"
                          : "pointer",
                      opacity: togglingConnection === "worked_with" ? 0.7 : 1,
                    }}
                  >
                    {togglingConnection === "worked_with"
                      ? "Saving..."
                      : currentUserWorkedWith
                      ? "Worked With ✓"
                      : "Worked With"}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleConnection("know")}
                    disabled={togglingConnection === "know"}
                    style={{
                      background: currentUserKnows ? "black" : "white",
                      color: currentUserKnows ? "white" : "black",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor:
                        togglingConnection === "know" ? "not-allowed" : "pointer",
                      opacity: togglingConnection === "know" ? 0.7 : 1,
                    }}
                  >
                    {togglingConnection === "know"
                      ? "Saving..."
                      : currentUserKnows
                      ? "Know ✓"
                      : "Know"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900 }}>Photos</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginTop: 16,
            }}
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  background: "#f3f4f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#777",
                  fontWeight: 700,
                }}
              >
                Pinned Photo
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900 }}>Wall</div>

          {isOwnWall && (
            <div
              style={{
                marginTop: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 16,
              }}
            >
              <textarea
                placeholder="Post to your wall..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 80,
                  border: "none",
                  outline: "none",
                  resize: "vertical",
                  fontSize: 16,
                }}
              />

              <div style={{ marginTop: 10, textAlign: "right" }}>
                <button
                  onClick={submitPost}
                  disabled={submittingPost}
                  style={{
                    background: "black",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: submittingPost ? "not-allowed" : "pointer",
                    opacity: submittingPost ? 0.7 : 1,
                  }}
                >
                  {submittingPost ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          )}

          {!isOwnWall && (
            <div
              style={{
                marginTop: 16,
                color: "#666",
                fontSize: 14,
              }}
            >
              Viewing public wall posts.
            </div>
          )}

          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            {posts.length === 0 && (
              <div style={{ color: "#666" }}>No wall posts yet.</div>
            )}

            {posts.map((post) => (
              <div
                key={post.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 800 }}>{fullName}</div>
                <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>
                  {formatDate(post.created_at)}
                </div>
                <div style={{ marginTop: 10, lineHeight: 1.6 }}>
                  {post.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}