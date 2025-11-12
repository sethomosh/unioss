import re
import os

# SNMP type → snmpsim tag mapping
TYPE_MAP = {
    "INTEGER": "2",
    "Gauge32": "66",
    "Counter32": "65",
    "Counter64": "70",
    "Timeticks": "67",
    "OCTET STRING": "4",
    "STRING": "4",         
    "Opaque": "68",
    "IpAddress": "64",
}


def normalize_line(line: str) -> str:
    line = line.strip()
    if not line or line.startswith("#"):
        return None  # ignore empty/comment lines
    
    if line.startswith("{") and line.endswith("}"):
        return None

    # ✅ already valid (OID|TAG|VALUE)
    if "|" in line:
        return line

    # ✅ matches "OID = TYPE: value"
    match = re.match(r"^([\d\.]+)\s*=\s*([A-Za-z0-9 ]+):\s*(.*)$", line)
    if match:
        oid, type_name, value = match.groups()
        type_name = type_name.strip()
        tag = TYPE_MAP.get(type_name)
        if not tag:
            raise ValueError(f"Unknown SNMP type '{type_name}' in line: {line}")
        return f"{oid}|{tag}|{value}"

    raise ValueError(f"Unrecognized format: {line}")

def process_template(template_path, output_path, hostname, if_count):
    with open(template_path, "r") as f:
        lines = f.readlines()

    output_lines = []
    for line in lines:
        normalized = normalize_line(line)
        if not normalized:
            continue

        # placeholder replacements
        normalized = (
            normalized
            .replace("@hostname@", hostname)
            .replace("{SYSNAME}", hostname)
            .replace("{VENDOR}", "unisys")
            .replace("{IP}", hostname)  # or map to actual ip
        )

        # interface expansion
        if normalized.endswith(".@if@"):
            for i in range(1, if_count + 1):
                output_lines.append(normalized.replace(".@if@", f".{i}"))
        else:
            output_lines.append(normalized)

    with open(output_path, "w") as f:
        f.write("\n".join(output_lines))

def main():
    devices = [
        {"hostname": "tower3-rm1-02", "if_count": 4},
        {"hostname": "tower3-rm1-03", "if_count": 4},
        # add more...
    ]

    for device in devices:
        outfile = f"{device['hostname']}.snmprec"
        process_template(
            "snmp-sim/templates/public_template.snmprec", outfile,
            device["hostname"], device["if_count"]
        )
        print(f"[+] generated: {outfile}")

if __name__ == "__main__":
    main()
