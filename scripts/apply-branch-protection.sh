#!/usr/bin/env bash
set -euo pipefail

repo="lahlah-io/lahlah"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
policy="$root/.github/branch-protection.json"

for branch in main test; do
  gh api --method PUT "repos/$repo/branches/$branch/protection" --input "$policy" >/dev/null
  gh api "repos/$repo/branches/$branch/protection" --jq '{required_status_checks, required_pull_request_reviews, enforce_admins, allow_force_pushes, allow_deletions}'
  echo "Proteksi $branch aktif."
done
