# One-off: patch profile page for MasterShell
path = r"app/(master)/profile/[userId]/page.tsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

insert_import = 'import { useMasterShell } from "../../../components/master/masterShellContext";\n'
if insert_import not in "".join(lines[:30]):
    for i, line in enumerate(lines[:25]):
        if line.startswith("import DesktopLayout"):
            lines.insert(i + 1, insert_import)
            break

if "useMasterShell()" not in "".join(lines):
    for i, line in enumerate(lines):
        if "const [isMobile, setIsMobile]" in line:
            j = i
            while j < len(lines) and ");" not in lines[j]:
                j += 1
            lines.insert(j + 1, "  const { isDesktopShell, openSidebarPeer } = useMasterShell();\n")
            break

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.writelines(lines)

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

ret_idx = None
for i, line in enumerate(lines):
    if line == "  return (\n" and i > 2100:
        ret_idx = i
        break

start_center = None
end_center = None
for i, line in enumerate(lines):
    if "center={<div style={{ display: \"flex\", flexDirection: \"column\"" in line:
        start_center = i
        break
for i in range(start_center or 0, len(lines)):
    if lines[i].strip() == "</div>}":
        end_center = i
        break

if start_center is None or end_center is None:
    raise SystemExit(f"center block not found: {start_center} {end_center}")

block = lines[start_center : end_center + 1]
block[0] = block[0].replace("        center={", "        ", 1)
block[-1] = "      </div>\n"

func = ["  const renderProfileCenter = () => (\n"] + block + ["  );\n", "\n"]

new_lines = lines[:ret_idx] + func + lines[ret_idx:start_center] + ["        center={renderProfileCenter()}\n"] + lines[end_center + 1 :]

for i, line in enumerate(new_lines):
    if line.strip() == "{!loading && profile && <DesktopLayout":
        new_lines[i] = "      {!loading && profile && (\n        isDesktopShell && !isMobile ? (\n          renderProfileCenter()\n        ) : (\n        <DesktopLayout\n"
        break

for i in range(len(new_lines) - 1, -1, -1):
    if new_lines[i].strip() == "/>}":
        new_lines[i] = "      />\n        )\n      )}\n"
        break

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.writelines(new_lines)

print("ok", len(new_lines))
