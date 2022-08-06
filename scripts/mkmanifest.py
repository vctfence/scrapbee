import sys

template = sys.argv[1]
output = sys.argv[2]
version = sys.argv[3]

public = False
if len(sys.argv) > 4 and sys.argv[4] == "--public":
    public = True

with open(template, "r") as manifest_in:
    manifest_text = manifest_in.read()
    manifest_text = manifest_text.replace("$VERSION$", version)

    id_suffix = "-we" if public else ""
    manifest_text = manifest_text.replace("$ID_SUFFIX$", id_suffix)

    with open(output, "w") as manifest_out:
        manifest_out.write(manifest_text)
