#!/usr/bin/env bash
# Install the official GitHub CLI in the current user's home, with no sudo.
set -Eeuo pipefail
case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo 'Unsupported architecture' >&2; exit 1 ;;
esac
[[ "$(uname -s)" == Linux ]] || { echo 'This installer targets Linux Cloud Shell.' >&2; exit 1; }
for command in curl jq sha256sum tar install; do command -v "$command" >/dev/null; done
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 --retry 3 \
  https://api.github.com/repos/cli/cli/releases/latest > "$TEMP_DIR/release.json"
VERSION=$(jq -er '.tag_name | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$")) | ltrimstr("v")' "$TEMP_DIR/release.json")
ARCHIVE="gh_${VERSION}_linux_${ARCH}.tar.gz"
CHECKSUMS="gh_${VERSION}_checksums.txt"
for FILE in "$ARCHIVE" "$CHECKSUMS"; do
  URL=$(jq -er --arg name "$FILE" '.assets[] | select(.name==$name) | .browser_download_url' "$TEMP_DIR/release.json")
  [[ "$URL" == "https://github.com/cli/cli/releases/download/v$VERSION/$FILE" ]] || { echo 'Unexpected release URL' >&2; exit 1; }
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 --retry 3 "$URL" -o "$TEMP_DIR/$FILE"
done
EXPECTED=$(awk -v filename="$ARCHIVE" '$2 == filename {print $1}' "$TEMP_DIR/$CHECKSUMS")
[[ "$EXPECTED" =~ ^[a-f0-9]{64}$ ]] || { echo 'Missing/invalid published checksum' >&2; exit 1; }
(cd "$TEMP_DIR"; printf '%s  %s\n' "$EXPECTED" "$ARCHIVE" | sha256sum -c -)
MEMBER="gh_${VERSION}_linux_${ARCH}/bin/gh"
tar -xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR" "$MEMBER"
install -d "$HOME/.local/bin"
install -m 755 "$TEMP_DIR/$MEMBER" "$HOME/.local/bin/gh"
"$HOME/.local/bin/gh" --version
printf '\nInstalled successfully. Run: export PATH="$HOME/.local/bin:$PATH"\n'
