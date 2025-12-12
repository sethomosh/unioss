#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%F_%H%M%S)
OUTDIR="$HOME/unioss-backups/$TS"
mkdir -p "$OUTDIR"

echo "1) git snapshot"
git add -A
git commit -m "backup: pre-wipe snapshot $TS" || echo "nothing to commit"
git push || echo "git push may have failed — check remote"

echo "2) dump mysql"
mkdir -p "$OUTDIR/sql"
docker exec -i unioss-db-1 mysqldump -u root -p'StrongRootP@ssw0rd' --single-transaction --routines --events --hex-blob unioss > "$OUTDIR/sql/unioss.sql"
gzip -f "$OUTDIR/sql/unioss.sql"

echo "3) export volumes"
mkdir -p "$OUTDIR/volumes"
# list volumes to back up here:
VOLUMES=(unioss_dbdata unioss_uploads)
for v in "${VOLUMES[@]}"; do
  echo " - backing up volume $v"
  docker run --rm -v "${v}":/data -v "$OUTDIR/volumes":/backup alpine sh -c "cd /data && tar czf /backup/${v}.tgz ."
done

echo "4) save images"
mkdir -p "$OUTDIR/images"
# change image names as appropriate
IMAGES=(unioss_backend:latest unioss_frontend:latest)
for i in "${IMAGES[@]}"; do
  name=$(echo $i | sed 's/[:\/]/_/g')
  docker image inspect "$i" >/dev/null 2>&1 && docker save -o "$OUTDIR/images/${name}.tar" "$i" || echo "image $i not found"
done

echo "5) copy important config"
cp -v docker-compose.yml "$OUTDIR/" || true
cp -v .env "$OUTDIR/" || true
cp -v compute_thresholds.sql "$OUTDIR/" || true

echo "6) final archive"
cd "$OUTDIR/.."
tar czf "$HOME/unioss-backups/unioss-full-backup-$TS.tgz" "$TS"
sha256sum "$HOME/unioss-backups/unioss-full-backup-$TS.tgz" > "$HOME/unioss-backups/unioss-full-backup-$TS.sha256"

echo "backup complete: $HOME/unioss-backups/unioss-full-backup-$TS.tgz"
