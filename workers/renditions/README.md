# laqta-renditions worker

Serves public image renditions from R2 at `https://laqta.syrian.zone/renditions/*`
so the single-domain deployment needs no image subdomain. Runs at Cloudflare's
edge (free R2 egress, edge-cached), so image traffic never touches the VPS.

## Deploy

```sh
cd workers/renditions

# One-time auth (pick one):
npx wrangler login                       # interactive browser OAuth, or
export CLOUDFLARE_API_TOKEN=<token>      # token with Workers Scripts:Edit + Workers R2 Storage:Edit

# Confirm bucket_name in wrangler.toml matches your R2_BUCKET, then:
npx wrangler deploy
```

## Verify

```sh
# Any existing rendition key (once a photo has been processed):
curl -I https://laqta.syrian.zone/renditions/<photoId>/medium.webp
# -> 200, content-type: image/webp, cache-control: immutable
```

## Notes

- Object keys mirror the URL path minus the leading slash — `renditionKey()` in
  `packages/storage` produces `renditions/<photoId>/<variant>.webp`.
- Only the `renditions/` prefix is exposed; `originals/*` stay private (served
  via signed URLs by the API).
- The R2 bucket does **not** need public access enabled — the worker reads it
  through the bound binding.
